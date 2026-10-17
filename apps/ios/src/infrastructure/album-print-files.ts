import {albumExportAccess} from './album-export-purchases';
import * as FileSystem from 'expo-file-system/legacy';
import {
  albumPrintNative,
  diagnoseAlbumFonts,
  measureTextNative,
} from '../../modules/lampy-album-layout';
import { getUseCases } from '../application/container';
import {
  createAlbumPrintService,
  manifestDigest,
  type PrintManifest,
  type PrintStore,
} from '../application/album-print';
import { paginateAlbumLayout } from '../application/album-paginate';
import { ALBUM_SERIF_FONT, ALBUM_UI_FONT } from '../application/album-layout';
import { ALBUM_READING_STYLES } from '../application/album-reading';
function root() {
  if (!FileSystem.documentDirectory)
    throw new Error('PRINT_STORAGE_UNAVAILABLE');
  return `${FileSystem.documentDirectory}album-print-evaluation/`;
}
let preparing: Promise<void> | null = null;
async function prepare() {
  if (!preparing)
    preparing = (async () => {
      await FileSystem.makeDirectoryAsync(root(), { intermediates: true });
      for (const name of await FileSystem.readDirectoryAsync(root()))
        if (/^\.building-[a-zA-Z0-9_-]+$/.test(name))
          await FileSystem.deleteAsync(`${root()}${name}`, {
            idempotent: true,
          });
    })().catch((error) => {
      preparing = null;
      throw error;
    });
  await preparing;
}
function directory(id: string, building = true) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('PRINT_INVALID_ID');
  return `${root()}${building ? '.building-' : ''}${id}/`;
}
export function createExpoAlbumPrintStore(): PrintStore {
  const owned = new Set<string>();
  const published = new Set<string>();
  return {
    async begin(id) {
      await prepare();
      if (
        (await FileSystem.getInfoAsync(directory(id, false))).exists ||
        (await FileSystem.getInfoAsync(directory(id))).exists
      )
        throw new Error('PRINT_ID_EXISTS');
      await FileSystem.makeDirectoryAsync(directory(id));
      owned.add(id);
    },
    async copy(id, assetId, source, index) {
      const file = `media-${index}`;
      const uri = `${directory(id)}${file}`;
      const result = await albumPrintNative().copyPrintMedia(source, uri);
      return {
        assetId,
        file,
        uri: decodeURIComponent(uri.replace(/^file:\/\//, '')),
        ...result,
      };
    },
    async verifySource(uri, expected) {
      if ((await albumPrintNative().printFileDigest(uri)).sha256 !== expected)
        throw new Error('SOURCE_CHANGED');
    },
    async writePdf(id, layout, media) {
      return albumPrintNative().writePrintPdf(
        JSON.stringify(layout),
        JSON.stringify(media),
        `${directory(id)}album.pdf`,
      );
    },
    async writeManifest(id, manifest) {
      await FileSystem.writeAsStringAsync(
        `${directory(id)}manifest.json`,
        JSON.stringify(manifest),
      );
      await FileSystem.writeAsStringAsync(
        `${directory(id)}manifest.sha256`,
        manifestDigest(manifest),
      );
    },
    async commit(id) {
      await FileSystem.moveAsync({
        from: directory(id),
        to: directory(id, false),
      });
      published.add(id);
      return { pdfUri: `${directory(id, false)}album.pdf` };
    },
    async discard(id) {
      if (!owned.has(id)) return;
      const jobs = [
        FileSystem.deleteAsync(directory(id), { idempotent: true }),
      ];
      if (published.has(id))
        jobs.push(
          FileSystem.deleteAsync(directory(id, false), { idempotent: true }),
        );
      const results = await Promise.allSettled(jobs);
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('PRINT_CLEANUP_FAILED');
      owned.delete(id);
      published.delete(id);
    },
  };
}
export function createExpoAlbumPrint(albumId: string, current: () => boolean) {
  return createAlbumPrintService({
    current,
    authorize:()=>albumExportAccess.assert(current),
    store: createExpoAlbumPrintStore(),
    id: () => `print_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    now: () => new Date().toISOString(),
    async read() {
      const app = await getUseCases();
      return (
        await app.readAlbumForContinuousReading(albumId, {
          privateUnlocked: current(),
        })
      ).input;
    },
    fonts: () => diagnoseAlbumFonts(ALBUM_SERIF_FONT, ALBUM_UI_FONT),
    async layout(input, style, fonts) {
      const layout = await paginateAlbumLayout(
        input,
        {
          kind: 'core-text',
          async measure(text, role, width) {
            const name =
              role.family === 'album-serif'
                ? fonts.serif.fontName
                : fonts.ui.fontName;
            return measureTextNative(
              text,
              name,
              role.sizePt,
              role.lineHeightPt,
              width,
            );
          },
        },
        {
          generatedAt: new Date().toISOString(),
          timezone: {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          },
        },
      );
      layout.fontFaces = {
        ...layout.fontFaces,
        serif: fonts.serif.fontName,
        ui: fonts.ui.fontName,
        resolvedSerif: fonts.serif,
        resolvedUi: fonts.ui,
      };
      layout.pages = layout.pages.map((page) => ({
        ...page,
        rendering: {
          ...page.rendering!,
          serif: fonts.serif.fontName,
          ui: fonts.ui.fontName,
          paper: ALBUM_READING_STYLES[style].paper,
          photoBorderWidth: ALBUM_READING_STYLES[style].photoBorderWidth,
        },
      }));
      return layout;
    },
  });
}
export type SavedPrintSummary = Pick<
  PrintManifest,
  'id' | 'name' | 'createdAt' | 'style' | 'pdf' | 'imageDpi'
>;
export function summarizePrint(manifest: PrintManifest): SavedPrintSummary {
  const { id, name, createdAt, style, pdf, imageDpi } = manifest;
  return { id, name, createdAt, style, pdf, imageDpi };
}
export async function listSavedAlbumPrints(
  albumId: string,
): Promise<SavedPrintSummary[]> {
  await prepare();
  const saved: SavedPrintSummary[] = [];
  for (const id of await FileSystem.readDirectoryAsync(root())) {
    if (!/^print_[a-zA-Z0-9_-]+$/.test(id)) continue;
    try {
      const manifest: PrintManifest = JSON.parse(
        await FileSystem.readAsStringAsync(
          `${directory(id, false)}manifest.json`,
        ),
      );
      const hash = await FileSystem.readAsStringAsync(
        `${directory(id, false)}manifest.sha256`,
      );
      if (
        manifest.id === id &&
        manifest.version === 1 &&
        manifest.albumId === albumId &&
        manifestDigest(manifest) === hash
      )
        saved.push(summarizePrint(manifest));
    } catch {
      /* Do not represent corrupt or incomplete files as successful editions. */
    }
  }
  return saved.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function shareSavedAlbumPrint(
  manifest: Pick<PrintManifest, 'id' | 'pdf'>,
  current: () => boolean,
): Promise<boolean> {
  const uri = `${directory(manifest.id, false)}album.pdf`;
  if (
    (await albumPrintNative().printFileDigest(uri)).sha256 !==
    manifest.pdf.sha256
  )
    throw new Error('PRINT_FILE_CHANGED');
  if (!current()) throw new Error('CANCELLED');
  return albumPrintNative().sharePrintPdf(uri);
}
