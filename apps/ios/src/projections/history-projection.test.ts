import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import {
  activateMoment,
  createDraftMoment,
  type MomentRecord,
} from '../domain-adapters/moment-commands';
import {
  placeMomentForHistory,
  projectHistoryDay,
  projectHistoryMonth,
  projectHistoryYear,
} from './history-projection';

function makeMoment(input: {
  id: string;
  note: string;
  recordedAt: string;
  occurredAt?: string;
  precision: string;
}): MomentRecord {
  const now = new Date(input.recordedAt);
  let moment = createDraftMoment(
    {
      ownerId: LOCAL_OWNER_ID,
      content: { note: input.note },
      time: {
        recordedAt: input.recordedAt,
        occurredAt: input.occurredAt,
        occurredAtPrecision: input.precision,
      },
      origin: { type: 'created' },
    },
    { now: () => now, ownerId: LOCAL_OWNER_ID, id: () => input.id },
  );
  moment = activateMoment(moment, LOCAL_OWNER_ID, now);
  return moment;
}

describe('history placement', () => {
  it('does not use recordedAt as the occurred calendar day', () => {
    const moment = makeMoment({
      id: 'moment_recorded_later',
      note: '发生在一月',
      recordedAt: '2026-03-10T12:00:00.000Z',
      occurredAt: '2026-01-02T08:00:00.000Z',
      precision: 'day',
    });
    expect(placeMomentForHistory(moment, 0)).toEqual({
      kind: 'day',
      year: 2026,
      month: 1,
      day: 2,
    });
  });

  it('keeps unknown moments out of any year month or day', () => {
    const moment = makeMoment({
      id: 'moment_unknown',
      note: '时间未确认',
      recordedAt: '2026-06-01T00:00:00.000Z',
      precision: 'unknown',
    });
    expect(placeMomentForHistory(moment, 0)).toEqual({ kind: 'unknown' });
  });

  it('places month and year precision on unconfirmed shelves', () => {
    const month = makeMoment({
      id: 'moment_month',
      note: '只知道月份',
      recordedAt: '2026-04-01T00:00:00.000Z',
      occurredAt: '2026-03-15T00:00:00.000Z',
      precision: 'month',
    });
    const year = makeMoment({
      id: 'moment_year',
      note: '只知道年份',
      recordedAt: '2026-04-01T00:00:00.000Z',
      occurredAt: '2026-08-01T00:00:00.000Z',
      precision: 'year',
    });
    expect(placeMomentForHistory(month, 0)).toEqual({ kind: 'month', year: 2026, month: 3 });
    expect(placeMomentForHistory(year, 0)).toEqual({ kind: 'year', year: 2026 });
  });

  it('splits UTC+8 and UTC-5 around a timezone boundary', () => {
    const moment = makeMoment({
      id: 'moment_boundary',
      note: '时区边界',
      recordedAt: '2026-01-01T02:00:00.000Z',
      occurredAt: '2026-01-01T02:00:00.000Z',
      precision: 'exact',
    });
    expect(placeMomentForHistory(moment, 480)).toEqual({
      kind: 'day',
      year: 2026,
      month: 1,
      day: 1,
    });
    expect(placeMomentForHistory(moment, -300)).toEqual({
      kind: 'day',
      year: 2025,
      month: 12,
      day: 31,
    });
  });

  it('keeps leap day on 29 February 2024', () => {
    const moment = makeMoment({
      id: 'moment_leap',
      note: '闰日',
      recordedAt: '2024-03-01T00:00:00.000Z',
      occurredAt: '2024-02-29T12:00:00.000Z',
      precision: 'day',
    });
    expect(placeMomentForHistory(moment, 0)).toEqual({
      kind: 'day',
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it('keeps December and January on different years and months', () => {
    const december = makeMoment({
      id: 'moment_dec',
      note: '跨年夜',
      recordedAt: '2026-01-01T00:00:00.000Z',
      occurredAt: '2025-12-31T18:00:00.000Z',
      precision: 'exact',
    });
    const january = makeMoment({
      id: 'moment_jan',
      note: '元旦',
      recordedAt: '2026-01-02T00:00:00.000Z',
      occurredAt: '2026-01-01T18:00:00.000Z',
      precision: 'exact',
    });
    const year = projectHistoryYear([december, january], 2026, 0);
    expect(year.months[0].count).toBe(1);
    expect(year.months[11].count).toBe(0);
    const previous = projectHistoryYear([december, january], 2025, 0);
    expect(previous.months[11].count).toBe(1);
    const januaryMonth = projectHistoryMonth([december, january], 2026, 1, 0);
    expect(januaryMonth.days[0].count).toBe(1);
    expect(januaryMonth.days.every((day, index) => index === 0 || day.count === 0)).toBe(true);
  });

  it('shares one day title for several moments and keeps empty days', () => {
    const first = makeMoment({
      id: 'moment_a',
      note: '早上',
      recordedAt: '2026-05-01T10:00:00.000Z',
      occurredAt: '2026-05-01T08:00:00.000Z',
      precision: 'exact',
    });
    const second = makeMoment({
      id: 'moment_b',
      note: '晚上',
      recordedAt: '2026-05-01T20:00:00.000Z',
      occurredAt: '2026-05-01T19:00:00.000Z',
      precision: 'exact',
    });
    const day = projectHistoryDay([first, second], 2026, 5, 1, 0);
    expect(day.title).toBe('2026年5月1日');
    expect(day.items.map((item) => item.id)).toEqual(['moment_a', 'moment_b']);
    const month = projectHistoryMonth([first, second], 2026, 5, 0);
    expect(month.days).toHaveLength(31);
    expect(month.days.filter((item) => item.status === 'quiet')).toHaveLength(30);
  });
});
