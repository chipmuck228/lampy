import { projectHistoryYearFromCounts } from '../projections/history-projection';
import { lookbackYearPage, shouldShowYearMonthGrid } from './lookback-year';

function year(counts: number[], unconfirmed = 0) {
  const monthCounts = Array.from({ length: 12 }, (_, index) => counts[index] ?? 0);
  return lookbackYearPage(projectHistoryYearFromCounts(2026, monthCounts, unconfirmed));
}

describe('lookback year page', () => {
  it('keeps twelve real months and only lists filled ones', () => {
    const page = year([2, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(page.months).toHaveLength(12);
    expect(page.months[0]).toMatchObject({ kind: 'filled', month: 1, numeral: '1月', count: 2 });
    expect(page.months[1]).toMatchObject({ kind: 'quiet', month: 2 });
    expect(page.months[8]).toMatchObject({ kind: 'filled', month: 9, count: 1 });
    expect(page.entries.map((entry) => entry.month)).toEqual([1, 9]);
    expect(page.entries[0]).toEqual({ month: 1, label: '1月', count: 2, summary: '有2条记录' });
    expect(page.isEmpty).toBe(false);
  });

  it('treats a year with no month records as empty unless year-precision remains', () => {
    expect(year([]).isEmpty).toBe(true);
    expect(year([]).entries).toEqual([]);
    const unconfirmed = year([], 1);
    expect(unconfirmed.isEmpty).toBe(false);
    expect(unconfirmed.yearUnconfirmedCount).toBe(1);
    expect(unconfirmed.months.every((month) => month.kind === 'quiet')).toBe(true);
  });

  it('does not grow marks with count on a dense year', () => {
    const page = year([1, 4, 1, 2, 0, 1, 3, 1, 2, 0, 1, 0]);
    const filled = page.months.filter((month) => month.kind === 'filled');
    expect(filled).toHaveLength(9);
    expect(page.entries.map((entry) => entry.count)).toEqual([1, 4, 1, 2, 1, 3, 1, 2, 1]);
  });

  it('hides the three-column grid at large type even when the window is wide', () => {
    expect(shouldShowYearMonthGrid({ fontScale: 1, windowWidth: 390 })).toBe(true);
    expect(shouldShowYearMonthGrid({ fontScale: 1, windowWidth: 179 })).toBe(false);
    expect(shouldShowYearMonthGrid({ fontScale: 1, windowWidth: 390, horizontalInset: 250 })).toBe(
      false,
    );
    expect(shouldShowYearMonthGrid({ fontScale: 1.3, windowWidth: 768 })).toBe(false);
  });
});
