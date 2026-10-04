import { createMemoryLifeAlbumRepository } from '../infrastructure/life-album-repository';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { activateMoment, createDraftMoment } from '../domain-adapters/moment-commands';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import { readAlbumLayoutInput } from './album-layout-read';

describe('album layout source reads', () => {
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
