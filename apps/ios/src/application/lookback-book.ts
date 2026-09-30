import { isValidCalendarDay, pad2 } from '../domain-adapters/calendar';
import { lookbackDayEntries, type LookbackDayEntry } from './lookback-day';
import type { HistoryMomentItem } from './history-use-cases';
import { weekdayMondayIndex, LOOKBACK_WEEKDAY_LABELS } from './lookback-month';
import type { LookbackYearEntry } from './lookback-year';

export const LOOKBACK_BOOK_EXCERPT_LIMIT = 2;
export const LOOKBACK_BOOK_NOTE_LINES = 6;

export type LookbackBookIntent =
  | { year: number }
  | { year: number; month: number }
  | { year: number; month: number; day: number };

export type LookbackBookYear = {
  year: number;
  momentCount: number;
  title: string;
  yearUnconfirmedCount: number;
  yearUnconfirmedLabel: string;
  months: LookbackYearEntry[];
};

export type LookbackBookView = {
  unknownCount: number;
  years: LookbackBookYear[];
  isEmpty: boolean;
};

export type LookbackBookExcerpt = LookbackDayEntry & {
  extraImageCount: number;
};

export function lookbackBookHref(originToken?: string): '/lookback' | `/lookback?o=${string}` {
  return originToken ? `/lookback?o=${originToken}` : '/lookback';
}

export function lookbackBookIntentFromParts(input: {
  year?: string;
  month?: string;
  day?: string;
}): LookbackBookIntent | null {
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  if (input.month == null || input.month === '') return { year };
  const month = Number(input.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) return { year };
  if (input.day == null || input.day === '') return { year, month };
  const day = Number(input.day);
  if (!isValidCalendarDay(year, month, day)) return { year, month };
  return { year, month, day };
}

export function lookbackBookWeekdayName(year: number, month: number, day: number): string {
  return `星期${LOOKBACK_WEEKDAY_LABELS[weekdayMondayIndex(year, month, day)]}`;
}

export function lookbackBookDateLabel(year: number, month: number, day: number): string {
  return `${month}月${day}日 · ${lookbackBookWeekdayName(year, month, day)}`;
}

export function lookbackBookMonthAccessLabel(
  year: number,
  month: number,
  summary: string,
  expanded: boolean,
): string {
  return `${year}年${month}月，${summary}，${expanded ? '已展开' : '已收起'}`;
}

export function lookbackBookMonthOpenable(input: {
  dayCount: number;
  dayUnconfirmedCount: number;
}): boolean {
  return input.dayCount > 0 || input.dayUnconfirmedCount > 0;
}

export function lookbackBookRemaining(dayTotal: number, shownCount: number): number {
  return Math.max(0, dayTotal - shownCount);
}

export function lookbackBookExcerpts(items: HistoryMomentItem[]): LookbackBookExcerpt[] {
  return lookbackDayEntries(items)
    .slice(0, LOOKBACK_BOOK_EXCERPT_LIMIT)
    .map((entry) => ({
      ...entry,
      images: entry.images.slice(0, 1),
      extraImageCount: Math.max(0, entry.images.length - 1),
    }));
}

export function lookbackBookMonthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

export function lookbackBookDayKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

export function lookbackBookLocateId(target: LookbackBookIntent): string {
  if ('day' in target) return `day-${target.year}-${pad2(target.month)}-${pad2(target.day)}`;
  if ('month' in target) return `month-${target.year}-${pad2(target.month)}`;
  return `year-${target.year}`;
}

export function lookbackBookResponseIsCurrent(activeGeneration: number, generation: number): boolean {
  return activeGeneration === generation;
}
