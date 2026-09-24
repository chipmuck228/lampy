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

    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.id).toBe(saved.id);
      expect(detail.note).toBe('门口的风');
      expect(detail.usedRecordedAtFallback).toBe(true);
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
    expect(stored?.time.occurredAt).toBeUndefined();
    expect(stored?.time.occurredAtPrecision).toBe('unknown');
    expect(stored?.time.importedAt).toBeUndefined();
    expect(stored?.time.recordedAt).toBe('2026-09-24T06:00:00.000Z');
    expect(stored?.audit.createdAt).toBe('2026-09-24T06:00:00.000Z');
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
    await expect(app.saveTextMoment(secondDraft.draftId)).rejects.toThrow('disk full');
    expect((await app.getRecentLife()).items.map((item) => item.id)).toEqual([saved.id]);
  });
});
