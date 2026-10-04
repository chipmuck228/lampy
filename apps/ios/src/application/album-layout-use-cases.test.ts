import { createMemoryLifeAlbumRepository } from '../infrastructure/life-album-repository';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { ALBUM_LAYOUT_CANCELLED, ALBUM_LAYOUT_STALE, createAlbumLayoutUseCases } from './album-layout-use-cases';
import { createGlyphWidthMeasurer } from './album-text-measure';
import { createDraftMoment, activateMoment, updateMomentContent, attachAsset } from '../domain-adapters/moment-commands';
import { createAsset } from '../domain-adapters/asset-commands';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';

function seedActive(note: string, at = '2026-10-01T00:00:00.000Z') {
  const draft = createDraftMoment(
    { content: { note, emotion: '' }, origin: { type: 'created' } },
    { now: () => new Date(at), ownerId: LOCAL_OWNER_ID },
  );
  return activateMoment(draft, LOCAL_OWNER_ID, new Date(at));
}

describe('album layout generation races', () => {
  it('drops cancelled work and ignores a later result', async () => {
    const { moments } = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    const moment = seedActive('门口的风。');
    await moments.save(moment);
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
    const useCases = createAlbumLayoutUseCases({
      albums,
      moments,
      ownerId: 'local-user',
      measurer: createGlyphWidthMeasurer(),
      timezone: { timeZone: 'UTC' },
    });
    const signal = { cancelled: true };
    await expect(useCases.generateAlbumLayout('album_1', { signal })).rejects.toMatchObject({
      code: ALBUM_LAYOUT_CANCELLED,
    });
    useCases.cancelAlbumLayout();
  });

  it('lets application-issued request ids survive leaving and opening preview again', async () => {
    const { moments } = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    const moment = seedActive('门口的风。');
    await moments.save(moment);
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
    const useCases = createAlbumLayoutUseCases({
      albums,
      moments,
      ownerId: 'local-user',
      measurer: createGlyphWidthMeasurer(),
      timezone: { timeZone: 'UTC' },
    });
    const first = useCases.beginAlbumLayout('album_1');
    useCases.cancelAlbumLayout();
    const second = useCases.beginAlbumLayout('album_1');
    expect(second.requestId).toBeGreaterThan(first.requestId);
    await expect(
      useCases.generateAlbumLayout('album_1', { requestId: first.requestId }),
    ).rejects.toMatchObject({ code: ALBUM_LAYOUT_CANCELLED });
    await expect(
      useCases.generateAlbumLayout('album_1', { requestId: second.requestId }),
    ).resolves.toEqual(expect.objectContaining({ requestId: second.requestId, layout: expect.objectContaining({ albumId: 'album_1' }) }));
  });

  it('fails when the source revision changes between reads', async () => {
    const { moments } = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    const moment = seedActive('原句');
    await moments.save(moment);
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
    let firstSnapshot = true;
    const wrappedMoments = {
      ...moments,
      async findById(id: string) {
        const found = await moments.findById(id);
        if (firstSnapshot) {
          firstSnapshot = false;
          return found;
        }
        if (found.kind === 'ready' && found.moment.content.note !== '改过') {
          const changed = updateMomentContent(
            found.moment,
            { content: { note: '改过' } },
            LOCAL_OWNER_ID,
            '2026-10-02T00:00:00.000Z',
          );
          await moments.save(changed);
          return { kind: 'ready' as const, moment: changed };
        }
        return found;
      },
    };
    const useCases = createAlbumLayoutUseCases({
      albums,
      moments: wrappedMoments,
      ownerId: 'local-user',
      measurer: createGlyphWidthMeasurer(),
      timezone: { timeZone: 'UTC' },
    });
    await expect(useCases.generateAlbumLayout('album_1')).rejects.toMatchObject({ code: ALBUM_LAYOUT_STALE });
    await expect(useCases.generateAlbumLayout('album_1')).resolves.toEqual(
      expect.objectContaining({ layout: expect.objectContaining({ albumId: 'album_1' }) }),
    );
  });

  it('does not read sources when private content is locked', async () => {
    const { moments } = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    const useCases = createAlbumLayoutUseCases({
      albums,
      moments,
      ownerId: 'local-user',
      measurer: createGlyphWidthMeasurer(),
      timezone: { timeZone: 'UTC' },
      privateUnlocked: () => false,
    });
    await expect(useCases.generateAlbumLayout('album_1')).rejects.toMatchObject({ code: 'ALBUM_LAYOUT_FAILED' });
  });

  it('reuses a cache entry until the fingerprint changes', async () => {
    const { moments } = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    const moment = seedActive('门口的风。');
    await moments.save(moment);
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
    let now = 1;
    const useCases = createAlbumLayoutUseCases({
      albums,
      moments,
      ownerId: 'local-user',
      measurer: createGlyphWidthMeasurer(),
      timezone: { timeZone: 'UTC' },
      clock: { now: () => new Date(now) },
    });
    const first = await useCases.generateAlbumLayout('album_1');
    now = 9;
    const second = await useCases.generateAlbumLayout('album_1');
    expect(second.layout.generatedAt).toBe(first.layout.generatedAt);
    await albums.update({
      id: 'album_1',
      ownerId: 'local-user',
      schemaVersion: 1,
      name: '改过的名字',
      opening: null,
      cover: { kind: 'words' },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    });
    const third = await useCases.generateAlbumLayout('album_1');
    expect(third.layout.generatedAt).not.toBe(first.layout.generatedAt);
    expect(third.fingerprint.name).toBe('改过的名字');
  });

  it('returns the current media map on a fingerprint cache hit', async () => {
    const repos = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    const asset = createAsset(
      {
        id: 'img_1',
        ownerId: LOCAL_OWNER_ID,
        type: 'image',
        localUri: 'memory://old.jpg',
        storage: { status: 'local' },
        metadata: { mimeType: 'image/jpeg', width: 80, height: 80 },
      },
      { now: () => new Date('2026-10-01T00:00:00.000Z'), ownerId: LOCAL_OWNER_ID, id: () => 'img_1' },
    );
    await repos.assets.save(asset);
    let moment = seedActive('有图');
    moment = attachAsset(moment, 'img_1', LOCAL_OWNER_ID, '2026-10-01T00:00:00.000Z');
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
    let uri = 'memory://old.jpg';
    const wrappedAssets = {
      ...repos.assets,
      async findById(id: string) {
        const found = await repos.assets.findById(id);
        if (found.kind !== 'ready') return found;
        return { kind: 'ready' as const, asset: { ...found.asset, localUri: uri } };
      },
    };
    const useCases = createAlbumLayoutUseCases({
      albums,
      moments: repos.moments,
      assets: wrappedAssets,
      ownerId: 'local-user',
      measurer: createGlyphWidthMeasurer(),
      timezone: { timeZone: 'UTC' },
    });
    const first = await useCases.generateAlbumLayout('album_1');
    expect(first.media.img_1).toBe('memory://old.jpg');
    uri = 'memory://new.jpg';
    const second = await useCases.generateAlbumLayout('album_1');
    expect(second.layout.generatedAt).toBe(first.layout.generatedAt);
    expect(second.media.img_1).toBe('memory://new.jpg');
  });

  it('does not silently use the glyph-width test double', async () => {
    const { moments } = createMemoryRepositories();
    const albums = createMemoryLifeAlbumRepository();
    const useCases = createAlbumLayoutUseCases({
      albums,
      moments,
      ownerId: 'local-user',
      timezone: { timeZone: 'UTC' },
    });
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
    await expect(useCases.generateAlbumLayout('album_1')).rejects.toMatchObject({
      code: 'ALBUM_LAYOUT_UNAVAILABLE',
      message: '排版能力尚不可用',
    });
  });
});
