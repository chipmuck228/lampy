import * as FS from 'expo-file-system/legacy';
import { albumPrintNative } from '../../modules/lampy-album-layout';
import { getUseCases } from '../application/container';
import { dateKeyAndLabel } from '../application/album-paginate';
import { freezeEpubSnapshot, type EpubSnapshot } from '../application/album-epub-snapshot';
import { manifestDigest } from '../application/album-print';
import type { EpubDesign } from '../application/album-epub';
import { albumExportAccess } from './album-export-purchases';
import { dateLabel } from '../i18n';
export function epubSnapshotRoot() {
  if (!FS.documentDirectory) throw new Error('PRINT_STORAGE_UNAVAILABLE');
  return `${FS.documentDirectory}album-epub-editions/`;
}
export function epubSnapshotDirectory(id: string, building = false) {
  if (!/^epub_[a-zA-Z0-9_-]{1,94}$/.test(id)) throw new Error('EPUB_INVALID_EDITION');
  return `${epubSnapshotRoot()}${building ? '.building-' : ''}${id}/`;
}
const activeSnapshots = new Set<string>();
async function prepareSnapshots() {
  await FS.makeDirectoryAsync(epubSnapshotRoot(), { intermediates: true });
  for (const name of await FS.readDirectoryAsync(epubSnapshotRoot())) {
    if (/^\.building-epub_[a-zA-Z0-9_-]+$/.test(name) && !activeSnapshots.has(name.slice(10)))
      await FS.deleteAsync(`${epubSnapshotRoot()}${name}`, { idempotent: true });
    if (/^epub_[a-zA-Z0-9_-]+$/.test(name) && !activeSnapshots.has(name))
      await discardUnfinishedEpubSnapshot(name);
  }
}
export type SavedEpubSnapshot = Pick<EpubSnapshot, 'id' | 'name' | 'createdAt' | 'style' | 'design'>;
export async function listEpubSnapshots(albumId: string): Promise<SavedEpubSnapshot[]> {
  await prepareSnapshots(); const result: SavedEpubSnapshot[] = [];
  for (const name of await FS.readDirectoryAsync(epubSnapshotRoot())) {
    if (!/^epub_[a-zA-Z0-9_-]+$/.test(name)) continue;
    try {
      const snapshot: EpubSnapshot = JSON.parse(await FS.readAsStringAsync(`${epubSnapshotDirectory(name)}manifest.json`));
      const digest = await FS.readAsStringAsync(`${epubSnapshotDirectory(name)}manifest.sha256`);
      const completed = (await Promise.all(['en','zh-Hans'].map(async language =>
        (await FS.getInfoAsync(`${epubSnapshotDirectory(name)}album-${language}.epub`)).exists &&
        (await FS.getInfoAsync(`${epubSnapshotDirectory(name)}album-${language}.epub.sha256`)).exists))).some(Boolean);
      if (completed && snapshot.id === name && snapshot.kind === 'epub' && snapshot.version === 1 && snapshot.albumId === albumId && digest === manifestDigest(snapshot))
        result.push({ id: name, name: snapshot.name, createdAt: snapshot.createdAt, style: snapshot.style, design: snapshot.design });
    } catch { /* Incomplete or corrupt editions are not presented as completed. */ }
  }
  return result.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function createPersonalEpubSnapshot(albumId: string, design: EpubDesign, current: () => boolean, progress?: (done: number, total: number) => void) {
  const id = `epub_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  activeSnapshots.add(id); let published = false; let retained = false;
  try {
    const result = await freezeEpubSnapshot({ id, now: new Date().toISOString(), design, current,
      authorize: () => albumExportAccess.assert(current),
      read: async () => (await (await getUseCases()).readAlbumForContinuousReading(albumId, { privateUnlocked: current() })).input,
      dates(input) {
        const dates: EpubSnapshot['dates'] = {};
        const clock = { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
        for (const entry of input.entries) {
          const date = dateKeyAndLabel(entry, clock);
          const match = date.key && /^([dmy]):(\d{4})(?:-(\d{1,2}))?/.exec(date.key);
          if (date.label && match) dates[entry.momentId] = { label: date.label, chapter: match[3] ? dateLabel(Number(match[2]),Number(match[3])) : match[2] };
        }
        return dates;
      }, progress,
      store: {
        async begin(id) {
          await prepareSnapshots();
          await FS.makeDirectoryAsync(epubSnapshotDirectory(id,true));
        },
        async copy(id, source, index) {
          if (await FS.getFreeDiskStorageAsync() < 64 * 1024 * 1024) throw new Error('EPUB_DISK_FULL');
          const file = `media-${index}`;
          const digest = await albumPrintNative().copyPrintMedia(source, `${epubSnapshotDirectory(id,true)}${file}`);
          return { file, ...digest };
        },
        async verify(source, hash) { if ((await albumPrintNative().printFileDigest(source)).sha256 !== hash) throw new Error('SOURCE_CHANGED'); },
        async commit(snapshot) {
          const dir = epubSnapshotDirectory(id,true);
          await FS.writeAsStringAsync(`${dir}manifest.json`, JSON.stringify(snapshot));
          await FS.writeAsStringAsync(`${dir}manifest.sha256`, manifestDigest(snapshot));
          await FS.moveAsync({ from: dir, to: epubSnapshotDirectory(id) }); published = true;
        },
        async discard(id) {
          await FS.deleteAsync(epubSnapshotDirectory(id,true), { idempotent: true });
          if (published) await FS.deleteAsync(epubSnapshotDirectory(id), { idempotent: true });
        },
      },
    });
    retained = true; return result;
  } finally { if (!retained) activeSnapshots.delete(id); }
}

export async function discardUnfinishedEpubSnapshot(id: string) {
  const dir = epubSnapshotDirectory(id);
  try {
  for (const language of ['en','zh-Hans']) {
    if ((await FS.getInfoAsync(`${dir}album-${language}.epub`)).exists &&
        (await FS.getInfoAsync(`${dir}album-${language}.epub.sha256`)).exists) return;
  }
  await FS.deleteAsync(dir, { idempotent: true });
  } finally { activeSnapshots.delete(id); }
}
