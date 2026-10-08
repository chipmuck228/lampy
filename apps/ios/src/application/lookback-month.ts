import { appLanguage, weekdayLabel } from '../i18n';
import type { HistoryMonthView } from '../projections/history-projection';

export const LOOKBACK_WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;
export const LOOKBACK_PAGE_GUTTER = 24;
export const LOOKBACK_MONTH_COLUMNS = 7;
export const LOOKBACK_MONTH_MIN_CELL = 44;
const LOOKBACK_READING_MAX = 720;

export function weekdayMondayIndex(year: number, month: number, day: number): number {
  const sundayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayIndex + 6) % 7;
}

export function monthCalendarContentWidth(windowWidth: number, horizontalInset = 0): number {
  const afterSafe = Math.max(0, windowWidth - horizontalInset);
  const column = Math.min(afterSafe, LOOKBACK_READING_MAX);
  return Math.max(0, column - LOOKBACK_PAGE_GUTTER * 2);
}

export function shouldShowMonthCalendarGrid({
  windowWidth,
  horizontalInset = 0,
}: {
  windowWidth: number;
  horizontalInset?: number;
}): boolean {
  return monthCalendarContentWidth(windowWidth, horizontalInset) / LOOKBACK_MONTH_COLUMNS >= LOOKBACK_MONTH_MIN_CELL;
}

export type LookbackMonthWeekCell =
  | { kind: 'pad'; key: string }
  | { kind: 'quiet'; key: string; day: number; numeral: string }
  | { kind: 'filled'; key: string; day: number; numeral: string; count: number; summary: string };

export type LookbackMonthEntry = {
  day: number;
  label: string;
  count: number;
  summary: string;
};

export type LookbackMonthPage = {
  year: number;
  month: number;
  title: string;
  weekdayLabels: readonly string[];
  weeks: LookbackMonthWeekCell[][];
  entries: LookbackMonthEntry[];
  dayUnconfirmedCount: number;
  dayUnconfirmedLabel: string;
  isEmpty: boolean;
};

export function lookbackMonthPage(view: HistoryMonthView): LookbackMonthPage {
  const lead = weekdayMondayIndex(view.year, view.month, 1);
  const cells: LookbackMonthWeekCell[] = [];
  for (let index = 0; index < lead; index += 1) {
    cells.push({ kind: 'pad', key: `pad-lead-${index}` });
  }
  for (const day of view.days) {
    if (day.status === 'filled') {
      cells.push({
        kind: 'filled',
        key: `day-${day.day}`,
        day: day.day,
        numeral: String(day.day),
        count: day.count,
        summary: day.summary,
      });
    } else {
      cells.push({
        kind: 'quiet',
        key: `day-${day.day}`,
        day: day.day,
        numeral: String(day.day),
      });
    }
  }
  while (cells.length % 7 !== 0) {
    cells.push({ kind: 'pad', key: `pad-tail-${cells.length}` });
  }
  const weeks: LookbackMonthWeekCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return {
    year: view.year,
    month: view.month,
    title: view.title,
    weekdayLabels: appLanguage === 'en' ? Array.from({ length: 7 }, (_, index) => weekdayLabel(index, true)) : LOOKBACK_WEEKDAY_LABELS,
    weeks,
    entries: view.days
      .filter((day) => day.status === 'filled')
      .map((day) => ({
        day: day.day,
        label: day.label,
        count: day.count,
        summary: day.summary,
      })),
    dayUnconfirmedCount: view.dayUnconfirmedCount,
    dayUnconfirmedLabel: view.dayUnconfirmedLabel,
    isEmpty: view.isEmpty,
  };
}
