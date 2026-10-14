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
  ) {
    super(code);
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
      const assertCurrent = () => {
        if (!deps.current()) throw new AlbumPrintError('CANCELLED');
      };
      try {
        assertCurrent();
        const first = await deps.read();
        assertCurrent();
        assertPrintContent(first);
        const fingerprint = albumReadingFingerprint(first);
        const fonts = deps.fonts();
        if (!fonts) throw new AlbumPrintError('UNAVAILABLE');
        id = deps.id();
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
          throw new AlbumPrintError('UNAVAILABLE');
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
        const layout = await deps.layout(frozen, style, fonts);
        assertCurrent();
        validatePrintLayout(layout);
        if (
          !albumLayoutIntegrity(layout, frozen).ok ||
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
        const pdf = await deps.store.writePdf(id, layout, map);
        assertCurrent();
        if (
          pdf.pageCount !== layout.pages.length ||
          pdf.bytes <= 0 ||
          !pdf.textSelectable ||
          Math.abs(pdf.widthPt - layout.pageSize.widthPt) > 0.1 ||
          Math.abs(pdf.heightPt - layout.pageSize.heightPt) > 0.1 ||
          !pdf.fontRunNames.length
        )
          throw new AlbumPrintError('INVALID_PDF');
        for (const source of sources) {
          await deps.store.verifySource(source.uri, source.hash);
          assertCurrent();
        }
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
        await deps.store.writeManifest(id, manifest);
        assertCurrent();
        const saved = await deps.store.commit(id);
        assertCurrent();
        return { ...saved, manifest };
      } catch (error) {
        if (id) {
          try {
            await deps.store.discard(id);
          } catch {
            throw new Error('PRINT_CLEANUP_FAILED');
          }
        }
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}
