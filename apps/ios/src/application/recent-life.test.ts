import {
  groupRecentLifeDays,
  recordedDayForRecent,
  recordedHeadingForRecent,
  sameViewerCalendarDay,
  takeRecentLifeDays,
} from './recent-life';

const SHANGHAI = { timeZone: 'Asia/Shanghai' };
const NEW_YORK = { timeZone: 'America/New_York' };
const now = new Date('2026-09-27T12:00:00.000Z');

describe('recordedDayForRecent', () => {
  it('keeps two afternoon stamps on the same viewer day', () => {
    const morning = recordedDayForRecent('2026-09-27T02:00:00.000Z', now, SHANGHAI);
    const evening = recordedDayForRecent('2026-09-27T10:00:00.000Z', now, SHANGHAI);
    expect(morning.dayKey).toBe('2026-09-27');
    expect(evening.dayKey).toBe('2026-09-27');
    expect(morning.dayLabel).toBe('9月27日');
    expect(evening.dayLabel).toBe('9月27日');
  });

  it('does not share a key across years with the same month-day', () => {
    const thisYear = recordedDayForRecent('2026-09-27T02:00:00.000Z', now, SHANGHAI);
    const lastYear = recordedDayForRecent('2025-09-27T02:00:00.000Z', now, SHANGHAI);
    expect(thisYear.dayKey).toBe('2026-09-27');
    expect(lastYear.dayKey).toBe('2025-09-27');
    expect(thisYear.dayLabel).toBe('9月27日');
    expect(lastYear.dayLabel).toBe('2025年9月27日');
  });

  it('splits midnight in the viewer timezone, not UTC', () => {
    const before = recordedDayForRecent('2026-09-26T15:59:00.000Z', now, SHANGHAI);
    const after = recordedDayForRecent('2026-09-26T16:00:00.000Z', now, SHANGHAI);
    expect(before.dayKey).toBe('2026-09-26');
    expect(after.dayKey).toBe('2026-09-27');
    expect(before.dayLabel).toBe('9月26日');
    expect(after.dayLabel).toBe('9月27日');
  });

  it('uses the viewer timezone when the same instant is a different civil day', () => {
    const shanghai = recordedDayForRecent('2026-09-27T03:30:00.000Z', now, SHANGHAI);
    const york = recordedDayForRecent('2026-09-27T03:30:00.000Z', now, NEW_YORK);
    expect(shanghai.dayKey).toBe('2026-09-27');
    expect(york.dayKey).toBe('2026-09-26');
  });

  it('does not invent a calendar day for an unreadable recordedAt', () => {
    expect(recordedDayForRecent('not-a-date', now, SHANGHAI)).toEqual({
      dayKey: 'unknown',
      dayLabel: '时间未确认',
    });
  });
});

describe('groupRecentLifeDays', () => {
  it('groups by dayKey, not by the display label', () => {
    const groups = groupRecentLifeDays([
      { id: 'a', dayKey: '2026-09-27', dayLabel: '9月27日' },
      { id: 'b', dayKey: '2026-09-27', dayLabel: '9月27日' },
      { id: 'c', dayKey: '2025-09-27', dayLabel: '2025年9月27日' },
    ]);
    expect(groups.map((group) => ({ key: group.key, label: group.label, ids: group.items.map((item) => item.id) }))).toEqual([
      { key: '2026-09-27', label: '记录于 9月27日', ids: ['a', 'b'] },
      { key: '2025-09-27', label: '记录于 2025年9月27日', ids: ['c'] },
    ]);
  });

  it('does not invent a day when the list is empty', () => {
    expect(groupRecentLifeDays([])).toEqual([]);
  });

  it('treats recorded and occurred stamps on the same viewer day as one date', () => {
    expect(
      sameViewerCalendarDay('2026-09-26T16:30:00.000Z', '2026-09-26T16:00:00.000Z', SHANGHAI),
    ).toBe(true);
    expect(
      sameViewerCalendarDay('2026-09-26T16:30:00.000Z', '2026-09-19T16:00:00.000Z', SHANGHAI),
    ).toBe(false);
  });

  it('marks group headings as recorded days without changing the key', () => {
    expect(recordedHeadingForRecent('9月27日')).toBe('记录于 9月27日');
    expect(recordedHeadingForRecent('记录于 9月27日')).toBe('记录于 9月27日');
    expect(recordedHeadingForRecent('时间未确认')).toBe('记录于 时间未确认');
  });
});

describe('takeRecentLifeDays', () => {
  it('keeps the latest seven recorded days and leaves a shorter list alone', () => {
    const eight = groupRecentLifeDays(
      Array.from({ length: 8 }, (_, index) => ({
        id: `d${8 - index}`,
        dayKey: `2026-09-${String(8 - index).padStart(2, '0')}`,
        dayLabel: `9月${8 - index}日`,
      })),
    );
    expect(takeRecentLifeDays(eight).map((day) => day.key)).toEqual([
      '2026-09-08',
      '2026-09-07',
      '2026-09-06',
      '2026-09-05',
      '2026-09-04',
      '2026-09-03',
      '2026-09-02',
    ]);
    expect(takeRecentLifeDays(eight.slice(0, 3)).map((day) => day.key)).toEqual([
      '2026-09-08',
      '2026-09-07',
      '2026-09-06',
    ]);
    expect(takeRecentLifeDays([])).toEqual([]);
  });
});
