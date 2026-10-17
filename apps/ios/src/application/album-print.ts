import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { albumLayoutIntegrity } from './album-layout-integrity';
import type { AlbumFontDiagnosis } from '../../modules/lampy-album-layout';
import type { AlbumLayout } from './album-layout';
import type {
  AlbumLayoutInput,
  AlbumLayoutMediaMap,
} from './album-layout-input';
import {
  albumReadingFingerprint,
  type AlbumReadingStyle,
} from './album-reading';

export const PRINT_EDITION_VERSION = 1;
export class AlbumPrintError extends Error {
  constructor(
    public readonly code:
      | 'CANCELLED'
      | 'SOURCE_CHANGED'
      | 'MISSING_CONTENT'
      | 'INVALID_PDF'
      | 'UNAVAILABLE',
    public readonly reason?: string,
  ) {
    super(code);
  }
}
export type PrintFailureDiagnostic = {
  stage: string;
  code: string;
  reason?: string;
};
const PRINT_ERROR_CODES = [
  'PURCHASE_REQUIRED','PURCHASE_VERIFICATION_UNAVAILABLE','FAMILY_ALBUM_EXPORT_CLOSED','FAMILY_ALBUM_CHANGED','FAMILY_ALBUM_INCOMPLETE','FAMILY_ALBUM_CANCELLED','FORBIDDEN','NOT_IN_FAMILY','UNAUTHENTICATED',
  'EXPORT_CLOSED','EXPORT_PURCHASE_REQUIRED','EXPORT_PURCHASE_UNAVAILABLE','EXPORT_CANCELLED',
  'CANCELLED',
  'SOURCE_CHANGED',
  'MISSING_CONTENT',
  'INVALID_PDF',
  'UNAVAILABLE',
  'PRINT_NATIVE_REBUILD_REQUIRED',
  'PRINT_ID_EXISTS',
  'PRINT_INVALID_ID',
  'PRINT_CLEANUP_FAILED',
  'PRINT_FILE_CHANGED',
  'PRINT_STORAGE_UNAVAILABLE',
  'LOCAL_FILE_REQUIRED',
  'INVALID_LAYOUT',
  'PDF_CREATE_FAILED',
  'IMAGE_UNREADABLE',
  'PDF_REOPEN_FAILED',
  'SHARE_UNAVAILABLE',
  'SHARE_FAILED',
];
export function printFailureDiagnostic(
  error: unknown,
  stage = 'UNKNOWN',
): PrintFailureDiagnostic {
  if (error instanceof AlbumPrintFailure) return error.diagnostic;
  const record =
    error && typeof error === 'object'
      ? (error as { code?: unknown; message?: unknown; reason?: unknown })
      : {};
  const code = PRINT_ERROR_CODES.find(code => record.code === code ||
    (typeof record.message === 'string' && record.message.split(/[^A-Z0-9_]+/).includes(code))) ??
    (typeof record.code === 'string' && /^ERR_[A-Z0-9_]{1,64}$/.test(record.code) ? record.code : 'PRINT_OPERATION_FAILED');
  const reason =
    typeof record.reason === 'string' &&
    /^(PDF_(PAGE_COUNT|BYTES|TEXT|TEXT_NATIVE_OLD|TEXT_V[34]_P[0-9]{1,6}_B[0-9]{1,6}_L[0-9]{1,6}_E[0-9]{1,6}_A[0-9]{1,6}|SIZE|FONT_RUNS)|LAYOUT_[A-Z_]+)$/.test(
      record.reason,
    )
      ? record.reason
      : undefined;
  return { stage, code, ...(reason ? { reason } : {}) };
}
export class AlbumPrintFailure extends Error {
  readonly code: string;
  constructor(readonly diagnostic: PrintFailureDiagnostic) {
    super(
      `${diagnostic.stage}: ${diagnostic.code}${diagnostic.reason ? ` (${diagnostic.reason})` : ''}`,
    );
    this.code = diagnostic.code;
  }
}
export type PrintMedia = {
  assetId: string;
  file: string;
  sha256: string;
  bytes: number;
};
export type PrintInspection = {
  pageCount: number;
  bytes: number;
  widthPt: number;
  heightPt: number;
  fontsEmbedded: boolean | null;
  fontResources: unknown[];
  textSelectable: boolean;
  nonColorTextSelectable?: boolean;
  emojiVisualCheckRequired?: boolean;
  colorGlyphRanges?: { page: number; block: number; line: number; startUTF16: number; endUTF16: number }[];
  textCheckRevision?: number;
  textCheckFailure?: string;
  fontRunNames: string[];
};
export type PrintManifest = {
  version: 1;
  id: string;
  createdAt: string;
  albumId: string;
  name: string;
  sourceFingerprint: string;
  style: AlbumReadingStyle;
  fonts: AlbumFontDiagnosis;
  content: AlbumLayoutInput;
  media: PrintMedia[];
  layout: AlbumLayout;
  imageDpi: { assetId: string; dpi: number | null }[];
  pdf: PrintInspection & { file: string; sha256: string };
};
export type PrintStore = {
  begin(id: string): Promise<void>;
  copy(
    id: string,
    assetId: string,
    source: string,
    index: number,
  ): Promise<PrintMedia & { uri: string }>;
  verifySource(uri: string, hash: string): Promise<void>;
  writePdf(
    id: string,
    layout: AlbumLayout,
    media: AlbumLayoutMediaMap,
  ): Promise<PrintInspection & { sha256: string }>;
  writeManifest(id: string, manifest: PrintManifest): Promise<void>;
  commit(id: string): Promise<{ pdfUri: string }>;
  discard(id: string): Promise<void>;
};
export function isAlbumPrintEvaluationOpen(
  isDev: boolean,
  value = process.env.EXPO_PUBLIC_ALBUM_PRINT_EVAL,
) {
  return isDev && value === '1';
}
export function assertPrintContent(input: AlbumLayoutInput) {
  if (
    !input.entries.length ||
    input.entries.some(
      (record) =>
        record.presence !== 'ready' ||
        record.media.some(
          (item) =>
            item.role === 'unknown' ||
            item.availability !== 'available' ||
            !item.uri,
        ),
    )
  ) {
    // First slice blocks missing input explicitly; no silent omission or fabricated source.
    throw new AlbumPrintError('MISSING_CONTENT');
  }
}
export function validatePrintLayout(layout: AlbumLayout) {
  if (!layout.pages.length) throw new AlbumPrintError('INVALID_PDF');
  for (const page of layout.pages)
    for (const block of page.blocks) {
      const b = block.box;
      if (
        ![b.xPt, b.yPt, b.widthPt, b.heightPt].every(Number.isFinite) ||
        b.xPt < 0 ||
        b.yPt < 0 ||
        b.widthPt <= 0 ||
        b.heightPt <= 0 ||
        b.xPt + b.widthPt > layout.pageSize.widthPt + 0.01 ||
        b.yPt + b.heightPt > layout.pageSize.heightPt + 0.01
      )
        throw new AlbumPrintError('INVALID_PDF');
    }
}
export function manifestDigest(manifest: PrintManifest) {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(manifest))));
}
export function createAlbumPrintService(deps: {
  read(): Promise<AlbumLayoutInput>;
  authorize?: () => Promise<void>;
  afterCommit?: () => Promise<void>;
  fonts(): AlbumFontDiagnosis | null;
  layout(
    input: AlbumLayoutInput,
    style: AlbumReadingStyle,
    fonts: AlbumFontDiagnosis,
  ): Promise<AlbumLayout>;
  store: PrintStore;
  current(): boolean;
  id(): string;
  now(): string;
}) {
  let busy = false;
  return {
    async save(style: AlbumReadingStyle) {
      if (busy) throw new AlbumPrintError('UNAVAILABLE');
      busy = true;
      let id: string | null = null;
      let stage = 'READ_SOURCE';
      const assertCurrent = () => {
        if (!deps.current()) throw new AlbumPrintError('CANCELLED');
      };
      try {
        assertCurrent();
        stage = 'AUTHORIZE_EXPORT';
        await deps.authorize?.();
        assertCurrent();
        stage = 'READ_SOURCE';
        const first = await deps.read();
        assertCurrent();
        stage = 'CHECK_INPUT';
        assertPrintContent(first);
        const fingerprint = albumReadingFingerprint(first);
        stage = 'FONT_DIAGNOSIS';
        const fonts = deps.fonts();
        if (!fonts) throw new AlbumPrintError('UNAVAILABLE');
        id = deps.id();
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
          throw new AlbumPrintError('UNAVAILABLE');
        stage = 'BEGIN_STORAGE';
        await deps.store.begin(id);
        assertCurrent();
        const frozen: AlbumLayoutInput = JSON.parse(JSON.stringify(first));
        const media: PrintMedia[] = [];
        const map: AlbumLayoutMediaMap = {};
        const sources: { uri: string; hash: string }[] = [];
        const copied = new Map<string, PrintMedia>();
        for (const record of frozen.entries)
          for (const item of record.media) {
            const source = item.uri!;
            let copy = copied.get(item.assetId);
            if (!copy) {
              stage = 'COPY_MEDIA';
              const result = await deps.store.copy(
                id,
                item.assetId,
                source,
                media.length,
              );
              assertCurrent();
              copy = {
                assetId: item.assetId,
                file: result.file,
                sha256: result.sha256,
                bytes: result.bytes,
              };
              media.push(copy);
              copied.set(item.assetId, copy);
              map[item.assetId] = result.uri;
            }
            sources.push({ uri: source, hash: copy.sha256 });
            // Serialized snapshot uses relative copies only, never the author's original path.
            item.uri = copy.file;
          }
        stage = 'LAYOUT';
        const layout = await deps.layout(frozen, style, fonts);
        assertCurrent();
        stage = 'LAYOUT_CHECK';
        validatePrintLayout(layout);
        const integrity = albumLayoutIntegrity(layout, frozen);
        if (!integrity.ok)
          throw new AlbumPrintError(
            'INVALID_PDF',
            `LAYOUT_${integrity.reason.replace(/-/g, '_').toUpperCase()}`,
          );
        if (
          layout.pages
            .flatMap((page) => page.blocks)
            .filter((block) => block.kind === 'cover-name')
            .map((block) => ('text' in block ? block.text : ''))
            .join('') !== frozen.album.name ||
          layout.pages
            .flatMap((page) => page.blocks)
            .filter((block) => block.kind === 'opening')
            .map((block) => ('text' in block ? block.text : ''))
            .join('') !== (frozen.album.opening ?? '')
        )
          throw new AlbumPrintError('INVALID_PDF');
        stage = 'WRITE_PDF';
        const pdf = await deps.store.writePdf(id, layout, map);
        assertCurrent();
        stage = 'PDF_CHECK';
        if (pdf.pageCount !== layout.pages.length)
          throw new AlbumPrintError('INVALID_PDF', 'PDF_PAGE_COUNT');
        if (pdf.bytes <= 0)
          throw new AlbumPrintError('INVALID_PDF', 'PDF_BYTES');
        if (!pdf.textSelectable && !(pdf.textCheckRevision === 4 &&
          pdf.nonColorTextSelectable === true && pdf.emojiVisualCheckRequired === true &&
          (pdf.colorGlyphRanges?.length ?? 0) > 0))
          throw new AlbumPrintError('INVALID_PDF',
            pdf.textCheckRevision !== 4 ? 'PDF_TEXT_NATIVE_OLD' :
              pdf.textCheckFailure || 'PDF_TEXT');
        if (
          Math.abs(pdf.widthPt - layout.pageSize.widthPt) > 0.1 ||
          Math.abs(pdf.heightPt - layout.pageSize.heightPt) > 0.1
        )
          throw new AlbumPrintError('INVALID_PDF', 'PDF_SIZE');
        if (!pdf.fontRunNames.length)
          throw new AlbumPrintError('INVALID_PDF', 'PDF_FONT_RUNS');
        stage = 'VERIFY_MEDIA';
        for (const source of sources) {
          await deps.store.verifySource(source.uri, source.hash);
          assertCurrent();
        }
        stage = 'RECHECK_SOURCE';
        const after = await deps.read();
        assertCurrent();
        if (albumReadingFingerprint(after) !== fingerprint)
          throw new AlbumPrintError('SOURCE_CHANGED');
        const manifest: PrintManifest = {
          version: 1,
          id,
          createdAt: deps.now(),
          albumId: first.album.id,
          name: first.album.name,
          sourceFingerprint: fingerprint,
          style,
          fonts,
          content: frozen,
          media,
          layout,
          imageDpi: layout.pages
            .flatMap((page) => page.blocks)
            .filter(
              (block) => block.kind === 'image' || block.kind === 'cover-image',
            )
            .map((block) => {
              const assetId = 'assetId' in block ? block.assetId : '';
              const item = frozen.entries
                .flatMap((record) => record.media)
                .find((item) => item.assetId === assetId);
              return {
                assetId,
                dpi:
                  item?.widthPx && item.heightPx
                    ? Math.min(
                        (item.widthPx * 72) / block.box.widthPt,
                        (item.heightPx * 72) / block.box.heightPt,
                      )
                    : null,
              };
            }),
          pdf: { ...pdf, file: 'album.pdf' },
        };
        stage = 'WRITE_MANIFEST';
        await deps.store.writeManifest(id, manifest);
        assertCurrent();
        stage = 'AUTHORIZE_EXPORT';
        await deps.authorize?.();
        assertCurrent();
        stage = 'COMMIT';
        const saved = await deps.store.commit(id);
        assertCurrent();
        stage = 'AUTHORIZE_DELIVERY';
        await deps.afterCommit?.();
        assertCurrent();
        return { ...saved, manifest };
      } catch (error) {
        if (id) {
          try {
            await deps.store.discard(id);
          } catch {
            throw new AlbumPrintFailure({
              stage: 'CLEANUP',
              code: 'PRINT_CLEANUP_FAILED',
            });
          }
        }
        throw new AlbumPrintFailure(printFailureDiagnostic(error, stage));
      } finally {
        busy = false;
      }
    },
  };
}
