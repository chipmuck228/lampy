import {
  createAlbumLayoutUseCases,
  ALBUM_LAYOUT_CANCELLED,
} from './album-layout-use-cases';
import { createMemoryLifeAlbumRepository } from '../infrastructure/life-album-repository';
import { createMemoryRepositories } from '../infrastructure/repositories';
async function setup() {
  const albums = createMemoryLifeAlbumRepository();
  const repos = createMemoryRepositories();
  await albums.insert({
    id: 'book',
    ownerId: 'local-user',
    schemaVersion: 1,
    name: '私人的日子',
    opening: null,
    cover: { kind: 'words' },
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  });
  return { ...repos, albums };
}
it('continuous reading does not require the native print measurer', async () => {
  const deps = await setup();
  const app = createAlbumLayoutUseCases(deps);
  expect(
    (await app.readAlbumForContinuousReading('book')).input.album.name,
  ).toBe('私人的日子');
  await expect(
    app.readAlbumForContinuousReading('book', { signal: { cancelled: true } }),
  ).rejects.toMatchObject({ code: ALBUM_LAYOUT_CANCELLED });
});
it('rejects stale work and checks unlock again after asynchronous source reads', async () => {
  const deps = await setup();
  let unlocked = true;
  const app = createAlbumLayoutUseCases({
    ...deps,
    privateUnlocked: () => unlocked,
  });
  const first = app.beginAlbumLayout('book');
  app.beginAlbumLayout('book');
  await expect(
    app.readAlbumForContinuousReading('book', { requestId: first.requestId }),
  ).rejects.toMatchObject({ code: ALBUM_LAYOUT_CANCELLED });
  const original = deps.albums.listEntries;
  deps.albums.listEntries = async (id) => {
    const result = await original(id);
    unlocked = false;
    return result;
  };
  await expect(app.readAlbumForContinuousReading('book')).rejects.toMatchObject(
    { code: 'ALBUM_LAYOUT_FAILED' },
  );
});
