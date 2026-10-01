import {
  chooseDefaultLookbackScope,
  collectLookbackNeighborDays,
  keepExpandedIds,
  lookbackCandidateMonths,
  lookbackNeighborCaption,
  lookbackNeighborDays,
  lookbackReadingDayTitle,
  lookbackReadingScopeKey,
  restoreLookbackPages,
} from './lookback-reading';
import type { LookbackBookView } from './lookback-book';
import type { HistoryMonthView } from '../projections/history-projection';

function monthPage(
  year: number,
  month: number,
  filled: number[],
  dayUnconfirmedCount = 0,
): HistoryMonthView {
  const last = month === 2 ? 28 : 30;
  return {
    year,
    month,
    title: `${year}年${month}月`,
    dayUnconfirmedCount,
    dayUnconfirmedLabel: '日子未确认',
    isEmpty: filled.length === 0 && dayUnconfirmedCount === 0,
    days: Array.from({ length: last }, (_, index) => {
      const day = index + 1;
      const count = filled.includes(day) ? (day === 28 ? 1 : 2) : 0;
      return {
        day,
        label: `${month}月${day}日`,
        count,
        status: count > 0 ? ('filled' as const) : ('quiet' as const),
        summary: count > 0 ? `有${count}条记录` : '安静',
      };
    }),
  };
}

function book(overrides: Partial<LookbackBookView> = {}): LookbackBookView {
  return {
    unknownCount: 0,
    isEmpty: false,
    years: [
      {
        year: 2026,
        momentCount: 6,
        title: '2026年',
        yearUnconfirmedCount: 0,
        yearUnconfirmedLabel: '这一年，月份未确认',
        months: [
          { month: 10, label: '10月', count: 2, summary: '有2条记录' },
          { month: 9, label: '9月', count: 4, summary: '有4条记录' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('lookback reading contracts', () => {
  it('lists candidate months newest year then newest month first', () => {
    expect(lookbackCandidateMonths(book())).toEqual([
      { year: 2026, month: 10, day: 0 },
      { year: 2026, month: 9, day: 0 },
    ]);
  });

  it('skips a month-only newest month and opens the last placed day', async () => {
    const loads: string[] = [];
    const choice = await chooseDefaultLookbackScope({
      book: book(),
      loadMonth: async (year, month) => {
        loads.push(`${year}-${month}`);
        if (month === 10) return monthPage(year, month, [], 2);
        return monthPage(year, month, [24, 27, 28]);
      },
    });
    expect(choice).toEqual({ kind: 'day', year: 2026, month: 9, day: 28 });
    expect(loads).toEqual(['2026-10', '2026-9']);
  });

  it('stops the default search when the newest month fails', async () => {
    const loads: string[] = [];
    const choice = await chooseDefaultLookbackScope({
      book: book(),
      loadMonth: async (year, month) => {
        loads.push(`${year}-${month}`);
        if (month === 10) throw new Error('month failed');
        return monthPage(year, month, [28]);
      },
    });
    expect(choice).toEqual({ kind: 'month-failed', year: 2026, month: 10 });
    expect(loads).toEqual(['2026-10']);
  });

  it('opens the catalog when there is no placed day but year or month precision remains', async () => {
    const choice = await chooseDefaultLookbackScope({
      book: book({
        unknownCount: 3,
        years: [
          {
            year: 2026,
            momentCount: 4,
            title: '2026年',
            yearUnconfirmedCount: 2,
            yearUnconfirmedLabel: '这一年，月份未确认',
            months: [{ month: 9, label: '9月', count: 2, summary: '有2条记录' }],
          },
        ],
      }),
      loadMonth: async (year, month) => monthPage(year, month, [], 2),
    });
    expect(choice).toEqual({ kind: 'catalog' });
  });

  it('opens the unknown chapter only when that is the remaining range', async () => {
    const choice = await chooseDefaultLookbackScope({
      book: {
        unknownCount: 3,
        isEmpty: false,
        years: [],
      },
      loadMonth: async () => {
        throw new Error('no months');
      },
    });
    expect(choice).toEqual({ kind: 'unknown' });
  });

  it('stops page restore at the first exhausted page and drops deleted expanded ids', async () => {
    const offsets: number[] = [];
    const restored = await restoreLookbackPages({
      targetOffset: 100,
      loadPage: async (offset) => {
        offsets.push(offset);
        if (offset === 0) return { items: [{ id: 'keep' }, { id: 'gone' }], hasMore: false };
        throw new Error(`should not request ${offset}`);
      },
    });
    expect(restored).toEqual({
      ok: true,
      items: [{ id: 'keep' }, { id: 'gone' }],
      loadedOffset: 0,
      hasMore: false,
    });
    expect(offsets).toEqual([0]);
    expect(keepExpandedIds(['keep', 'deleted'], ['keep', 'gone'])).toEqual(['keep']);
  });

  it('keeps already restored items when a later restore page fails', async () => {
    const restored = await restoreLookbackPages({
      targetOffset: 50,
      loadPage: async (offset) => {
        if (offset === 0) return { items: [{ id: 'a' }], hasMore: true };
        throw new Error('page 50 failed');
      },
    });
    expect(restored).toEqual({
      ok: false,
      items: [{ id: 'a' }],
      loadedOffset: 0,
      hasMore: true,
    });
  });

  it('names neighbor days and writes the year only when the target crosses a year', () => {
    const current = { year: 2026, month: 9, day: 27 };
    const neighbors = lookbackNeighborDays(current, [
      { year: 2025, month: 11, day: 2 },
      { year: 2026, month: 9, day: 24 },
      { year: 2026, month: 9, day: 27 },
      { year: 2026, month: 9, day: 28 },
    ]);
    expect(lookbackNeighborCaption('previous', current, neighbors.previous!)).toBe(
      '前一个有记录日 · 9月24日',
    );
    expect(lookbackNeighborCaption('next', current, neighbors.next!)).toBe(
      '后一个有记录日 · 9月28日',
    );
    expect(
      lookbackNeighborCaption('previous', current, { year: 2025, month: 11, day: 2 }),
    ).toBe('前一个有记录日 · 2025年11月2日');
    expect(lookbackReadingDayTitle(2026, 9, 27)).toBe('9月27日');
    expect(lookbackReadingScopeKey({ kind: 'day', year: 2026, month: 9, day: 27 })).toBe(
      'day:2026-09-27',
    );
  });

  it('does not treat a month-only month as a neighbor day', async () => {
    const neighbors = await collectLookbackNeighborDays({
      current: { year: 2026, month: 9, day: 28 },
      book: book(),
      currentMonth: monthPage(2026, 9, [24, 27, 28]),
      loadMonth: async (year, month) =>
        month === 10 ? monthPage(year, month, [], 2) : monthPage(year, month, [24, 27, 28]),
    });
    expect(neighbors).toEqual({
      previous: { year: 2026, month: 9, day: 27 },
      next: null,
    });
  });
});
