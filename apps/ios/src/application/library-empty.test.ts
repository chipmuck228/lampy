import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import { activateMoment, createDraftMoment } from '../domain-adapters/moment-commands';
import { createMemoryMediaStore } from '../infrastructure/media';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { projectHistoryYearIndexFromCounts } from '../projections/history-projection';
import { createUseCases } from './use-cases';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

describe('personal library empty states', () => {
  it('treats recent and lookback as empty only for a real empty personal library', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({
      ...repos,
      media: createMemoryMediaStore(),
      clock: clockAt('2026-09-24T12:00:00.000Z'),
      timezoneOffsetMinutes: 0,
    });
    const recent = await app.getRecentLife();
    const book = await app.getLookbackBook();
    expect(recent.isFirstUse).toBe(true);
    expect(recent.items).toHaveLength(0);
    expect(book.isEmpty).toBe(true);
    expect(book.unknownCount).toBe(0);
  });

  it('clears both empty flags after the first personal moment is saved', async () => {
    const repos = createMemoryRepositories();
    const app = createUseCases({
      ...repos,
      media: createMemoryMediaStore(),
      clock: clockAt('2026-09-24T12:00:00.000Z'),
      timezoneOffsetMinutes: 0,
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '门口的风');
    await app.saveTextMoment(draft.draftId);
    expect((await app.getRecentLife()).isFirstUse).toBe(false);
    expect((await app.getLookbackBook()).isEmpty).toBe(false);
  });

  it('does not treat unknown occurredAt or a read failure as an empty library', async () => {
    expect(projectHistoryYearIndexFromCounts([], 2).isEmpty).toBe(false);
    expect(projectHistoryYearIndexFromCounts([], 0).isEmpty).toBe(true);
    const repos = createMemoryRepositories();
    const now = new Date('2026-09-24T12:00:00.000Z');
    let moment = createDraftMoment(
      {
        ownerId: LOCAL_OWNER_ID,
        content: { note: '日期未确认' },
        time: { recordedAt: now.toISOString(), occurredAtPrecision: 'unknown' },
        origin: { type: 'created' },
      },
      { now: () => now, ownerId: LOCAL_OWNER_ID, id: () => 'm_unknown' },
    );
    moment = activateMoment(moment, LOCAL_OWNER_ID, now);
    await repos.moments.save(moment);
    const app = createUseCases({
      ...repos,
      media: createMemoryMediaStore(),
      clock: clockAt('2026-09-24T12:00:00.000Z'),
      timezoneOffsetMinutes: 0,
    });
    const recent = await app.getRecentLife();
    const book = await app.getLookbackBook();
    expect(recent.isFirstUse).toBe(false);
    expect(book.isEmpty).toBe(false);
    expect(book.unknownCount).toBe(1);
  });
});
