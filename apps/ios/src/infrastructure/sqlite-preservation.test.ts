import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createUseCases } from '../application/use-cases';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import { activateMoment, createDraftMoment } from '../domain-adapters/moment-commands';
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


  it('reads one year by occurred range instead of every stored moment', async () => {
    await withDatabase(async (file) => {
      const db = await openPreparedNodeSqliteDatabase(file);
      const repos = createSqliteRepositories(db);
      for (const [id, occurredAt] of [
        ['old', '2025-12-31T12:00:00.000Z'],
        ['in-year', '2026-06-15T12:00:00.000Z'],
        ['next', '2027-01-02T12:00:00.000Z'],
      ] as const) {
        const now = new Date(occurredAt);
        let moment = createDraftMoment(
          {
            ownerId: LOCAL_OWNER_ID,
            content: { note: id },
            time: {
              recordedAt: occurredAt,
              occurredAt,
              occurredAtPrecision: 'day',
            },
            origin: { type: 'created' },
          },
          { now: () => now, ownerId: LOCAL_OWNER_ID, id: () => `moment_${id}` },
        );
        moment = activateMoment(moment, LOCAL_OWNER_ID, now);
        await repos.moments.save(moment);
      }
      const listed = await repos.moments.listActiveOccurred({
        startIso: '2026-01-01T00:00:00.000Z',
        endIso: '2027-01-01T00:00:00.000Z',
        precisions: ['exact', 'day', 'month', 'year'],
        limit: 50,
        offset: 0,
        order: 'occurred-asc',
      });
      expect(listed.items.map((item) => item.id)).toEqual(['moment_in-year']);
      expect(listed.hasMore).toBe(false);
      expect(
        await repos.moments.countActiveOccurred({
          startIso: '2026-01-01T00:00:00.000Z',
          endIso: '2027-01-01T00:00:00.000Z',
          precisions: ['day'],
        }),
      ).toBe(1);
      await db.close();
    });
  });

  it('keeps unknown precision off the year span even when occurred_at is set', async () => {
    await withDatabase(async (file) => {
      const db = await openPreparedNodeSqliteDatabase(file);
      const repos = createSqliteRepositories(db);
      const now = new Date('2026-06-15T12:00:00.000Z');
      let moment = createDraftMoment(
        {
          ownerId: LOCAL_OWNER_ID,
          content: { note: '精度不足' },
          time: {
            recordedAt: '2026-06-15T12:00:00.000Z',
            occurredAt: '2026-06-15T12:00:00.000Z',
            occurredAtPrecision: 'unknown',
          },
          origin: { type: 'created' },
        },
        { now: () => now, ownerId: LOCAL_OWNER_ID, id: () => 'moment_unknown_iso' },
      );
      moment = activateMoment(moment, LOCAL_OWNER_ID, now);
      await repos.moments.save(moment);
      expect(await repos.moments.occurredAtSpan(['exact', 'day', 'month', 'year'])).toBeNull();
      expect(await repos.moments.countActiveUnknown()).toBe(1);
      const unknown = await repos.moments.listActiveUnknown(10, 0);
      expect(unknown.items.map((item) => item.id)).toEqual(['moment_unknown_iso']);
      await db.close();
    });
  });

  it('pages a large year-unconfirmed shelf instead of loading every moment', async () => {
    await withDatabase(async (file) => {
      const db = await openPreparedNodeSqliteDatabase(file);
      const repos = createSqliteRepositories(db);
      for (let index = 0; index < 80; index += 1) {
        const occurredAt = new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString();
        const now = new Date(occurredAt);
        let moment = createDraftMoment(
          {
            ownerId: LOCAL_OWNER_ID,
            content: { note: `年精度${index}` },
            time: {
              recordedAt: occurredAt,
              occurredAt,
              occurredAtPrecision: 'year',
            },
            origin: { type: 'created' },
          },
          { now: () => now, ownerId: LOCAL_OWNER_ID, id: () => `moment_year_${index}` },
        );
        moment = activateMoment(moment, LOCAL_OWNER_ID, now);
        await repos.moments.save(moment);
      }
      const first = await repos.moments.listActiveOccurred({
        startIso: '2026-01-01T00:00:00.000Z',
        endIso: '2027-01-01T00:00:00.000Z',
        precisions: ['year'],
        limit: 50,
        offset: 0,
        order: 'occurred-asc',
      });
      const second = await repos.moments.listActiveOccurred({
        startIso: '2026-01-01T00:00:00.000Z',
        endIso: '2027-01-01T00:00:00.000Z',
        precisions: ['year'],
        limit: 50,
        offset: 50,
        order: 'occurred-asc',
      });
      expect(first.items).toHaveLength(50);
      expect(first.hasMore).toBe(true);
      expect(second.items).toHaveLength(30);
      expect(second.hasMore).toBe(false);
      expect(
        await repos.moments.countActiveOccurred({
          startIso: '2026-01-01T00:00:00.000Z',
          endIso: '2027-01-01T00:00:00.000Z',
          precisions: ['year'],
        }),
      ).toBe(80);
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
        expect(detail.audio?.reason).toBe('missing');
        expect(detail.audio?.unavailableLabel).toBe('这段声音暂时找不到了，其他内容仍然保留。');
      }
      await db.close();
    });
  });

  it('does not show a damaged audio asset row as a photo', async () => {
    await withDatabase(async (file) => {
      const mediaRoot = path.join(path.dirname(file), 'assets');
      const source = path.join(path.dirname(file), 'voice.m4a');
      await writeFile(source, Buffer.from('m4a-bytes'));
      const media = createNodeMediaStore(mediaRoot);
      const db = await openPreparedNodeSqliteDatabase(file);
      const app = createUseCases({
        ...createSqliteRepositories(db),
        media,
        clock: clockAt('2026-09-24T19:00:00.000Z'),
        assetId: () => 'asset_voice_damaged',
      });
      const draft = await app.restoreOrCreateDraft();
      await app.updateDraftNote(draft.draftId, '声音坏了不是照片');
      await app.addRecordedAudio(draft.draftId, {
        sourceUri: source,
        durationMs: 1800,
        mimeType: 'audio/mp4',
      });
      const saved = await app.saveTextMoment(draft.draftId);
      await db.run('UPDATE assets SET json = ? WHERE id = ?', [
        '{not-json',
        'asset_voice_damaged',
      ]);

      const repos = createSqliteRepositories(db);
      expect(await repos.assets.findById('asset_voice_damaged')).toEqual({
        kind: 'unreadable',
        type: 'audio',
      });
      const detail = await app.getMomentDetail(saved.id);
      expect(detail.kind).toBe('ready');
      if (detail.kind === 'ready') {
        expect(detail.note).toBe('声音坏了不是照片');
        expect(detail.images).toHaveLength(0);
        expect(detail.audio?.status).toBe('unavailable');
        expect(detail.audio?.reason).toBe('missing');
        expect(detail.audio?.unavailableLabel).toBe('这段声音暂时找不到了，其他内容仍然保留。');
      }
      await db.close();
    });
  });

  it('keeps a generated-format audio id visible after its asset row is deleted', async () => {
    await withDatabase(async (file) => {
      const mediaRoot = path.join(path.dirname(file), 'assets');
      const source = path.join(path.dirname(file), 'voice.m4a');
      const photoSource = path.join(path.dirname(file), 'source.jpg');
      await writeFile(source, Buffer.from('m4a-bytes'));
      await writeFile(photoSource, TINY_JPEG);
      const media = createNodeMediaStore(mediaRoot);
      const db = await openPreparedNodeSqliteDatabase(file);
      const app = createUseCases({
        ...createSqliteRepositories(db),
        media,
        clock: clockAt('2026-09-24T20:00:00.000Z'),
      });
      const draft = await app.restoreOrCreateDraft();
      await app.updateDraftNote(draft.draftId, '字还在');
      await app.addPickedImages(draft.draftId, [
        { sourceUri: photoSource, mimeType: 'image/jpeg', width: 1, height: 1 },
      ]);
      await app.addRecordedAudio(draft.draftId, {
        sourceUri: source,
        durationMs: 1800,
        mimeType: 'audio/mp4',
      });
      const composer = await app.restoreOrCreateDraft();
      expect(composer.audio?.id).toMatch(/^asset_\d+_[a-z0-9]+$/);
      const audioId = composer.audio?.id;
      if (!audioId) throw new Error('expected generated audio id');
      const saved = await app.saveTextMoment(draft.draftId);
      await db.run('DELETE FROM assets WHERE id = ?', [audioId]);

      const detail = await app.getMomentDetail(saved.id);
      expect(detail.kind).toBe('ready');
      if (detail.kind === 'ready') {
        expect(detail.id).toBe(saved.id);
        expect(detail.note).toBe('字还在');
        expect(detail.images).toHaveLength(1);
        expect(detail.audio).toBeNull();
        expect(detail.unknownMedia).toEqual([
          {
            id: audioId,
            status: 'unavailable',
            label: '这份内容',
            unavailableLabel: '这份内容暂时无法打开。',
          },
        ]);
      }
      await db.close();
    });
  });

  it('keeps the draft and existing moment when a later photo write fails, then retries once', async () => {
    await withDatabase(async (file) => {
      const mediaRoot = path.join(path.dirname(file), 'assets');
      const firstSource = path.join(path.dirname(file), 'kept.jpg');
      const failSource = path.join(path.dirname(file), 'fail.jpg');
      await writeFile(firstSource, TINY_JPEG);
      await writeFile(failSource, TINY_JPEG);
      const media = createNodeMediaStore(mediaRoot);
      const db = await openPreparedNodeSqliteDatabase(file);
      const repos = createSqliteRepositories(db);
      const first = createUseCases({
        ...repos,
        media,
        clock: clockAt('2026-09-24T21:00:00.000Z'),
        id: () => 'moment_kept',
        assetId: () => 'asset_kept_photo',
      });
      const firstDraft = await first.restoreOrCreateDraft();
      await first.updateDraftNote(firstDraft.draftId, '已经留下');
      const saved = await first.saveTextMoment(firstDraft.draftId);

      const innerAssetSave = repos.assets.save.bind(repos.assets);
      let failAsset = true;
      repos.assets.save = async (asset) => {
        if (failAsset) throw Object.assign(new Error('SQLITE_FULL'), { code: 'SQLITE_FULL' });
        return innerAssetSave(asset);
      };
      const app = createUseCases({
        ...repos,
        media,
        clock: clockAt('2026-09-24T21:01:00.000Z'),
        assetId: () => (failAsset ? 'asset_fail_photo' : 'asset_retry_photo'),
      });
      const draft = await app.restoreOrCreateDraft();
      await app.updateDraftNote(draft.draftId, '这次要留下照片');
      await expect(
        app.addPickedImages(draft.draftId, [
          { sourceUri: failSource, mimeType: 'image/jpeg', width: 1, height: 1 },
        ]),
      ).rejects.toMatchObject({ code: 'DISK_FULL' });

      const restored = await app.restoreOrCreateDraft();
      expect(restored.note).toBe('这次要留下照片');
      expect(restored.images).toHaveLength(0);
      expect(await repos.assets.findById('asset_fail_photo')).toEqual({ kind: 'missing' });
      expect((await app.getRecentLife()).items.map((item) => item.id)).toEqual([saved.id]);
      expect((await repos.moments.findById(saved.id)).kind).toBe('ready');

      failAsset = false;
      const retried = await app.addPickedImages(draft.draftId, [
        { sourceUri: firstSource, mimeType: 'image/jpeg', width: 1, height: 1 },
      ]);
      expect(retried.images.map((item) => item.id)).toEqual(['asset_retry_photo']);
      expect((await repos.assets.findById('asset_fail_photo')).kind).toBe('missing');
      expect((await repos.assets.findById('asset_retry_photo')).kind).toBe('ready');
      await db.close();
    });
  });
});
