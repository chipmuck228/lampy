import type { AlbumLayout } from './album-layout';
import type { AlbumLayoutMediaMap } from './album-layout-input';

/** Synthetic isolation album only. Never a personal library id. */
export const ALBUM_ISOL_PROBE_ALBUM_ID = 'album_eval_window';
export const ALBUM_ISOL_MOMENT_PREFIX = 'moment_album_eval_';

export const ALBUM_ISOL_PROBE_LAYOUT = 'isol-album-c-layout.json';
export const ALBUM_ISOL_PROBE_FONTS = 'isol-album-c-fonts.json';
export const ALBUM_ISOL_PROBE_PDF = 'isol-album-c-probe.pdf';
export const ALBUM_ISOL_PROBE_META = 'isol-album-c-probe-meta.json';
export const ALBUM_PREVIEW_ISOL_PROBE = '写入隔离探针';

export type AlbumPreviewProbeFiles = {
  documentDirectory: string | null;
  writeAsStringAsync(uri: string, contents: string): Promise<void>;
};

export function isIsolAlbumLayoutFixture(input: {
  albumId: string;
  layoutAlbumId?: string;
  entryOrder?: string[] | null;
}): boolean {
  if (input.albumId !== ALBUM_ISOL_PROBE_ALBUM_ID) return false;
  if (input.layoutAlbumId && input.layoutAlbumId !== input.albumId) return false;
  const order = input.entryOrder ?? [];
  return order.length > 0 && order.every((id) => id.startsWith(ALBUM_ISOL_MOMENT_PREFIX));
}

export function shouldStartAlbumPreviewProbe(input: {
  isDev: boolean;
  explicit: boolean;
  locked: boolean;
  cancelled: boolean;
  albumId: string;
  layoutAlbumId: string;
  entryOrder?: string[] | null;
}): boolean {
  return (
    input.isDev &&
    input.explicit &&
    !input.locked &&
    !input.cancelled &&
    isIsolAlbumLayoutFixture({
      albumId: input.albumId,
      layoutAlbumId: input.layoutAlbumId,
      entryOrder: input.entryOrder,
    })
  );
}

export async function writeIsolAlbumPreviewProbe(input: {
  layout: AlbumLayout;
  media: AlbumLayoutMediaMap;
  files: AlbumPreviewProbeFiles;
  diagnoseFonts?: () => unknown;
  writePdf?: (layoutJson: string, mediaJson: string, destPath: string) => Promise<unknown>;
  isStillCurrent: () => boolean;
}): Promise<'written' | 'skipped'> {
  if (!input.isStillCurrent()) return 'skipped';
  const root = input.files.documentDirectory;
  if (!root) return 'skipped';
  const layoutJson = JSON.stringify(input.layout);
  const mediaJson = JSON.stringify(input.media);
  if (!input.isStillCurrent()) return 'skipped';
  await input.files.writeAsStringAsync(`${root}${ALBUM_ISOL_PROBE_LAYOUT}`, layoutJson);
  if (!input.isStillCurrent()) return 'skipped';
  try {
    const diagnosis = input.diagnoseFonts?.();
    if (diagnosis && input.isStillCurrent()) {
      await input.files.writeAsStringAsync(`${root}${ALBUM_ISOL_PROBE_FONTS}`, JSON.stringify(diagnosis));
    }
  } catch {
    // Font diagnosis must not block layout/PDF probes.
  }
  if (!input.isStillCurrent() || !input.writePdf) return 'skipped';
  const probe = await input.writePdf(
    layoutJson,
    mediaJson,
    `${root}${ALBUM_ISOL_PROBE_PDF}`.replace(/^file:\/\//, ''),
  );
  if (!input.isStillCurrent()) return 'skipped';
  await input.files.writeAsStringAsync(`${root}${ALBUM_ISOL_PROBE_META}`, JSON.stringify(probe));
  return 'written';
}
