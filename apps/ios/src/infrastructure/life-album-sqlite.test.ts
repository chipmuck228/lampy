import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createUseCases } from '../application/use-cases';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import { activateMoment, createDraftMoment } from '../domain-adapters/moment-commands';
import { openPreparedNodeSqliteDatabase } from './node-sqlite';
import { createSqliteRepositories } from './sqlite-repositories';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

async function withDatabase<T>(run: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-album-'));
  const file = path.join(dir, 'lampy.db');
  try {
    return await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('life album sqlite preservation', () => {
  it('restores albums and entries after closing the file', async () => {
    await withDatabase(async (file) => {
      const firstDb = await openPreparedNodeSqliteDatabase(file);
      const firstRepos = createSqliteRepositories(firstDb);
      let moment = createDraftMoment(
        {
          content: { note: '门口的风', emotion: '' },
          origin: { type: 'created' },
        },
        { now: () => new Date('2026-10-01T01:00:00.000Z'), ownerId: LOCAL_OWNER_ID, id: () => 'moment_wind' },
      );
      moment = activateMoment(moment, LOCAL_OWNER_ID, new Date('2026-10-01T01:00:00.000Z'));
      await firstRepos.moments.save(moment);
      const first = createUseCases({
        ...firstRepos,
        clock: clockAt('2026-10-03T09:00:00.000Z'),
        albumId: () => 'album_persist',
      });
      const album = await first.createAlbum({ name: '一些日子' });
      await first.collectAlbumEntry({ albumId: album.id, momentId: 'moment_wind' });
      await firstDb.close();

      const secondDb = await openPreparedNodeSqliteDatabase(file);
      const second = createUseCases({
        ...createSqliteRepositories(secondDb),
        clock: clockAt('2026-10-03T09:01:00.000Z'),
      });
      const listed = await second.listAlbums();
      expect(listed.status).toBe('ready');
      if (listed.status === 'ready') {
        expect(listed.albums).toHaveLength(1);
        expect(listed.albums[0].name).toBe('一些日子');
        expect(listed.albums[0].entryCount).toBe(1);
      }
      const view = await second.getAlbum('album_persist');
      expect(view.album.entries.map((entry) => entry.momentId)).toEqual(['moment_wind']);
      expect(view.entries[0].source).toBe('ready');
      const storedMoment = await createSqliteRepositories(secondDb).moments.findById('moment_wind');
      expect(storedMoment.kind).toBe('ready');
      await secondDb.close();
    });
  });

  it('deleting an album leaves the original moment row', async () => {
    await withDatabase(async (file) => {
      const db = await openPreparedNodeSqliteDatabase(file);
      const repos = createSqliteRepositories(db);
      let moment = createDraftMoment(
        {
          content: { note: '还在', emotion: '' },
          origin: { type: 'created' },
        },
        { now: () => new Date('2026-10-01T01:00:00.000Z'), ownerId: LOCAL_OWNER_ID, id: () => 'moment_keep' },
      );
      moment = activateMoment(moment, LOCAL_OWNER_ID, new Date('2026-10-01T01:00:00.000Z'));
      await repos.moments.save(moment);
      const app = createUseCases({
        ...repos,
        clock: clockAt('2026-10-03T10:00:00.000Z'),
        albumId: () => 'album_delete',
      });
      const album = await app.createAlbum({ name: '要删' });
      await app.collectAlbumEntry({ albumId: album.id, momentId: 'moment_keep' });
      await app.deleteAlbum(album.id);
      expect((await repos.moments.findById('moment_keep')).kind).toBe('ready');
      const versions = await db.getAll<{ version: number }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      expect(versions.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      await db.close();
    });
  });
});
