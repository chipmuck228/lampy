import * as FS from 'expo-file-system/legacy';
import { manifestDigest } from '../application/album-print';
import { acquireAlbumEdition } from './album-edition-lock';
import { epubSnapshotActive } from './album-epub-snapshots';

/** Delete only a verified, owned local edition; never follow paths in its manifest. */
export async function deleteSavedAlbumEdition(id: string, albumId: string, current: () => boolean): Promise<void> {
  if (!FS.documentDirectory) throw new Error('PRINT_STORAGE_UNAVAILABLE');
  const kind = /^epub_[a-zA-Z0-9_-]{1,94}$/.test(id) ? 'epub'
    : /^print_[a-zA-Z0-9_-]{1,94}$/.test(id) ? 'print' : null;
  if (!kind) throw new Error('PRINT_INVALID_ID');
  const check = () => { if (!current()) throw new Error('CANCELLED'); };
  check();
  if (epubSnapshotActive(id)) throw new Error('EPUB_BUSY');
  const release = acquireAlbumEdition(id);
  try {
    const directory = `${FS.documentDirectory}${kind === 'epub' ? 'album-epub-editions' : 'album-print-evaluation'}/${id}/`;
    const manifest = JSON.parse(await FS.readAsStringAsync(directory + 'manifest.json'));
    const digest = await FS.readAsStringAsync(directory + 'manifest.sha256');
    check();
    if (manifest.id !== id || manifest.albumId !== albumId || manifest.version !== 1 ||
        (kind === 'epub' && manifest.kind !== 'epub') || manifestDigest(manifest) !== digest)
      throw new Error('PRINT_FILE_CHANGED');
    // This tree contains only the frozen edition's private copies. Original URIs
    // and external shares are not used here. Keep the lease until deletion finishes.
    await FS.deleteAsync(directory, { idempotent: true });
  } finally { release(); }
}
