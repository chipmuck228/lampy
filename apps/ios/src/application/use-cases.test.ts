import { createUseCases } from './use-cases';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { ApplicationError } from './errors';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

describe('text-only personal moment use cases', () => {
  it('creates, persists, lists, and opens the exact id', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-09-24T02:00:00.000Z'),
      timezoneOffsetMinutes: 0,
    });

    const draft = await app.restoreOrCreateDraft();
    expect(draft.isRestored).toBe(false);
    await app.updateDraftNote(draft.draftId, '  门口的风  ');
    const saved = await app.saveTextMoment(draft.draftId);

    const recent = await app.getRecentLife();
    expect(recent.isFirstUse).toBe(false);
    expect(recent.items).toHaveLength(1);
    expect(recent.items[0].id).toBe(saved.id);
    expect(recent.items[0].note).toBe('门口的风');
    expect(recent.items[0].feeling).toBeNull();
    expect(recent.items[0].dayKey).toBe('2026-09-24');
    expect(recent.items[0].dayLabel).toBe('9月24日');
    expect(recent.days).toHaveLength(1);
    expect(recent.days[0].key).toBe('2026-09-24');
    expect(recent.days[0].label).toBe('记录于 9月24日');
    expect(recent.items[0].dateLabel).toBe('记录于 9月24日');
    expect(recent.items[0].occurredLabel).toBeNull();

    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.id).toBe(saved.id);
      expect(detail.note).toBe('门口的风');
      expect(detail.usedRecordedAtFallback).toBe(true);
      expect(detail.feeling).toBeNull();
    }
  });

  it('restores the same draft id without activating it', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({ ...repos, clock: clockAt('2026-09-24T03:00:00.000Z') });
    const first = await app.restoreOrCreateDraft();
    await app.updateDraftNote(first.draftId, '还没留下');
    const second = await app.restoreOrCreateDraft();
    expect(second.draftId).toBe(first.draftId);
    expect(second.isRestored).toBe(true);
    expect(second.note).toBe('还没留下');
    expect((await app.getRecentLife()).items).toHaveLength(0);
  });

  it('returns the same draft when restore is called twice at once', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({ ...repos, clock: clockAt('2026-09-24T03:30:00.000Z') });
    const [first, second] = await Promise.all([app.restoreOrCreateDraft(), app.restoreOrCreateDraft()]);
    expect(second.draftId).toBe(first.draftId);
    expect((await app.getRecentLife()).items).toHaveLength(0);
  });

  it('does not create a second moment when save is repeated', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({ ...repos, clock: clockAt('2026-09-24T04:00:00.000Z') });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '同一句');
    const first = await app.saveTextMoment(draft.draftId);
    const second = await app.saveTextMoment(draft.draftId);
    expect(second.id).toBe(first.id);
    expect((await app.getRecentLife()).items).toHaveLength(1);
  });

  it('does not fall back to another moment when the id is missing', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({ ...repos, clock: clockAt('2026-09-24T05:00:00.000Z') });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '留下的这一条');
    const saved = await app.saveTextMoment(draft.draftId);

    const missing = await app.getMomentDetail('moment_does_not_exist');
    expect(missing).toEqual({ kind: 'missing', requestedId: 'moment_does_not_exist' });
    const existing = await app.getMomentDetail(saved.id);
    expect(existing.kind).toBe('ready');
    if (existing.kind === 'ready') {
      expect(existing.id).toBe(saved.id);
    }
  });

  it('does not use importedAt as the occurred time', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({ ...repos, clock: clockAt('2026-09-24T06:00:00.000Z') });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '只有记录时间');
    const saved = await app.saveTextMoment(draft.draftId);
    const stored = await repos.moments.findById(saved.id);
    expect(stored.kind).toBe('ready');
    if (stored.kind !== 'ready') return;
    expect(stored.moment.time.occurredAt).toBeUndefined();
    expect(stored.moment.time.occurredAtPrecision).toBe('unknown');
    expect(stored.moment.time.importedAt).toBeUndefined();
    expect(stored.moment.time.recordedAt).toBe('2026-09-24T06:00:00.000Z');
    expect(stored.moment.audit.createdAt).toBe('2026-09-24T06:00:00.000Z');
    const recent = await createUseCases({
      ...repos,
      clock: clockAt('2026-09-24T06:00:00.000Z'),
      timezoneOffsetMinutes: 0,
    }).getRecentLife();
    expect(recent.items[0].dayKey).toBe('2026-09-24');
    expect(recent.items[0].dayLabel).toBe('9月24日');
    expect(recent.items[0].dateLabel).toBe('记录于 9月24日');
    expect(recent.items[0].occurredLabel).toBeNull();
    expect(recent.days[0].key).toBe('2026-09-24');
    expect(recent.days[0].label).toBe('记录于 9月24日');
  });

  it('leaves stored moments untouched when save fails on an empty note', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({ ...repos, clock: clockAt('2026-09-24T07:00:00.000Z') });
    const firstDraft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(firstDraft.draftId, '已经留下');
    const saved = await app.saveTextMoment(firstDraft.draftId);

    const empty = await app.restoreOrCreateDraft();
    expect(empty.draftId).not.toBe(saved.id);
    await expect(app.saveTextMoment(empty.draftId)).rejects.toBeInstanceOf(ApplicationError);
    expect((await app.getRecentLife()).items.map((item) => item.id)).toEqual([saved.id]);
  });

  it('still lists the same moment after a new use-case instance is created', async () => {
    const repos = createMemoryRepositories();
    const first = createUseCases({ ...repos, clock: clockAt('2026-09-24T08:00:00.000Z') });
    const draft = await first.restoreOrCreateDraft();
    await first.updateDraftNote(draft.draftId, '关掉再打开还在');
    const saved = await first.saveTextMoment(draft.draftId);

    const restarted = createUseCases({ ...repos, clock: clockAt('2026-09-24T08:01:00.000Z') });
    const recent = await restarted.getRecentLife();
    expect(recent.items.map((item) => item.id)).toEqual([saved.id]);
    expect(recent.items[0].note).toBe('关掉再打开还在');
    const detail = await restarted.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.note).toBe('关掉再打开还在');
    }
  });

  it('does not delete an existing moment when a later save throws', async () => {
    const repos = createMemoryRepositories();
    const innerSave = repos.moments.save.bind(repos.moments);
    let failNext = false;
    repos.moments.save = async (moment) => {
      if (failNext) throw new Error('disk full');
      return innerSave(moment);
    };
    const app = createUseCases({ ...repos, clock: clockAt('2026-09-24T09:00:00.000Z') });
    const firstDraft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(firstDraft.draftId, '先留下的');
    const saved = await app.saveTextMoment(firstDraft.draftId);

    failNext = true;
    const secondDraft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(secondDraft.draftId, '这次失败');
    await expect(app.saveTextMoment(secondDraft.draftId)).rejects.toMatchObject({
      code: 'DISK_FULL',
      message: '这次没有留下正式记录。草稿还在，可以清出空间后再试。',
    });
    expect((await app.getRecentLife()).items.map((item) => item.id)).toEqual([saved.id]);
  });

  it('does not treat an unreadable moment as missing', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({ ...repos, clock: clockAt('2026-09-24T10:00:00.000Z') });
    const originalFind = repos.moments.findById.bind(repos.moments);
    repos.moments.findById = async (id) =>
      id === 'moment_damaged' ? { kind: 'unreadable' } : originalFind(id);

    const missing = await app.getMomentDetail('moment_does_not_exist');
    expect(missing).toEqual({ kind: 'missing', requestedId: 'moment_does_not_exist' });
    const damaged = await app.getMomentDetail('moment_damaged');
    expect(damaged).toEqual({ kind: 'error', requestedId: 'moment_damaged' });
  });
});

describe('leave occurred date', () => {
  it('saves today onto the viewer calendar day and places it in lookback', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-09-26T16:30:00.000Z'),
      timezoneOffsetMinutes: 480,
    });
    const draft = await app.restoreOrCreateDraft();
    expect(draft.occurred.kind).toBe('unknown');
    expect(draft.today).toEqual({ year: 2026, month: 9, day: 27 });
    await app.updateDraftNote(draft.draftId, '今天的门口');
    const composer = await app.updateDraftOccurred(draft.draftId, { kind: 'today' });
    expect(composer.occurred).toEqual({
      kind: 'today',
      year: 2026,
      month: 9,
      day: 27,
      label: '今天',
    });

    const saved = await app.saveTextMoment(draft.draftId);
    const stored = await repos.moments.findById(saved.id);
    expect(stored.kind).toBe('ready');
    if (stored.kind !== 'ready') return;
    expect(stored.moment.time.occurredAt).toBe('2026-09-26T16:00:00.000Z');
    expect(stored.moment.time.occurredAtPrecision).toBe('day');
    expect(stored.moment.time.recordedAt).toBe('2026-09-26T16:30:00.000Z');

    const recent = await app.getRecentLife();
    expect(recent.items[0].dateLabel).toBe('记录于 9月27日');
    expect(recent.items[0].occurredLabel).toBeNull();
    expect(recent.days[0].label).toBe('记录于 9月27日');
    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.dateLabel).toBe('2026年9月27日');
      expect(detail.usedRecordedAtFallback).toBe(false);
    }
    const day = await app.getHistoryDay(2026, 9, 27);
    expect('invalid' in day ? day : day.items.map((item) => item.id)).toEqual([saved.id]);
    expect('invalid' in day ? '' : day.title).toBe('2026年9月27日');
    expect('invalid' in day ? '' : day.items[0].timeLabel).toBe('2026年9月27日');
    const unknown = await app.getHistoryUnknown();
    expect(unknown.items.map((item) => item.id)).toEqual([]);
  });

  it('places a past day and keeps unknown as unconfirmed', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-09-27T02:00:00.000Z'),
      timezoneOffsetMinutes: 480,
    });
    const past = await app.restoreOrCreateDraft();
    await app.updateDraftNote(past.draftId, '上周的风');
    await app.updateDraftOccurred(past.draftId, { kind: 'day', year: 2026, month: 9, day: 20 });
    const pastSaved = await app.saveTextMoment(past.draftId);

    const unsure = await app.restoreOrCreateDraft();
    await app.updateDraftNote(unsure.draftId, '想不起来哪天');
    await app.updateDraftOccurred(unsure.draftId, { kind: 'unknown' });
    const unsureSaved = await app.saveTextMoment(unsure.draftId);

    const pastStored = await repos.moments.findById(pastSaved.id);
    expect(pastStored.kind).toBe('ready');
    if (pastStored.kind === 'ready') {
      expect(pastStored.moment.time.occurredAt).toBe('2026-09-19T16:00:00.000Z');
      expect(pastStored.moment.time.occurredAtPrecision).toBe('day');
    }
    const unsureStored = await repos.moments.findById(unsureSaved.id);
    expect(unsureStored.kind).toBe('ready');
    if (unsureStored.kind === 'ready') {
      expect(unsureStored.moment.time.occurredAt).toBeUndefined();
      expect(unsureStored.moment.time.occurredAtPrecision).toBe('unknown');
    }

    const day = await app.getHistoryDay(2026, 9, 20);
    expect('invalid' in day ? day : day.items.map((item) => item.id)).toEqual([pastSaved.id]);
    const unknown = await app.getHistoryUnknown();
    expect(unknown.items.map((item) => item.id)).toEqual([unsureSaved.id]);
    expect(unknown.items[0].timeLabel).toBe('时间未确认');
    const recent = await app.getRecentLife();
    const pastRecent = recent.items.find((item) => item.id === pastSaved.id);
    const unsureRecent = recent.items.find((item) => item.id === unsureSaved.id);
    expect(pastRecent?.dateLabel).toBe('记录于 9月27日');
    expect(pastRecent?.occurredLabel).toBe('发生于 2026年9月20日');
    expect(unsureRecent?.dateLabel).toBe('记录于 9月27日');
    expect(unsureRecent?.occurredLabel).toBeNull();
    expect(recent.days).toHaveLength(1);
    expect(recent.days[0].label).toBe('记录于 9月27日');
    expect(recent.days[0].items.map((item) => item.id).sort()).toEqual(
      [pastSaved.id, unsureSaved.id].sort(),
    );
  });

  it('keeps a later write under the recorded day while showing the confirmed occurrence', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-09-27T03:00:00.000Z'),
      timezoneOffsetMinutes: 480,
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '门口的风');
    await app.updateDraftOccurred(draft.draftId, { kind: 'day', year: 2026, month: 9, day: 24 });
    const saved = await app.saveTextMoment(draft.draftId);
    const stored = await repos.moments.findById(saved.id);
    expect(stored.kind).toBe('ready');
    if (stored.kind === 'ready') {
      expect(stored.moment.time.occurredAt).toBe('2026-09-23T16:00:00.000Z');
      expect(stored.moment.time.recordedAt).toBe('2026-09-27T03:00:00.000Z');
    }

    const recent = await app.getRecentLife();
    expect(recent.days[0].key).toBe('2026-09-27');
    expect(recent.days[0].label).toBe('记录于 9月27日');
    expect(recent.items[0].dateLabel).toBe('记录于 9月27日');
    expect(recent.items[0].occurredLabel).toBe('发生于 2026年9月24日');
    expect(recent.items[0].note).toBe('门口的风');

    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.dateLabel).toBe('2026年9月24日');
      expect(detail.usedRecordedAtFallback).toBe(false);
    }
    const day = await app.getHistoryDay(2026, 9, 24);
    expect('invalid' in day ? day : day.items.map((item) => item.id)).toEqual([saved.id]);
    const recordedDay = await app.getHistoryDay(2026, 9, 27);
    expect('invalid' in recordedDay ? recordedDay : recordedDay.items.map((item) => item.id)).toEqual([]);
  });

  it('restores the chosen date and keeps it when save fails', async () => {
    const repos = createMemoryRepositories();
    const innerSave = repos.moments.save.bind(repos.moments);
    repos.moments.save = async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-09-27T03:00:00.000Z'),
      timezoneOffsetMinutes: 480,
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '先记着日期');
    await app.updateDraftOccurred(draft.draftId, { kind: 'day', year: 2026, month: 9, day: 18 });
    await expect(app.saveTextMoment(draft.draftId)).rejects.toMatchObject({ code: 'DISK_FULL' });

    const restored = await app.restoreOrCreateDraft();
    expect(restored.draftId).toBe(draft.draftId);
    expect(restored.isRestored).toBe(true);
    expect(restored.occurred).toEqual({
      kind: 'day',
      year: 2026,
      month: 9,
      day: 18,
      label: '9月18日',
    });
    const stillDraft = await repos.drafts.loadActive();
    expect(stillDraft?.time.occurredAt).toBe('2026-09-17T16:00:00.000Z');
    expect(stillDraft?.time.occurredAtPrecision).toBe('day');

    repos.moments.save = innerSave;
    const saved = await app.saveTextMoment(draft.draftId);
    const stored = await repos.moments.findById(saved.id);
    expect(stored.kind).toBe('ready');
    if (stored.kind === 'ready') {
      expect(stored.moment.time.occurredAt).toBe('2026-09-17T16:00:00.000Z');
      expect(stored.moment.time.occurredAtPrecision).toBe('day');
    }
  });

  it('does not migrate already saved unknown records onto today', async () => {
    const repos = createMemoryRepositories();
    const older = createUseCases({
      ...repos,
      clock: clockAt('2026-09-20T04:00:00.000Z'),
      timezoneOffsetMinutes: 480,
    });
    const oldDraft = await older.restoreOrCreateDraft();
    await older.updateDraftNote(oldDraft.draftId, '以前没确认过时间');
    const oldSaved = await older.saveTextMoment(oldDraft.draftId);
    const before = await repos.moments.findById(oldSaved.id);
    expect(before.kind).toBe('ready');
    if (before.kind !== 'ready') return;
    expect(before.moment.time.occurredAtPrecision).toBe('unknown');

    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-09-27T04:00:00.000Z'),
      timezoneOffsetMinutes: 480,
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '新的今天');
    await app.updateDraftOccurred(draft.draftId, { kind: 'today' });
    const saved = await app.saveTextMoment(draft.draftId);

    const stillOld = await repos.moments.findById(oldSaved.id);
    expect(stillOld.kind).toBe('ready');
    if (stillOld.kind === 'ready') {
      expect(stillOld.moment.time.occurredAt).toBeUndefined();
      expect(stillOld.moment.time.occurredAtPrecision).toBe('unknown');
      expect(stillOld.moment.time.recordedAt).toBe('2026-09-20T04:00:00.000Z');
    }
    const unknown = await app.getHistoryUnknown();
    expect(unknown.items.map((item) => item.id)).toEqual([oldSaved.id]);
    const today = await app.getHistoryDay(2026, 9, 27);
    expect('invalid' in today ? today : today.items.map((item) => item.id)).toEqual([saved.id]);
  });

  it('keeps recent, detail, and lookback on the same viewer day around midnight', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({
      ...repos,
      clock: clockAt('2026-09-26T16:05:00.000Z'),
      timezoneOffsetMinutes: 480,
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '刚过午夜');
    await app.updateDraftOccurred(draft.draftId, { kind: 'today' });
    const saved = await app.saveTextMoment(draft.draftId);

    const recent = await app.getRecentLife();
    const detail = await app.getMomentDetail(saved.id);
    const day = await app.getHistoryDay(2026, 9, 27);
    expect(recent.items[0].dateLabel).toBe('记录于 9月27日');
    expect(recent.items[0].occurredLabel).toBeNull();
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') expect(detail.dateLabel).toBe('2026年9月27日');
    expect('invalid' in day ? '' : day.title).toBe('2026年9月27日');
    expect('invalid' in day ? '' : day.items[0].timeLabel).toBe('2026年9月27日');

    const utcApp = createUseCases({
      ...repos,
      clock: clockAt('2026-09-26T16:05:00.000Z'),
      timezoneOffsetMinutes: 0,
    });
    const utcDetail = await utcApp.getMomentDetail(saved.id);
    expect(utcDetail.kind).toBe('ready');
    if (utcDetail.kind === 'ready') expect(utcDetail.dateLabel).toBe('2026年9月26日');
    const utcDay = await utcApp.getHistoryDay(2026, 9, 26);
    expect('invalid' in utcDay ? utcDay : utcDay.items.map((item) => item.id)).toEqual([saved.id]);
  });
});
