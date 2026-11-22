import { File } from 'expo-file-system';
import * as FS from 'expo-file-system/legacy';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { unzipSync, strFromU8, strToU8 } from 'fflate';
import { albumEpubNative, albumPrintNative } from '../../modules/lampy-album-layout';
import { albumExportAccess } from './album-export-purchases';
import { manifestDigest, type PrintManifest } from '../application/album-print';
import { shareAlbumEpub, epubAudioFormat, AlbumEpubFailure } from './album-epub-files';
jest.mock('./album-epub-snapshots', () => ({ epubSnapshotDirectory: (id: string) => `file:///documents/album-epub-editions/${id}/` }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), FileMode: { ReadOnly: 'r', Truncate: 'wt' } }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///documents/', getFreeDiskStorageAsync: jest.fn(), readDirectoryAsync: jest.fn(), makeDirectoryAsync: jest.fn(), getInfoAsync: jest.fn(), readAsStringAsync: jest.fn(), deleteAsync: jest.fn(), writeAsStringAsync: jest.fn(), moveAsync: jest.fn() }));
jest.mock('./album-export-purchases', () => ({ albumExportAccess: { assert: jest.fn() } }));
jest.mock('../../modules/lampy-album-layout', () => ({ albumPrintNative: jest.fn(), albumEpubNative: jest.fn() }));
const root = 'file:///documents/album-print-evaluation/print_test/';
let files: Map<string, Uint8Array>;
const native = { printFileDigest: jest.fn(), sharePrintPdf: jest.fn() };
const prepareImage = jest.fn();
const audio = new Uint8Array([0,0,0,16,102,116,121,112,77,52,65,32,0]);
function manifest(photo = false): PrintManifest {
  const source = photo ? new Uint8Array([255,216,255]) : audio;
  return { id: 'print_test', version: 1, createdAt: '2026-11-21T00:00:00Z', style: 'plain',
    content: { album: { name: 'Kept voices', opening: null, cover: { kind: 'words' } }, entries: [{ momentId: 'm', presence: 'ready', note: 'Original words', feeling: '', media: [{ assetId: 'a', role: photo ? 'image' : 'audio', availability: 'available', durationMs: 1000 }] }] },
    media: [{ assetId: 'a', file: 'media-0', sha256: bytesToHex(sha256(source)), bytes: source.length }], layout: { pages: [] },
  } as unknown as PrintManifest;
}
function seed(photo = false) {
  const m = manifest(photo);
  files.set(root+'manifest.json', strToU8(JSON.stringify(m)));
  files.set(root+'manifest.sha256', strToU8(manifestDigest(m)));
  files.set(root+'media-0', photo ? new Uint8Array([255,216,255]) : audio);
}
function resultUri() { return [...files.keys()].find(k => /album-.*\.epub$/.test(k))!; }
beforeEach(() => {
  jest.clearAllMocks(); files = new Map(); seed();
  (albumExportAccess.assert as jest.Mock).mockReset().mockResolvedValue(undefined);
  (albumPrintNative as jest.Mock).mockReturnValue(native);
  (albumEpubNative as jest.Mock).mockReturnValue({ prepareImage });
  native.printFileDigest.mockImplementation(async uri => { const b = files.get(uri); if (!b) throw new Error('MISSING_FILE'); return { sha256: bytesToHex(sha256(b)), bytes: b.length }; });
  native.sharePrintPdf.mockResolvedValue(true);
  prepareImage.mockImplementation(async (_source, dest) => { files.set(dest, new Uint8Array([255,216,255])); return { mime: 'image/jpeg', extension: 'jpg', bytes: 3 }; });
  (FS.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
  (FS.getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(10 * 1024 ** 3);
  (FS.getInfoAsync as jest.Mock).mockImplementation(async uri => ({ exists: files.has(uri), size: files.get(uri)?.length }));
  (FS.readAsStringAsync as jest.Mock).mockImplementation(async uri => strFromU8(files.get(uri)!));
  (FS.writeAsStringAsync as jest.Mock).mockImplementation(async (uri, text) => { files.set(uri, strToU8(text)); });
  (FS.moveAsync as jest.Mock).mockImplementation(async ({ from, to }) => { files.set(to, files.get(from)!); files.delete(from); });
  (FS.deleteAsync as jest.Mock).mockImplementation(async uri => { for (const key of files.keys()) if (key === uri || key.startsWith(uri.endsWith('/') ? uri : uri + '/')) files.delete(key); });
  (File as unknown as jest.Mock).mockImplementation((uri: string) => ({ create() { files.set(uri, new Uint8Array()); }, open(mode: string) {
    let offset = 0; if (mode === 'wt') files.set(uri, new Uint8Array());
    return { readBytes(n: number) { const chunk = files.get(uri)!.subarray(offset, offset+n); offset += chunk.length; return chunk; }, writeBytes(chunk: Uint8Array) { const old = files.get(uri)!; const next = new Uint8Array(old.length+chunk.length); next.set(old); next.set(chunk, old.length); files.set(uri,next); }, close() {} };
  } }));
});
it('streams frozen audio and verifies the result before explicit sharing', async () => {
  await shareAlbumEpub('print_test', () => true);
  expect(albumExportAccess.assert).toHaveBeenCalledTimes(2);
  expect(unzipSync(files.get(resultUri())!)['OEBPS/media/asset-0.m4a']).toEqual(audio);
  expect(native.sharePrintPdf).toHaveBeenCalledWith(resultUri());
  expect([...files.keys()].some(k => k.includes('.epub-work-'))).toBe(false);
});
it('uses native thumbnail preparation and keeps photos on disk until streaming', async () => {
  seed(true); await shareAlbumEpub('print_test', () => true);
  expect(prepareImage).toHaveBeenCalledTimes(1);
  expect(unzipSync(files.get(resultUri())!)['OEBPS/media/asset-0.jpg']).toEqual(new Uint8Array([255,216,255]));
});
it('shares intact existing EPUB without requiring a new purchase', async () => {
  await shareAlbumEpub('print_test', () => true); jest.clearAllMocks();
  await shareAlbumEpub('print_test', () => true);
  expect(albumExportAccess.assert).not.toHaveBeenCalled(); expect(prepareImage).not.toHaveBeenCalled();
  expect(native.sharePrintPdf).toHaveBeenCalledTimes(1);
});
it('requires current rights and sufficient disk space', async () => {
  (albumExportAccess.assert as jest.Mock).mockRejectedValueOnce(new Error('EXPORT_PURCHASE_REQUIRED'));
  await expect(shareAlbumEpub('print_test', () => true)).rejects.toThrow('EXPORT_PURCHASE_REQUIRED');
  (FS.getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(0);
  await expect(shareAlbumEpub('print_test', () => true)).rejects.toThrow('EPUB_DISK_FULL');
  expect(native.sharePrintPdf).not.toHaveBeenCalled();
});
it.each(['background','page leave','cancel'])('discards a late native image result after %s and allows a fresh retry', async () => {
  seed(true); let valid = true;
  prepareImage.mockImplementationOnce(async (_src, dest) => { files.set(dest,new Uint8Array([1])); valid = false; return { mime:'image/jpeg',extension:'jpg',bytes:1 }; });
  await expect(shareAlbumEpub('print_test', () => valid)).rejects.toThrow('CANCELLED');
  expect(resultUri()).toBeUndefined(); expect(native.sharePrintPdf).not.toHaveBeenCalled();
  expect([...files.keys()].some(k => k.includes('.epub-work-'))).toBe(false);
  await shareAlbumEpub('print_test', () => true); expect(native.sharePrintPdf).toHaveBeenCalledTimes(1);
});
it('cleans abandoned work on retry without deleting original media', async () => {
  files.set(root+'.epub-work-crashed/album.epub',new Uint8Array([1]));
  (FS.readDirectoryAsync as jest.Mock).mockResolvedValue(['.epub-work-crashed','media-0']);
  await shareAlbumEpub('print_test', () => true);
  expect(files.has(root+'.epub-work-crashed/album.epub')).toBe(false); expect(files.has(root+'media-0')).toBe(true);
});
it('rolls back a publish interrupted during digest writing', async () => {
  let valid = true;
  (FS.writeAsStringAsync as jest.Mock).mockImplementationOnce(async (uri,text) => { files.set(uri,strToU8(text)); valid = false; });
  await expect(shareAlbumEpub('print_test', () => valid)).rejects.toThrow('CANCELLED');
  expect(resultUri()).toBeUndefined(); expect(native.sharePrintPdf).not.toHaveBeenCalled();
});
it('retains the saved file if sharing fails, and retries without regenerating', async () => {
  native.sharePrintPdf.mockRejectedValueOnce(new Error('SHARE_FAILED'));
  await expect(shareAlbumEpub('print_test', () => true)).rejects.toBeInstanceOf(AlbumEpubFailure);
  expect(resultUri()).toBeDefined(); jest.clearAllMocks();
  await shareAlbumEpub('print_test', () => true); expect(albumExportAccess.assert).not.toHaveBeenCalled();
});
it('reports real resource and file progress; rejects unsafe IDs and unsupported audio', async () => {
  const progress = jest.fn(); await shareAlbumEpub('print_test', () => true, progress);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage:'CONVERT_IMAGE',done:1,total:1 }));
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage:'WRITE_FILE',done:expect.any(Number),total:expect.any(Number) }));
  await expect(shareAlbumEpub('../private', () => true)).rejects.toThrow('EPUB_INVALID_EDITION');
  expect(() => epubAudioFormat(new Uint8Array([1,2,3]))).toThrow('EPUB_UNSUPPORTED_AUDIO');
});

it('cancels during chunked archive writing, removes partial output and never opens a late share sheet', async () => {
  let valid = true;
  await expect(shareAlbumEpub('print_test', () => valid, progress => {
    if (progress.stage === 'WRITE_FILE' && progress.done > 0) valid = false;
  })).rejects.toThrow('CANCELLED');
  expect(resultUri()).toBeUndefined(); expect(native.sharePrintPdf).not.toHaveBeenCalled();
  expect([...files.keys()].some(key => key.includes('.epub-work-'))).toBe(false);
});

it('streams the frozen design into a standalone EPUB and re-shares its immutable completed bytes', async () => {
  const id='epub_editorial';const dir=`file:///documents/album-epub-editions/${id}/`;
  const snapshot={...manifest(),id,kind:'epub',design:'imagebook',dates:{}};
  files.set(dir+'manifest.json',strToU8(JSON.stringify(snapshot)));
  files.set(dir+'manifest.sha256',strToU8(manifestDigest(snapshot)));
  files.set(dir+'media-0',audio);
  await shareAlbumEpub(id,()=>true);
  const uri=dir+'album-zh-Hans.epub';
  const output=files.get(uri) ?? files.get(dir+'album-en.epub')!;
  expect(strFromU8(unzipSync(output)['OEBPS/cover.xhtml'])).toContain('class="imagebook"');
  const first=output.slice();jest.clearAllMocks();
  await shareAlbumEpub(id,()=>true);
  expect(files.get(uri) ?? files.get(dir+'album-en.epub')).toEqual(first);
  expect(albumExportAccess.assert).not.toHaveBeenCalled();
});
