import { projectHistoryMonthFromCounts } from '../projections/history-projection';
import {
  lookbackMonthPage,
  monthCalendarContentWidth,
  shouldShowMonthCalendarGrid,
  weekdayMondayIndex,
} from './lookback-month';

function month(year: number, monthNumber: number, filled: Record<number, number>, unconfirmed = 0) {
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const counts = Array.from({ length: last }, (_, index) => filled[index + 1] ?? 0);
  return lookbackMonthPage(projectHistoryMonthFromCounts(year, monthNumber, counts, unconfirmed));
}

describe('lookback month calendar', () => {
  it('places 2026-09-01 on Tuesday with Monday as the first weekday', () => {
    expect(weekdayMondayIndex(2026, 9, 1)).toBe(1);
    const page = month(2026, 9, { 24: 1 });
    expect(page.weeks[0].map((cell) => cell.kind)).toEqual([
      'pad',
      'quiet',
      'quiet',
      'quiet',
      'quiet',
      'quiet',
      'quiet',
    ]);
    expect(page.weeks[0][1]).toMatchObject({ kind: 'quiet', day: 1 });
    expect(page.weeks[3][3]).toMatchObject({ kind: 'filled', day: 24, count: 1 });
    expect(page.entries).toEqual([{ day: 24, label: '9月24日', count: 1, summary: '有1条记录' }]);
    expect(page.weeks.at(-1)?.filter((cell) => cell.kind === 'pad')).toHaveLength(4);
  });

  it('keeps 29 February 2024 and does not invent 29 February 2025', () => {
    expect(weekdayMondayIndex(2024, 2, 1)).toBe(3);
    const leap = month(2024, 2, { 29: 1 });
    expect(leap.weeks.flat().some((cell) => cell.kind !== 'pad' && cell.day === 29)).toBe(true);
    expect(leap.entries[0]).toMatchObject({ day: 29, summary: '有1条记录' });
    const common = month(2025, 2, {});
    expect(common.weeks.flat().some((cell) => cell.kind !== 'pad' && cell.day === 29)).toBe(false);
    expect(common.weeks.flat().filter((cell) => cell.kind !== 'pad')).toHaveLength(28);
    expect(common.isEmpty).toBe(true);
    expect(common.entries).toEqual([]);
  });

  it('keeps same-day multiples as one filled cell and one readable entry', () => {
    const page = month(2026, 5, { 1: 3 });
    expect(weekdayMondayIndex(2026, 5, 1)).toBe(4);
    expect(page.weeks[0][4]).toMatchObject({ kind: 'filled', day: 1, count: 3, summary: '有3条记录' });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].summary).toBe('有3条记录');
  });

  it('lists every filled day without treating quiet days as entries', () => {
    const page = month(2026, 9, { 3: 1, 5: 4, 8: 1 });
    expect(page.entries.map((entry) => entry.day)).toEqual([3, 5, 8]);
    expect(page.weeks.flat().filter((cell) => cell.kind === 'filled')).toHaveLength(3);
    expect(page.weeks.flat().filter((cell) => cell.kind === 'quiet').length).toBe(27);
  });

  it('does not place month-precision records on a day cell', () => {
    const page = month(2026, 1, { 2: 2 }, 1);
    expect(page.dayUnconfirmedCount).toBe(1);
    expect(page.dayUnconfirmedLabel).toBe('这个月，日子未确认');
    expect(page.weeks.flat().filter((cell) => cell.kind === 'filled')).toHaveLength(1);
    expect(page.isEmpty).toBe(false);
  });

  it('hides the seven-column grid when a 320pt page cannot give each cell 44pt', () => {
    expect(monthCalendarContentWidth(320)).toBe(272);
    expect(shouldShowMonthCalendarGrid({ windowWidth: 320 })).toBe(false);
    expect(shouldShowMonthCalendarGrid({ windowWidth: 390, horizontalInset: 80 })).toBe(false);
  });

  it('shows the grid from available width, not from system type', () => {
    expect(monthCalendarContentWidth(390)).toBe(342);
    expect(shouldShowMonthCalendarGrid({ windowWidth: 390 })).toBe(true);
    expect(shouldShowMonthCalendarGrid({ windowWidth: 356 })).toBe(true);
    expect(shouldShowMonthCalendarGrid({ windowWidth: 768 })).toBe(true);
  });
});
