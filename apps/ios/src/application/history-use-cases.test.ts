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
    expect(day.items.map((item) => item.id)).toEqual(['m_day', 'm_exact']);
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
    stored.assetIds.push('asset_missing:image');
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

  it('pages a large archive without listing every moment in a year', async () => {
    const { app, repos } = createHistoryApp();
    const listed: number[] = [];
    const counted: number[] = [];
    const originalList = repos.moments.listActiveOccurred.bind(repos.moments);
    const originalCount = repos.moments.countActiveOccurred.bind(repos.moments);
    repos.moments.listActiveOccurred = async (query) => {
      listed.push(query.limit);
      return originalList(query);
    };
    repos.moments.countActiveOccurred = async (query) => {
      counted.push(query.precisions.length);
      return originalCount(query);
    };
    for (let index = 0; index < 80; index += 1) {
      const occurredAt = new Date(Date.UTC(2026, 2, 1, 0, 0, index)).toISOString();
      await saveMoment({
        repos,
        id: `m_year_${index}`,
        note: `年精度${index}`,
        recordedAt: occurredAt,
        occurredAt,
        precision: 'year',
      });
    }
    for (let month = 1; month <= 12; month += 1) {
      await saveMoment({
        repos,
        id: `m_day_${month}`,
        note: `${month}月`,
        recordedAt: `2026-${String(month).padStart(2, '0')}-10T00:00:00.000Z`,
        occurredAt: `2026-${String(month).padStart(2, '0')}-10T00:00:00.000Z`,
        precision: 'day',
      });
    }
    await saveMoment({
      repos,
      id: 'm_other_year',
      note: '下一年',
      recordedAt: '2027-01-02T00:00:00.000Z',
      occurredAt: '2027-01-02T00:00:00.000Z',
      precision: 'day',
    });

    const years = await app.getHistoryYears();
    expect(years.years.map((item) => item.year)).toEqual([2027, 2026]);
    expect(years.years[1].momentCount).toBe(92);
    expect(listed).toEqual([]);

    const year = await app.getHistoryYear(2026);
    if ('invalid' in year) throw new Error('expected year');
    expect(year.yearUnconfirmedCount).toBe(80);
    expect(year.months.every((item) => item.count === 1)).toBe(true);
    expect(listed).toEqual([]);
    expect(counted.length).toBeGreaterThan(12);

    const first = await app.getHistoryYearUnconfirmed(2026, 0);
    if ('invalid' in first) throw new Error('expected page');
    const second = await app.getHistoryYearUnconfirmed(2026, 50);
    if ('invalid' in second) throw new Error('expected next page');
    expect(first.items).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(30);
    expect(second.hasMore).toBe(false);
    expect(listed).toEqual([50, 50]);
  });

  it('places spring-forward and fall-back instants on the local calendar day', async () => {
    const repos = createMemoryRepositories();
    const zoned = createUseCases({
      ...repos,
      media: createMemoryMediaStore(),
      clock: clockAt('2026-09-24T12:00:00.000Z'),
      timezone: { timeZone: 'America/New_York' },
    });
    await saveMoment({
      repos,
      id: 'm_spring_eve',
      note: '春切换前夜',
      recordedAt: '2026-03-08T04:30:00.000Z',
      occurredAt: '2026-03-08T04:30:00.000Z',
      precision: 'exact',
    });
    await saveMoment({
      repos,
      id: 'm_spring_day',
      note: '春切换当日',
      recordedAt: '2026-03-08T06:30:00.000Z',
      occurredAt: '2026-03-08T06:30:00.000Z',
      precision: 'exact',
    });
    await saveMoment({
      repos,
      id: 'm_fall_late',
      note: '秋切换重复小时',
      recordedAt: '2026-11-01T06:30:00.000Z',
      occurredAt: '2026-11-01T06:30:00.000Z',
      precision: 'exact',
    });
    const seventh = await zoned.getHistoryDay(2026, 3, 7);
    if ('invalid' in seventh) throw new Error('expected March 7');
    expect(seventh.items.map((item) => item.id)).toEqual(['m_spring_eve']);
    const eighth = await zoned.getHistoryDay(2026, 3, 8);
    if ('invalid' in eighth) throw new Error('expected March 8');
    expect(eighth.items.map((item) => item.id)).toEqual(['m_spring_day']);
    const november = await zoned.getHistoryDay(2026, 11, 1);
    if ('invalid' in november) throw new Error('expected November 1');
    expect(november.items.map((item) => item.id)).toEqual(['m_fall_late']);
  });

  it('keeps sound and missing media on a lookback day', async () => {
    const { repos } = createHistoryApp();
    const media = createMemoryMediaStore();
    const withMedia = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T12:00:00.000Z'),
      timezoneOffsetMinutes: 0,
      assetId: () => 'asset_voice_lookback',
    });
    const draft = await withMedia.restoreOrCreateDraft();
    await withMedia.updateDraftNote(draft.draftId, '回看还有声音');
    await withMedia.addRecordedAudio(draft.draftId, {
      sourceUri: 'memory://source/voice.m4a',
      durationMs: 1800,
      mimeType: 'audio/mp4',
    });
    const stored = await repos.drafts.loadActive();
    if (!stored) throw new Error('expected draft');
    stored.assetIds.push('asset_vanished');
    await repos.drafts.save(stored);
    const saved = await withMedia.saveTextMoment(draft.draftId);
    const found = await repos.moments.findById(saved.id);
    if (found.kind !== 'ready') throw new Error('expected moment');
    found.moment.time.occurredAt = '2026-05-04T12:00:00.000Z';
    found.moment.time.occurredAtPrecision = 'day';
    await repos.moments.save(found.moment);

    const day = await withMedia.getHistoryDay(2026, 5, 4);
    if ('invalid' in day) throw new Error('expected day');
    expect(day.items[0].note).toBe('回看还有声音');
    expect(day.items[0].audio?.status).toBe('available');
    expect(day.items[0].unknownMedia).toEqual([
      {
        id: 'asset_vanished',
        status: 'unavailable',
        label: '这份内容',
        unavailableLabel: '这份内容暂时无法打开。',
      },
    ]);

    const storedAudio = await repos.assets.findById('asset_voice_lookback');
    if (storedAudio.kind !== 'ready') throw new Error('expected audio');
    media.markMissing(storedAudio.asset.localUri);
    const after = await withMedia.getHistoryDay(2026, 5, 4);
    if ('invalid' in after) throw new Error('expected day after missing audio');
    expect(after.items[0].note).toBe('回看还有声音');
    expect(after.items[0].audio?.status).toBe('unavailable');
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
