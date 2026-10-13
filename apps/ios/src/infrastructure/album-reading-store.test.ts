import {
  readAlbumReadingState,
  saveAlbumReadingState,
} from './album-reading-store';
const mockData = new Map<string, string>();
const mockSet = jest.fn(async (key: string, value: string) => {
  mockData.set(key, value);
});
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockData.get(key) ?? null,
  setItemAsync: (key: string, value: string) => mockSet(key, value),
}));
beforeEach(() => {
  mockData.clear();
  mockSet.mockClear();
});
it('reads the latest queued style before paper preview opens', async () => {
  const one = saveAlbumReadingState('a/b', 'plain', null);
  const two = saveAlbumReadingState('a/b', 'handmade', null);
  expect(await readAlbumReadingState('a/b')).toEqual({
    style: 'handmade',
    position: null,
  });
  await Promise.all([one, two]);
  expect(await readAlbumReadingState('other')).toEqual({
    style: 'plain',
    position: null,
  });
});
it('ignores invalid stored offsets instead of scrolling to NaN', async () => {
  await saveAlbumReadingState('book', 'plain', {
    version: 1,
    fingerprint: 'hash',
    width: 300,
    y: -2,
    anchor: null,
    within: 0,
    style: 'plain',
  });
  expect((await readAlbumReadingState('book')).position).toBeNull();
});
