import { LOOKBACK_MONTH_MIN_CELL, monthCalendarContentWidth } from './lookback-month';
import type { HistoryYearView } from '../projections/history-projection';

export const LOOKBACK_YEAR_COLUMNS = 3;

export function shouldShowYearMonthGrid({
  windowWidth,
  horizontalInset = 0,
}: {
  windowWidth: number;
  horizontalInset?: number;
}): boolean {
  return (
    monthCalendarContentWidth(windowWidth, horizontalInset) / LOOKBACK_YEAR_COLUMNS >= LOOKBACK_MONTH_MIN_CELL
  );
}

export type LookbackYearMonthCell =
  | { kind: 'quiet'; month: number; numeral: string }
  | { kind: 'filled'; month: number; numeral: string; count: number; summary: string };

export type LookbackYearEntry = {
  month: number;
  label: string;
  count: number;
  summary: string;
};

export type LookbackYearPage = {
  year: number;
  title: string;
  months: LookbackYearMonthCell[];
  entries: LookbackYearEntry[];
  yearUnconfirmedCount: number;
  yearUnconfirmedLabel: string;
  isEmpty: boolean;
};

export function lookbackYearPage(view: HistoryYearView): LookbackYearPage {
  const months: LookbackYearMonthCell[] = view.months.map((month) =>
    month.status === 'filled'
      ? {
          kind: 'filled',
          month: month.month,
          numeral: `${month.month}月`,
          count: month.count,
          summary: month.summary,
        }
      : { kind: 'quiet', month: month.month, numeral: `${month.month}月` },
  );
  return {
    year: view.year,
    title: view.title,
    months,
    entries: view.months
      .filter((month) => month.status === 'filled')
      .map((month) => ({
        month: month.month,
        label: `${month.month}月`,
        count: month.count,
        summary: month.summary,
      })),
    yearUnconfirmedCount: view.yearUnconfirmedCount,
    yearUnconfirmedLabel: view.yearUnconfirmedLabel,
    isEmpty: view.months.every((month) => month.status === 'quiet') && view.yearUnconfirmedCount === 0,
  };
}
