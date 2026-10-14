import {
  createExpoAlbumPrintStore,
  shareSavedAlbumPrint,
} from './album-print-files';
import type { PrintManifest } from '../application/album-print';
const mockDelete = jest.fn(async (_path: string) => undefined);
const mockMove = jest.fn(async (_input: unknown) => undefined);
const mockInfo = jest.fn(async (_path: string) => ({ exists: false }));
const mockCopy = jest.fn(async () => ({ sha256: 'hash', bytes: 10 }));
const mockDigest = jest.fn(async () => ({ sha256: 'pdf-hash', bytes: 20 }));
const mockShare = jest.fn(async () => true);
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => ['.building-interrupted']),
  getInfoAsync: (...args: [string]) => mockInfo(...args),
  deleteAsync: (path: string) => mockDelete(path),
  moveAsync: (input: unknown) => mockMove(input),
  writeAsStringAsync: jest.fn(async () => undefined),
}));
jest.mock('../../modules/lampy-album-layout', () => ({
  albumPrintNative: () => ({
    copyPrintMedia: mockCopy,
    printFileDigest: mockDigest,
    sharePrintPdf: mockShare,
  }),
}));
jest.mock('../application/container', () => ({ getUseCases: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  mockInfo.mockResolvedValue({ exists: false });
  mockDigest.mockResolvedValue({ sha256: 'pdf-hash', bytes: 20 });
});
it('publishes by moving the completed staging directory; cancellation cleans only this edition', async () => {
  const store = createExpoAlbumPrintStore();
  await store.begin('print_1');
  await store.copy('print_1', 'image', 'file:///original', 0);
  expect(mockCopy).toHaveBeenCalledWith(
    'file:///original',
    'file:///docs/album-print-evaluation/.building-print_1/media-0',
  );
  expect(await store.commit('print_1')).toEqual({
    pdfUri: 'file:///docs/album-print-evaluation/print_1/album.pdf',
  });
  expect(mockMove).toHaveBeenCalledWith({
    from: 'file:///docs/album-print-evaluation/.building-print_1/',
    to: 'file:///docs/album-print-evaluation/print_1/',
  });
  await store.discard('print_1');
  expect(mockDelete).toHaveBeenCalledWith(
    'file:///docs/album-print-evaluation/print_1/',
  );
});
it('a colliding edition id cannot delete an existing completed edition', async () => {
  mockInfo.mockResolvedValue({ exists: true });
  const store = createExpoAlbumPrintStore();
  await expect(store.begin('print_older')).rejects.toThrow('PRINT_ID_EXISTS');
  await store.discard('print_older');
  expect(mockDelete).not.toHaveBeenCalledWith(
    'file:///docs/album-print-evaluation/print_older/',
  );
});
it('sharing rechecks qualification after awaiting PDF integrity', async () => {
  let current = true;
  mockDigest.mockImplementationOnce(async () => {
    current = false;
    return { sha256: 'pdf-hash', bytes: 20 };
  });
  await expect(
    shareSavedAlbumPrint(
      { id: 'print_1', pdf: { sha256: 'pdf-hash' } } as PrintManifest,
      () => current,
    ),
  ).rejects.toThrow('CANCELLED');
  expect(mockShare).not.toHaveBeenCalled();
});
it('a modified saved PDF is not shared', async () => {
  mockDigest.mockResolvedValue({ sha256: 'wrong', bytes: 20 });
  await expect(
    shareSavedAlbumPrint(
      { id: 'print_1', pdf: { sha256: 'pdf-hash' } } as PrintManifest,
      () => true,
    ),
  ).rejects.toThrow('PRINT_FILE_CHANGED');
  expect(mockShare).not.toHaveBeenCalled();
});
