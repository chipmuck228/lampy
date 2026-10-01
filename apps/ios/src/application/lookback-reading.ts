import { pad2 } from '../domain-adapters/calendar';
import type { HistoryMonthView } from '../projections/history-projection';
import { HISTORY_PAGE_SIZE } from './history-use-cases';
import type { LookbackBookView } from './lookback-book';
import { lookbackBookWeekdayName } from './lookback-book';

export type LookbackReadingScope =
  | { kind: 'day'; year: number; month: number; day: number }
  | { kind: 'unknown' }
  | { kind: 'year-unconfirmed'; year: number }
  | { kind: 'month-unconfirmed'; year: number; month: number };

export type LookbackReadingSnapshot = {
  scope: LookbackReadingScope;
  loadedOffset: number;
  expandedIds: string[];
  scrollY: number;
};

export type LookbackDefaultChoice =
  | { kind: 'day'; year: number; month: number; day: number }
  | { kind: 'catalog' }
  | { kind: 'unknown' }
  | { kind: 'empty' }
  | { kind: 'month-failed'; year: number; month: number };

export type LookbackPlacedDay = { year: number; month: number; day: number };

export function lookbackReadingScopeKey(scope: LookbackReadingScope): string {
  if (scope.kind === 'day') return `day:${scope.year}-${pad2(scope.month)}-${pad2(scope.day)}`;
  if (scope.kind === 'unknown') return 'unknown';
  if (scope.kind === 'year-unconfirmed') return `year-unconfirmed:${scope.year}`;
  return `month-unconfirmed:${scope.year}-${pad2(scope.month)}`;
}

export function lookbackScopesEqual(left: LookbackReadingScope, right: LookbackReadingScope): boolean {
  return lookbackReadingScopeKey(left) === lookbackReadingScopeKey(right);
}

export function lookbackReadingScopeFromIntent(intent: {
  year: number;
  month?: number;
  day?: number;
}): LookbackReadingScope | null {
  if (intent.day != null && intent.month != null) {
    return { kind: 'day', year: intent.year, month: intent.month, day: intent.day };
  }
  return null;
}

export function lookbackCandidateMonths(book: LookbackBookView): LookbackPlacedDay[] {
  const months: LookbackPlacedDay[] = [];
  for (const chapter of book.years) {
    const newestFirst = [...chapter.months].sort((left, right) => right.month - left.month);
    for (const month of newestFirst) {
      months.push({ year: chapter.year, month: month.month, day: 0 });
    }
  }
  return months;
}

export function lookbackPlacedDaysInMonth(page: HistoryMonthView): number[] {
  return page.days.filter((day) => day.status === 'filled' && day.count > 0).map((day) => day.day);
}

export async function chooseDefaultLookbackScope(input: {
  book: LookbackBookView;
  loadMonth: (year: number, month: number) => Promise<HistoryMonthView | { invalid: true }>;
}): Promise<LookbackDefaultChoice> {
  if (input.book.isEmpty) return { kind: 'empty' };
  let yearOrMonthPrecision = input.book.years.some((chapter) => chapter.yearUnconfirmedCount > 0);
  for (const month of lookbackCandidateMonths(input.book)) {
    let page: HistoryMonthView | { invalid: true };
    try {
      page = await input.loadMonth(month.year, month.month);
    } catch {
      return { kind: 'month-failed', year: month.year, month: month.month };
    }
    if ('invalid' in page) return { kind: 'month-failed', year: month.year, month: month.month };
    const days = lookbackPlacedDaysInMonth(page);
    if (days.length > 0) {
      return { kind: 'day', year: month.year, month: month.month, day: days[days.length - 1] };
    }
    if (page.dayUnconfirmedCount > 0) yearOrMonthPrecision = true;
  }
  if (yearOrMonthPrecision) return { kind: 'catalog' };
  if (input.book.unknownCount > 0) return { kind: 'unknown' };
  return { kind: 'empty' };
}

export async function restoreLookbackPages<T>(input: {
  loadPage: (offset: number) => Promise<{ items: T[]; hasMore: boolean }>;
  targetOffset: number;
  pageSize?: number;
}): Promise<
  | { ok: true; items: T[]; loadedOffset: number; hasMore: boolean }
  | { ok: false; items: T[]; loadedOffset: number; hasMore: boolean }
> {
  const pageSize = input.pageSize ?? HISTORY_PAGE_SIZE;
  const target = Math.max(0, input.targetOffset);
  const items: T[] = [];
  let loadedOffset = 0;
  let hasMore = true;
  for (let offset = 0; offset <= target; offset += pageSize) {
    try {
      const page = await input.loadPage(offset);
      items.push(...page.items);
      loadedOffset = offset;
      hasMore = page.hasMore;
      if (!page.hasMore) {
        return { ok: true, items, loadedOffset, hasMore: false };
      }
    } catch {
      return { ok: false, items, loadedOffset: offset === 0 ? 0 : loadedOffset, hasMore };
    }
  }
  return { ok: true, items, loadedOffset, hasMore };
}

export function keepExpandedIds(expandedIds: string[], presentIds: string[]): string[] {
  const present = new Set(presentIds);
  return expandedIds.filter((id) => present.has(id));
}

export function comparePlacedDays(left: LookbackPlacedDay, right: LookbackPlacedDay): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

export function lookbackNeighborDays(
  current: LookbackPlacedDay,
  days: LookbackPlacedDay[],
): { previous: LookbackPlacedDay | null; next: LookbackPlacedDay | null } {
  const unique = [...days].sort(comparePlacedDays);
  const index = unique.findIndex(
    (day) => day.year === current.year && day.month === current.month && day.day === current.day,
  );
  if (index < 0) {
    const after = unique.find((day) => comparePlacedDays(day, current) > 0) ?? null;
    const before =
      [...unique].reverse().find((day) => comparePlacedDays(day, current) < 0) ?? null;
    return { previous: before, next: after };
  }
  return {
    previous: unique[index - 1] ?? null,
    next: unique[index + 1] ?? null,
  };
}

export function lookbackNeighborDateLabel(from: LookbackPlacedDay, to: LookbackPlacedDay): string {
  if (from.year !== to.year) return `${to.year}年${to.month}月${to.day}日`;
  return `${to.month}月${to.day}日`;
}

export function lookbackNeighborCaption(
  direction: 'previous' | 'next',
  from: LookbackPlacedDay,
  to: LookbackPlacedDay,
): string {
  const verb = direction === 'previous' ? '前一个有记录日' : '后一个有记录日';
  return `${verb} · ${lookbackNeighborDateLabel(from, to)}`;
}

export function lookbackReadingDayTitle(year: number, month: number, day: number): string {
  return `${month}月${day}日`;
}

export function lookbackReadingDayWeekday(year: number, month: number, day: number): string {
  return lookbackBookWeekdayName(year, month, day);
}

export function lookbackReadingCountLabel(count: number): string {
  return `${count}条`;
}

export function lookbackCatalogMonthTitle(year: number, month: number): string {
  return `${year}年 · ${month}月`;
}

export async function collectLookbackNeighborDays(input: {
  current: LookbackPlacedDay;
  book: LookbackBookView;
  currentMonth?: HistoryMonthView | null;
  loadMonth: (year: number, month: number) => Promise<HistoryMonthView | { invalid: true }>;
}): Promise<{ previous: LookbackPlacedDay | null; next: LookbackPlacedDay | null }> {
  const months = lookbackCandidateMonths(input.book).sort((left, right) =>
    comparePlacedDays({ ...left, day: 1 }, { ...right, day: 1 }),
  );
  const here = months.findIndex(
    (month) => month.year === input.current.year && month.month === input.current.month,
  );
  const currentPage =
    input.currentMonth &&
    input.currentMonth.year === input.current.year &&
    input.currentMonth.month === input.current.month
      ? input.currentMonth
      : here >= 0
        ? await loadPlacedMonth(input.loadMonth, input.current.year, input.current.month)
        : null;
  const currentDays = currentPage ? lookbackPlacedDaysInMonth(currentPage) : [];
  const previousInMonth = [...currentDays].reverse().find((day) => day < input.current.day);
  const nextInMonth = currentDays.find((day) => day > input.current.day);
  let previous = previousInMonth
    ? { year: input.current.year, month: input.current.month, day: previousInMonth }
    : null;
  let next = nextInMonth
    ? { year: input.current.year, month: input.current.month, day: nextInMonth }
    : null;
  if (!previous) {
    for (let index = here - 1; index >= 0; index -= 1) {
      const month = months[index];
      const page = await loadPlacedMonth(input.loadMonth, month.year, month.month);
      const days = page ? lookbackPlacedDaysInMonth(page) : [];
      if (days.length === 0) continue;
      previous = { year: month.year, month: month.month, day: days[days.length - 1] };
      break;
    }
  }
  if (!next) {
    for (let index = here + 1; index < months.length; index += 1) {
      const month = months[index];
      const page = await loadPlacedMonth(input.loadMonth, month.year, month.month);
      const days = page ? lookbackPlacedDaysInMonth(page) : [];
      if (days.length === 0) continue;
      next = { year: month.year, month: month.month, day: days[0] };
      break;
    }
  }
  return { previous, next };
}

async function loadPlacedMonth(
  loadMonth: (year: number, month: number) => Promise<HistoryMonthView | { invalid: true }>,
  year: number,
  month: number,
): Promise<HistoryMonthView | null> {
  try {
    const page = await loadMonth(year, month);
    return 'invalid' in page ? null : page;
  } catch {
    return null;
  }
}
