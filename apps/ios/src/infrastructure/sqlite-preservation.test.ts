import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createUseCases } from '../application/use-cases';
import { ERROR_CODES } from '../domain-adapters/errors';
import { openPreparedNodeSqliteDatabase } from './node-sqlite';
import { createSqliteRepositories, listQuarantine } from './sqlite-repositories';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

async function withDatabase<T>(run: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lampy-sqlite-'));
  const file = path.join(dir, 'lampy.db');
  try {
    return await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('sqlite file preservation', () => {
  it('still reads the same moment after closing and reopening the file', async () => {
    await withDatabase(async (file) => {
      const firstDb = await openPreparedNodeSqliteDatabase(file);
      const first = createUseCases({
        ...createSqliteRepositories(firstDb),
        clock: clockAt('2026-09-24T11:00:00.000Z'),
      });
      const draft = await first.restoreOrCreateDraft();
      await first.updateDraftNote(draft.draftId, '关掉文件再打开还在');
      const saved = await first.saveTextMoment(draft.draftId);
      await firstDb.close();

      const secondDb = await openPreparedNodeSqliteDatabase(file);
      const second = createUseCases({
        ...createSqliteRepositories(secondDb),
        clock: clockAt('2026-09-24T11:01:00.000Z'),
      });
      const recent = await second.getRecentLife();
      expect(recent.items.map((item) => item.id)).toEqual([saved.id]);
      expect(recent.items[0].note).toBe('关掉文件再打开还在');
      const detail = await second.getMomentDetail(saved.id);
      expect(detail.kind).toBe('ready');
      if (detail.kind === 'ready') {
        expect(detail.note).toBe('关掉文件再打开还在');
      }
      await secondDb.close();
    });
  });

  it('keeps a damaged row, quarantines it, and does not show it as a normal moment', async () => {
    await withDatabase(async (file) => {
      const db = await openPreparedNodeSqliteDatabase(file);
      await db.run(
        `INSERT INTO moments (id, owner_id, lifecycle_status, recorded_at, occurred_at, json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'broken-moment',
          'local-user',
          'active',
          '2026-09-24T11:00:00.000Z',
          null,
          JSON.stringify({ id: 'broken-moment', text: true }),
        ],
      );
      const repos = createSqliteRepositories(db);
      const listed = await repos.moments.listRecent();
      expect(listed.map((item) => item.id)).not.toContain('broken-moment');
      expect(await repos.moments.findById('broken-moment')).toEqual({ kind: 'unreadable' });

      const raw = await db.getFirst<{ json: string }>(
        'SELECT json FROM moments WHERE id = ?',
        ['broken-moment'],
      );
      expect(raw?.json).toContain('"text":true');

      const quarantine = await listQuarantine(db);
      expect(quarantine).toHaveLength(1);
      expect(quarantine[0].entity_type).toBe('moment');
      expect(quarantine[0].raw_json).toContain('broken-moment');
      await db.close();
    });
  });

  it('refuses to overwrite a damaged original row', async () => {
    await withDatabase(async (file) => {
      const db = await openPreparedNodeSqliteDatabase(file);
      await db.run(
        `INSERT INTO moments (id, owner_id, lifecycle_status, recorded_at, occurred_at, json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'broken-moment',
          'local-user',
          'active',
          '2026-09-24T12:00:00.000Z',
          null,
          JSON.stringify({ id: 'broken-moment', text: true }),
        ],
      );
      const repos = createSqliteRepositories(db);
      const app = createUseCases({
        ...repos,
        clock: clockAt('2026-09-24T12:01:00.000Z'),
      });
      const draft = await app.restoreOrCreateDraft();
      await app.updateDraftNote(draft.draftId, '另一条合法记录');
      const saved = await app.saveTextMoment(draft.draftId);
      const valid = await repos.moments.findById(saved.id);
      if (valid.kind !== 'ready') throw new Error('expected the new moment to be readable');

      await expect(repos.moments.save({ ...valid.moment, id: 'broken-moment' })).rejects.toMatchObject({
        code: ERROR_CODES.REPOSITORY_INVALID_RECORD,
      });

      const raw = await db.getFirst<{ json: string }>(
        'SELECT json FROM moments WHERE id = ?',
        ['broken-moment'],
      );
      expect(raw?.json).toContain('"text":true');
      expect(await repos.moments.findById('broken-moment')).toEqual({ kind: 'unreadable' });
      expect(await app.getMomentDetail('broken-moment')).toEqual({
        kind: 'error',
        requestedId: 'broken-moment',
      });
      await db.close();
    });
  });
});
