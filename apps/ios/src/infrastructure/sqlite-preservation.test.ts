import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createUseCases } from '../application/use-cases';
import { ERROR_CODES } from '../domain-adapters/errors';
import { createNodeMediaStore } from './node-media';
import { openPreparedNodeSqliteDatabase } from './node-sqlite';
import { createSqliteRepositories, listQuarantine } from './sqlite-repositories';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAkAAwADAAIDAwMEBAQFBQQFBQUFBwcHBw4JCAoKCgoODw8PDxAQEBAREREREREREREREREREREREREREf/AABEIAAEAAQMBEQACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAA4EAACAQMDAgQDBAcIBQEBAAABAgMABBEFEiExQQYTUWEicYEHFDKRobHBCBVS0eHw8RYkM2Jy/8QAGQEAAwEBAQAAAAAAAAAAAAAAAAECAwQF/8QAIhEAAgICAgIDAQEAAAAAAAAAAAECEQMhEjEEQSJREzJh/9oADAMBAAIRAxEAPwB9oD//2Q==',
  'base64',
);

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

  it('keeps persisted photos after closing the database file', async () => {
    await withDatabase(async (file) => {
      const mediaRoot = path.join(path.dirname(file), 'assets');
      const source = path.join(path.dirname(file), 'source.jpg');
      await writeFile(source, TINY_JPEG);
      const media = createNodeMediaStore(mediaRoot);
      const firstDb = await openPreparedNodeSqliteDatabase(file);
      const first = createUseCases({
        ...createSqliteRepositories(firstDb),
        media,
        clock: clockAt('2026-09-24T15:00:00.000Z'),
        assetId: () => 'asset_file',
      });
      const draft = await first.restoreOrCreateDraft();
      await first.updateDraftNote(draft.draftId, '文件关掉还在');
      await first.addPickedImages(draft.draftId, [
        { sourceUri: source, mimeType: 'image/jpeg', width: 1, height: 1 },
      ]);
      const saved = await first.saveTextMoment(draft.draftId);
      await firstDb.close();

      const secondDb = await openPreparedNodeSqliteDatabase(file);
      const second = createUseCases({
        ...createSqliteRepositories(secondDb),
        media,
        clock: clockAt('2026-09-24T15:01:00.000Z'),
      });
      const recent = await second.getRecentLife();
      expect(recent.items[0].id).toBe(saved.id);
      expect(recent.items[0].images[0].status).toBe('available');
      const detail = await second.getMomentDetail(saved.id);
      expect(detail.kind).toBe('ready');
      if (detail.kind === 'ready') {
        expect(detail.note).toBe('文件关掉还在');
        expect(detail.images[0].status).toBe('available');
      }
      await secondDb.close();
    });
  });

  it('keeps the moment when the image file is later removed', async () => {
    await withDatabase(async (file) => {
      const mediaRoot = path.join(path.dirname(file), 'assets');
      const source = path.join(path.dirname(file), 'source.jpg');
      await writeFile(source, TINY_JPEG);
      const media = createNodeMediaStore(mediaRoot);
      const db = await openPreparedNodeSqliteDatabase(file);
      const app = createUseCases({
        ...createSqliteRepositories(db),
        media,
        clock: clockAt('2026-09-24T16:00:00.000Z'),
        assetId: () => 'asset_deleted',
      });
      const draft = await app.restoreOrCreateDraft();
      await app.updateDraftNote(draft.draftId, '图没了字还在');
      await app.addPickedImages(draft.draftId, [
        { sourceUri: source, mimeType: 'image/jpeg', width: 1, height: 1 },
      ]);
      const saved = await app.saveTextMoment(draft.draftId);
      const stored = await createSqliteRepositories(db).assets.findById('asset_deleted');
      if (stored.kind !== 'ready') throw new Error('expected asset');
      await rm(stored.asset.localUri, { force: true });

      const detail = await app.getMomentDetail(saved.id);
      expect(detail).toMatchObject({
        kind: 'ready',
        id: saved.id,
        note: '图没了字还在',
      });
      if (detail.kind === 'ready') {
        expect(detail.images[0].status).toBe('unavailable');
      }
      expect(await app.getMomentDetail('missing')).toEqual({
        kind: 'missing',
        requestedId: 'missing',
      });
      await db.close();
    });
  });

  it('keeps persisted audio after closing the database file', async () => {
    await withDatabase(async (file) => {
      const mediaRoot = path.join(path.dirname(file), 'assets');
      const source = path.join(path.dirname(file), 'voice.m4a');
      await writeFile(source, Buffer.from('m4a-bytes'));
      const media = createNodeMediaStore(mediaRoot);
      const firstDb = await openPreparedNodeSqliteDatabase(file);
      const first = createUseCases({
        ...createSqliteRepositories(firstDb),
        media,
        clock: clockAt('2026-09-24T17:00:00.000Z'),
        assetId: () => 'asset_voice_file',
      });
      const draft = await first.restoreOrCreateDraft();
      await first.updateDraftNote(draft.draftId, '文件关掉还有声音');
      await first.addRecordedAudio(draft.draftId, {
        sourceUri: source,
        durationMs: 2400,
        mimeType: 'audio/mp4',
      });
      const saved = await first.saveTextMoment(draft.draftId);
      await firstDb.close();

      const secondDb = await openPreparedNodeSqliteDatabase(file);
      const second = createUseCases({
        ...createSqliteRepositories(secondDb),
        media,
        clock: clockAt('2026-09-24T17:01:00.000Z'),
      });
      const recent = await second.getRecentLife();
      expect(recent.items[0].id).toBe(saved.id);
      expect(recent.items[0].audio?.status).toBe('available');
      const detail = await second.getMomentDetail(saved.id);
      expect(detail.kind).toBe('ready');
      if (detail.kind === 'ready') {
        expect(detail.note).toBe('文件关掉还有声音');
        expect(detail.audio?.status).toBe('available');
      }
      await secondDb.close();
    });
  });

  it('keeps the moment when the audio file is later removed', async () => {
    await withDatabase(async (file) => {
      const mediaRoot = path.join(path.dirname(file), 'assets');
      const source = path.join(path.dirname(file), 'voice.m4a');
      await writeFile(source, Buffer.from('m4a-bytes'));
      const media = createNodeMediaStore(mediaRoot);
      const db = await openPreparedNodeSqliteDatabase(file);
      const app = createUseCases({
        ...createSqliteRepositories(db),
        media,
        clock: clockAt('2026-09-24T18:00:00.000Z'),
        assetId: () => 'asset_voice_deleted',
      });
      const draft = await app.restoreOrCreateDraft();
      await app.updateDraftNote(draft.draftId, '声音没了字还在');
      await app.addRecordedAudio(draft.draftId, {
        sourceUri: source,
        durationMs: 1800,
        mimeType: 'audio/mp4',
      });
      const saved = await app.saveTextMoment(draft.draftId);
      const stored = await createSqliteRepositories(db).assets.findById('asset_voice_deleted');
      if (stored.kind !== 'ready') throw new Error('expected asset');
      await rm(stored.asset.localUri, { force: true });

      const detail = await app.getMomentDetail(saved.id);
      expect(detail).toMatchObject({
        kind: 'ready',
        id: saved.id,
        note: '声音没了字还在',
      });
      if (detail.kind === 'ready') {
        expect(detail.audio?.status).toBe('unavailable');
        expect(detail.audio?.unavailableLabel).toBe('这段声音暂时无法播放，其他内容仍然保留。');
      }
      await db.close();
    });
  });
});
