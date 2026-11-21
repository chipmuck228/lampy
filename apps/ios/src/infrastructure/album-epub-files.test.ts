import { File } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { unzipSync, strFromU8 } from 'fflate';
import * as FS from 'expo-file-system/legacy';
import { albumPrintNative } from '../../modules/lampy-album-layout';
import { albumExportAccess } from './album-export-purchases';
import { manifestDigest, type PrintManifest } from '../application/album-print';
import { shareAlbumEpub, epubAudioFormat } from './album-epub-files';
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///documents/', getInfoAsync: jest.fn(), readAsStringAsync: jest.fn(), deleteAsync: jest.fn(), writeAsStringAsync: jest.fn(), moveAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { PNG: 'png' } }));
jest.mock('./album-export-purchases', () => ({ albumExportAccess: { assert: jest.fn() } }));
jest.mock('../../modules/lampy-album-layout', () => ({ albumPrintNative: jest.fn() }));
let manifest = { id: 'print_test', version: 1, content: { entries: [] }, media: [], layout: { pages: [] } } as unknown as PrintManifest;
const native = { printFileDigest: jest.fn(), sharePrintPdf: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  (albumExportAccess.assert as jest.Mock).mockReset().mockResolvedValue(undefined);
  (albumPrintNative as jest.Mock).mockReturnValue(native);
  (FS.readAsStringAsync as jest.Mock).mockImplementation(async (uri: string) => uri.endsWith('manifest.json') ? JSON.stringify(manifest) : uri.endsWith('manifest.sha256') ? manifestDigest(manifest) : 'saved-hash');
  native.printFileDigest.mockResolvedValue({ sha256: 'saved-hash' });
  (FS.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
});
it('shares an intact existing edition without a new purchase or source read', async () => {
  await shareAlbumEpub('print_test', () => true);
  expect(albumExportAccess.assert).not.toHaveBeenCalled();
  expect(native.sharePrintPdf).toHaveBeenCalledWith(expect.stringMatching(/album-.*\.epub$/));
});
it('rejects changed files instead of sharing them', async () => {
  native.printFileDigest.mockResolvedValue({ sha256: 'changed' });
  await expect(shareAlbumEpub('print_test', () => true)).rejects.toThrow('PRINT_FILE_CHANGED');
  expect(native.sharePrintPdf).not.toHaveBeenCalled();
});
it('requires current export access before creating a new electronic edition', async () => {
  (FS.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
  (albumExportAccess.assert as jest.Mock).mockRejectedValue(new Error('EXPORT_PURCHASE_REQUIRED'));
  await expect(shareAlbumEpub('print_test', () => true)).rejects.toThrow('EXPORT_PURCHASE_REQUIRED');
  expect(FS.moveAsync).not.toHaveBeenCalled();
});
it('background/lock invalidation prevents the share sheet', async () => {
  let valid = true;
  native.printFileDigest.mockImplementation(async () => { valid = false; return { sha256: 'saved-hash' }; });
  await expect(shareAlbumEpub('print_test', () => valid)).rejects.toThrow('CANCELLED');
  expect(native.sharePrintPdf).not.toHaveBeenCalled();
});
it('rejects unsafe edition identifiers and unknown audio rather than silently losing sound', async () => {
  await expect(shareAlbumEpub('../private', () => true)).rejects.toThrow('EPUB_INVALID_EDITION');
  expect(() => epubAudioFormat(new Uint8Array([1,2,3]))).toThrow('EPUB_UNSUPPORTED_AUDIO');
  expect(epubAudioFormat(new Uint8Array([0,0,0,16,102,116,121,112,77,52,65,32,0]))).toEqual({ mime: 'audio/mp4', extension: 'm4a' });
});

it('creates an offline archive from frozen copies, verifies it, and publishes only after a second authorization', async () => {
  const bytes = new Uint8Array([0,0,0,16,102,116,121,112,77,52,65,32,0]);
  let written = new Uint8Array();
  const old = manifest;
  manifest = {
    id: 'print_test', version: 1, createdAt: '2026-11-21T00:00:00Z', style: 'plain',
    content: { album: { name: 'Kept voices', opening: null, cover: { kind: 'words' } }, entries: [{ momentId: 'm', presence: 'ready', note: 'Original words', feeling: '', media: [{ assetId: 'a', role: 'audio', availability: 'available', durationMs: 1000 }] }] },
    media: [{ assetId: 'a', file: 'media-0', sha256: 'frozen', bytes: bytes.length }], layout: { pages: [] },
  } as unknown as PrintManifest;
  (FS.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
  (File as unknown as jest.Mock).mockImplementation(() => ({ bytes: async () => bytes, write: (data: Uint8Array) => { written = data as Uint8Array<ArrayBuffer>; } }));
  native.printFileDigest.mockImplementation(async (uri: string) => ({ sha256: uri.endsWith('media-0') ? 'frozen' : bytesToHex(sha256(written)), bytes: bytes.length }));
  try {
    await shareAlbumEpub('print_test', () => true);
    expect(albumExportAccess.assert).toHaveBeenCalledTimes(2);
    const contents = unzipSync(written);
    expect(strFromU8(contents['OEBPS/record-1.xhtml'])).toContain('Original words');
    expect(contents['OEBPS/media/asset-0.m4a']).toEqual(bytes);
    expect(FS.moveAsync).toHaveBeenCalledWith(expect.objectContaining({ from: expect.stringMatching(/\.partial$/) }));
    expect(native.sharePrintPdf).toHaveBeenCalledTimes(1);
  } finally { manifest = old; }
});
