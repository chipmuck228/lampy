import { createAsset } from '../domain-adapters/asset-commands';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import {
  activateMoment,
  attachAsset,
  createDraftMoment,
} from '../domain-adapters/moment-commands';
import { createMemoryLifeAlbumRepository } from '../infrastructure/life-album-repository';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { readAlbumLayoutInput } from './album-layout-read';

async function seedImageMoment(
  repos: ReturnType<typeof createMemoryRepositories>,
  albums: ReturnType<typeof createMemoryLifeAlbumRepository>,
  input: { assetId: string; localUri: string; note: string },
) {
  const asset = createAsset(
    {
      id: input.assetId,
      ownerId: LOCAL_OWNER_ID,
      type: 'image',
      localUri: input.localUri,
      storage: { status: 'local' },
      metadata: { mimeType: 'image/jpeg', width: 100, height: 80 },
    },
    {
      now: () => new Date('2026-10-01T00:00:00.000Z'),
      ownerId: LOCAL_OWNER_ID,
      id: () => input.assetId,
    },
  );
  await repos.assets.save(asset);
  const draft = createDraftMoment(
    { content: { note: input.note, emotion: '' }, origin: { type: 'created' } },
    { now: () => new Date('2026-10-01T00:00:00.000Z'), ownerId: LOCAL_OWNER_ID },
  );
  let moment = activateMoment(draft, LOCAL_OWNER_ID, new Date('2026-10-01T00:00:00.000Z'));
  moment = attachAsset(moment, input.assetId, LOCAL_OWNER_ID, '2026-10-01T00:00:00.000Z');
  await repos.moments.save(moment);
  await albums.insert({
    id: 'album_1',
    ownerId: 'local-user',
    schemaVersion: 1,
    name: '一些日子',
    opening: null,
    cover: { kind: 'words' },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  });
  await albums.insertEntry({
    albumId: 'album_1',
    momentId: moment.id,
    collectedAt: '2026-10-01T00:00:00.000Z',
    sourceRevisionAtCollect: moment.revision,
    sortOrder: 0,
  });
  return moment;
}

describe('album layout source reads', () => {
  it('puts remapped display URIs into the preview media map', async () => {
    const repos = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    await seedImageMoment(repos, albums, {
      assetId: 'img_stale',
      localUri:
        'file:///var/mobile/Containers/Data/Application/OLD/Documents/lampy-assets/img_stale.jpg',
      note: '有图',
    });
    const current =
      'file:///var/mobile/Containers/Data/Application/NEW/Documents/lampy-assets/img_stale.jpg';
    const { input, media } = await readAlbumLayoutInput({
      albums,
      moments: repos.moments,
      assets: repos.assets,
      media: {
        async exists() {
          return true;
        },
        async resolveUri() {
          return current;
        },
      },
      ownerId: 'local-user',
      albumId: 'album_1',
    });
    expect(input.entries[0]?.media[0]?.availability).toBe('available');
    expect(media.img_stale).toBe(current);
    expect(input.entries[0]?.media[0]?.uri).toBe(current);
  });

  it('marks media missing when resolveUri cannot locate the file', async () => {
    const repos = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    await seedImageMoment(repos, albums, {
      assetId: 'img_gone',
      localUri: 'file:///docs/lampy-assets/img_gone.jpg',
      note: '丢了',
    });
    const { input, media } = await readAlbumLayoutInput({
      albums,
      moments: repos.moments,
      assets: repos.assets,
      media: {
        async exists() {
          return false;
        },
        async resolveUri() {
          return null;
        },
      },
      ownerId: 'local-user',
      albumId: 'album_1',
    });
    expect(input.entries[0]?.media[0]?.availability).toBe('missing');
    expect(media.img_gone).toBeUndefined();
  });

  it('keeps missing moments distinct from unreadable moments', async () => {
    const { moments } = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    await albums.insert({
      id: 'album_1',
      ownerId: 'local-user',
      schemaVersion: 1,
      name: '一些日子',
      opening: null,
      cover: { kind: 'words' },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    await albums.insertEntry({
      albumId: 'album_1',
      momentId: 'gone',
      collectedAt: '2026-10-01T00:00:00.000Z',
      sourceRevisionAtCollect: 1,
      sortOrder: 0,
    });
    const draft = createDraftMoment(
      { content: { note: '在', emotion: '' }, origin: { type: 'created' } },
      { now: () => new Date('2026-10-01T00:00:00.000Z'), ownerId: LOCAL_OWNER_ID },
    );
    const moment = activateMoment(draft, LOCAL_OWNER_ID, new Date('2026-10-01T00:00:00.000Z'));
    await albums.insertEntry({
      albumId: 'album_1',
      momentId: moment.id,
      collectedAt: '2026-10-01T00:00:00.000Z',
      sourceRevisionAtCollect: 1,
      sortOrder: 1,
    });
    const wrapped = {
      ...moments,
      async findById(id: string) {
        if (id === moment.id) return { kind: 'unreadable' as const };
        return moments.findById(id);
      },
    };
    const { input } = await readAlbumLayoutInput({
      albums,
      moments: wrapped,
      ownerId: 'local-user',
      albumId: 'album_1',
    });
    expect(input.entries[0]?.presence).toBe('missing');
    expect(input.entries[1]?.presence).toBe('unreadable');
  });
});
