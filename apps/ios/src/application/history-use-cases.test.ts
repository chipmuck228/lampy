import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import {
  activateMoment,
  createDraftMoment,
} from '../domain-adapters/moment-commands';
import { createMemoryMediaStore } from '../infrastructure/media';
import { createMemoryRepositories } from '../infrastructure/repositories';
import {
  LOOKBACK_RESTORE_POLICY,
  readLookbackScroll,
  rememberLookbackScroll,
  resetLookbackSessionForTests,
} from './lookback-session';
import { createUseCases } from './use-cases';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

async function saveMoment(options: {
  repos: ReturnType<typeof createMemoryRepositories>;
  id: string;
  note: string;
  recordedAt: string;
  occurredAt?: string;
  precision: string;
  assetIds?: string[];
}) {
  const now = new Date(options.recordedAt);
  let moment = createDraftMoment(
    {
      ownerId: LOCAL_OWNER_ID,
      content: { note: options.note },
      time: {
        recordedAt: options.recordedAt,
        occurredAt: options.occurredAt,
        occurredAtPrecision: options.precision,
      },
      origin: { type: 'created' },
      assetIds: options.assetIds,
    },
    { now: () => now, ownerId: LOCAL_OWNER_ID, id: () => options.id },
  );
  moment = activateMoment(moment, LOCAL_OWNER_ID, now);
  await options.repos.moments.save(moment);
  return moment;
}

function createHistoryApp(
  repos = createMemoryRepositories(),
  timezoneOffsetMinutes = 0,
) {
  const app = createUseCases({
    ...repos,
    media: createMemoryMediaStore(),
    clock: clockAt('2026-09-24T12:00:00.000Z'),
    timezoneOffsetMinutes,
  });
  return { app, repos };
}

describe('history lookback use cases', () => {
  it('covers exact day month year and unknown without forging recorded time', async () => {
    const { app, repos } = createHistoryApp();
    await saveMoment({
      repos,
      id: 'm_exact',
      note: '精确',
      recordedAt: '2026-03-10T12:00:00.000Z',
      occurredAt: '2026-01-02T08:15:00.000Z',
      precision: 'exact',
    });
    await saveMoment({
      repos,
      id: 'm_day',
      note: '只要日子',
      recordedAt: '2026-03-10T12:00:00.000Z',
      occurredAt: '2026-01-02T00:00:00.000Z',
      precision: 'day',
    });
    await saveMoment({
      repos,
      id: 'm_month',
      note: '只要月份',
      recordedAt: '2026-03-10T12:00:00.000Z',
      occurredAt: '2026-01-20T00:00:00.000Z',
      precision: 'month',
    });
    await saveMoment({
      repos,
      id: 'm_year',
      note: '只要年份',
      recordedAt: '2026-03-10T12:00:00.000Z',
      occurredAt: '2026-07-01T00:00:00.000Z',
      precision: 'year',
    });
    await saveMoment({
      repos,
      id: 'm_unknown',
      note: '未确认',
      recordedAt: '2026-01-02T12:00:00.000Z',
      precision: 'unknown',
    });

    const years = await app.getHistoryYears();
    expect(years.years.map((item) => item.year)).toEqual([2026]);
    expect(years.unknownCount).toBe(1);

    const year = await app.getHistoryYear(2026);
    if ('invalid' in year) throw new Error('expected year');
    expect(year.months[0].count).toBe(3);
    expect(year.months[0].status).toBe('filled');
    expect(year.months[6].status).toBe('quiet');
    expect(year.yearUnconfirmedCount).toBe(1);

    const january = await app.getHistoryMonth(2026, 1);
    if ('invalid' in january) throw new Error('expected month');
    expect(january.days[1].count).toBe(2);
    expect(january.dayUnconfirmedCount).toBe(1);

    const day = await app.getHistoryDay(2026, 1, 2);
    if ('invalid' in day) throw new Error('expected day');
    expect(day.title).toBe('2026年1月2日');
    expect(day.items.map((item) => item.id)).toEqual(['m_exact', 'm_day']);
    expect(day.items[0].timeLabel).toContain('1月2日');

    const unknown = await app.getHistoryUnknown();
    expect(unknown.items.map((item) => item.id)).toEqual(['m_unknown']);
    expect(unknown.items[0].timeLabel).toBe('时间未确认');
    expect(unknown.items[0].recordedFallbackLabel).toBe('记录于 2026年1月2日');

    await saveMoment({
      repos,
      id: 'm_unknown_iso',
      note: '有时间戳但精度不足',
      recordedAt: '2026-08-01T00:00:00.000Z',
      occurredAt: '2026-08-01T00:00:00.000Z',
      precision: 'unknown',
    });
    expect((await app.getHistoryYears()).unknownCount).toBe(2);
    expect((await app.getHistoryYears()).years[0].momentCount).toBe(4);
    expect((await app.getHistoryUnknown()).items.map((item) => item.id).sort()).toEqual([
      'm_unknown',
      'm_unknown_iso',
    ]);

    const yearUnconfirmed = await app.getHistoryYearUnconfirmed(2026);
    if ('invalid' in yearUnconfirmed) throw new Error('expected year unconfirmed');
    expect(yearUnconfirmed.items.map((item) => item.id)).toEqual(['m_year']);

    const monthUnconfirmed = await app.getHistoryMonthUnconfirmed(2026, 1);
    if ('invalid' in monthUnconfirmed) throw new Error('expected month unconfirmed');
    expect(monthUnconfirmed.items.map((item) => item.id)).toEqual(['m_month']);
  });

  it('does not load another year when reading one year of a long archive', async () => {
    const { app, repos } = createHistoryApp();
    for (let month = 1; month <= 13; month += 1) {
      const year = month === 13 ? 2027 : 2026;
      const calendarMonth = month === 13 ? 1 : month;
      await saveMoment({
        repos,
        id: `m_${year}_${calendarMonth}`,
        note: `${year}年${calendarMonth}月`,
        recordedAt: `${year}-${String(calendarMonth).padStart(2, '0')}-10T00:00:00.000Z`,
        occurredAt: `${year}-${String(calendarMonth).padStart(2, '0')}-10T00:00:00.000Z`,
        precision: 'day',
      });
    }
    const year = await app.getHistoryYear(2026);
    if ('invalid' in year) throw new Error('expected year');
    expect(year.months.every((item) => item.count === 1)).toBe(true);
    const next = await app.getHistoryYear(2027);
    if ('invalid' in next) throw new Error('expected 2027');
    expect(next.months[0].count).toBe(1);
    expect(next.months.slice(1).every((item) => item.count === 0)).toBe(true);
  });

  it('rejects a non-leap 29 February and keeps a leap day', async () => {
    const { app, repos } = createHistoryApp();
    await saveMoment({
      repos,
      id: 'm_leap',
      note: '闰日',
      recordedAt: '2024-03-01T00:00:00.000Z',
      occurredAt: '2024-02-29T12:00:00.000Z',
      precision: 'day',
    });
    expect(await app.getHistoryDay(2025, 2, 29)).toEqual({ invalid: true });
    const leap = await app.getHistoryDay(2024, 2, 29);
    if ('invalid' in leap) throw new Error('expected leap day');
    expect(leap.items[0].id).toBe('m_leap');
  });

  it('keeps the moment and remaining photo when one image is missing', async () => {
    const { repos } = createHistoryApp();
    const media = createMemoryMediaStore();
    const withMedia = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T12:00:00.000Z'),
      timezoneOffsetMinutes: 0,
      assetId: () => 'asset_kept',
    });
    const draft = await withMedia.restoreOrCreateDraft();
    await withMedia.updateDraftNote(draft.draftId, '字还在');
    await withMedia.addPickedImages(draft.draftId, [
      { sourceUri: 'memory://source/one.jpg', mimeType: 'image/jpeg', width: 800, height: 600 },
    ]);
    const stored = await repos.drafts.loadActive();
    if (!stored) throw new Error('expected draft');
    stored.assetIds.push('asset_missing');
    await repos.drafts.save(stored);
    const saved = await withMedia.saveTextMoment(draft.draftId);
    const found = await repos.moments.findById(saved.id);
    if (found.kind !== 'ready') throw new Error('expected moment');
    found.moment.time.occurredAt = '2026-04-03T00:00:00.000Z';
    found.moment.time.occurredAtPrecision = 'day';
    await repos.moments.save(found.moment);

    const day = await withMedia.getHistoryDay(2026, 4, 3);
    if ('invalid' in day) throw new Error('expected day');
    expect(day.items[0].note).toBe('字还在');
    expect(day.items[0].images).toHaveLength(2);
    expect(day.items[0].images[0].status).toBe('available');
    expect(day.items[0].images[1].status).toBe('unavailable');
  });

  it('keeps missing and unreadable details as different states', async () => {
    const { app, repos } = createHistoryApp();
    const original = repos.moments.findById.bind(repos.moments);
    repos.moments.findById = async (id) =>
      id === 'moment_broken' ? { kind: 'unreadable' } : original(id);
    const missing = await app.getMomentDetail('moment_absent');
    const broken = await app.getMomentDetail('moment_broken');
    expect(missing).toEqual({ kind: 'missing', requestedId: 'moment_absent' });
    expect(broken).toEqual({ kind: 'error', requestedId: 'moment_broken' });
  });

  it('remembers in-process scroll and documents cold-start restore', () => {
    resetLookbackSessionForTests();
    rememberLookbackScroll('/lookback/2026/03', 180);
    expect(readLookbackScroll('/lookback/2026/03')).toBe(180);
    expect(LOOKBACK_RESTORE_POLICY).toEqual({
      selectedDate: 'route-params-and-back-stack',
      scrollOffset: 'in-process-only',
      coldStart: 'recent-home',
    });
  });
});
