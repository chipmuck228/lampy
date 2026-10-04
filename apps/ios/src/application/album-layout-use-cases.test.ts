import { createMemoryLifeAlbumRepository } from '../infrastructure/life-album-repository';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { ALBUM_LAYOUT_CANCELLED, ALBUM_LAYOUT_STALE, createAlbumLayoutUseCases } from './album-layout-use-cases';
import { createGlyphWidthMeasurer } from './album-text-measure';
import { createDraftMoment, activateMoment, updateMomentContent } from '../domain-adapters/moment-commands';
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
    await expect(useCases.generateAlbumLayout('album_1', { signal, generation: 1 })).rejects.toMatchObject({
      code: ALBUM_LAYOUT_CANCELLED,
    });
    useCases.cancelAlbumLayout();
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
});
