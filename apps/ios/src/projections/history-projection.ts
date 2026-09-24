import {
  calendarPartsAt,
  formatCalendarDate,
  offsetMinutesAt,
  parseMillis,
  type HistoryClock,
} from '../domain-adapters/calendar';
import type { MomentRecord } from '../domain-adapters/moment-commands';

export type HistoryPlacement =
  | { kind: 'day'; year: number; month: number; day: number }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'year'; year: number }
  | { kind: 'unknown' };

export type HistoryYearSummary = {
  year: number;
  monthCounts: number[];
  filledMonths: number;
  quietMonths: number;
  yearUnconfirmedCount: number;
  momentCount: number;
};

export type HistoryYearsView = {
  years: HistoryYearSummary[];
  unknownCount: number;
  isEmpty: boolean;
};

export type HistoryMonthCell = {
  month: number;
  label: string;
  count: number;
  status: 'filled' | 'quiet';
  summary: string;
};

export type HistoryYearView = {
  year: number;
  title: string;
  months: HistoryMonthCell[];
  yearUnconfirmedCount: number;
  yearUnconfirmedLabel: string;
};

export type HistoryDayCell = {
  day: number;
  label: string;
  count: number;
  status: 'filled' | 'quiet';
  summary: string;
};

export type HistoryMonthView = {
  year: number;
  month: number;
  title: string;
  days: HistoryDayCell[];
  dayUnconfirmedCount: number;
  dayUnconfirmedLabel: string;
  isEmpty: boolean;
};

export type HistoryListedMoment = {
  id: string;
  note: string;
  precision: string;
  timeLabel: string;
  usedRecordedAtFallback: boolean;
  recordedFallbackLabel?: string;
};

export type HistoryDayView = {
  year: number;
  month: number;
  day: number;
  title: string;
  items: HistoryListedMoment[];
  isEmpty: boolean;
};

export type HistoryUnconfirmedView = {
  kind: 'unknown' | 'year' | 'month';
  title: string;
  explanation: string;
  items: HistoryListedMoment[];
  hasMore: boolean;
};

/**
 * 浏览位置只看 occurredAt + occurredAtPrecision。
 * recordedAt / createdAt 不得决定年、月、日格子。
 * unknown 或没有 occurredAt：进入「时间未确认」。
 * year：只进入该年的「月份未确认」。
 * month：只进入该月的「日子未确认」。
 * exact / day：进入 occurredAt 在查看者时区下的自然日。
 */
export function placeMomentForHistory(
  moment: MomentRecord,
  clock: HistoryClock,
): HistoryPlacement {
  const precision = moment.time.occurredAtPrecision;
  if (precision === 'unknown' || !moment.time.occurredAt) {
    return { kind: 'unknown' };
  }
  const millis = parseMillis(moment.time.occurredAt);
  if (millis === null) return { kind: 'unknown' };
  const parts = calendarPartsAt(millis, clock);
  if (precision === 'year') return { kind: 'year', year: parts.year };
  if (precision === 'month') return { kind: 'month', year: parts.year, month: parts.month };
  return { kind: 'day', year: parts.year, month: parts.month, day: parts.day };
}

export function projectHistoryYearIndexFromCounts(
  years: { year: number; momentCount: number }[],
  unknownCount: number,
): HistoryYearsView {
  return {
    years: years.map((item) => ({
      year: item.year,
      monthCounts: Array.from({ length: 12 }, () => 0),
      filledMonths: 0,
      quietMonths: 12,
      yearUnconfirmedCount: 0,
      momentCount: item.momentCount,
    })),
    unknownCount,
    isEmpty: years.length === 0 && unknownCount === 0,
  };
}

export function projectHistoryYears(
  moments: MomentRecord[],
  unknownCount: number,
  clock: HistoryClock,
): HistoryYearsView {
  const byYear = new Map<number, MomentRecord[]>();
  for (const moment of moments) {
    const place = placeMomentForHistory(moment, clock);
    if (place.kind === 'unknown') continue;
    const year = place.year;
    const list = byYear.get(year) || [];
    list.push(moment);
    byYear.set(year, list);
  }
  const years = [...byYear.keys()]
    .sort((a, b) => b - a)
    .map((year) => projectYearSummary(byYear.get(year) || [], year, clock));
  return {
    years,
    unknownCount,
    isEmpty: years.length === 0 && unknownCount === 0,
  };
}

export function projectHistoryYearFromCounts(
  year: number,
  monthCounts: number[],
  yearUnconfirmedCount: number,
): HistoryYearView {
  const months: HistoryMonthCell[] = monthCounts.map((count, index) => {
    const month = index + 1;
    const filled = count > 0;
    return {
      month,
      label: `${year}年${month}月`,
      count,
      status: filled ? 'filled' : 'quiet',
      summary: filled ? `有${count}条记录` : '安静',
    };
  });
  return {
    year,
    title: `${year}年`,
    months,
    yearUnconfirmedCount,
    yearUnconfirmedLabel: '这一年，月份未确认',
  };
}

export function projectHistoryYear(
  moments: MomentRecord[],
  year: number,
  clock: HistoryClock,
): HistoryYearView {
  const summary = projectYearSummary(moments, year, clock);
  return projectHistoryYearFromCounts(year, summary.monthCounts, summary.yearUnconfirmedCount);
}

export function projectHistoryMonthFromCounts(
  year: number,
  month: number,
  dayCounts: number[],
  dayUnconfirmedCount: number,
): HistoryMonthView {
  const days: HistoryDayCell[] = dayCounts.map((count, index) => {
    const day = index + 1;
    const filled = count > 0;
    return {
      day,
      label: `${month}月${day}日`,
      count,
      status: filled ? 'filled' : 'quiet',
      summary: filled ? `有${count}条记录` : '安静',
    };
  });
  return {
    year,
    month,
    title: `${year}年${month}月`,
    days,
    dayUnconfirmedCount,
    dayUnconfirmedLabel: '这个月，日子未确认',
    isEmpty: dayCounts.every((count) => count === 0) && dayUnconfirmedCount === 0,
  };
}

export function projectHistoryMonth(
  moments: MomentRecord[],
  year: number,
  month: number,
  clock: HistoryClock,
): HistoryMonthView {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayCounts = Array.from({ length: lastDay }, () => 0);
  let dayUnconfirmedCount = 0;
  for (const moment of moments) {
    const place = placeMomentForHistory(moment, clock);
    if (place.kind === 'month' && place.year === year && place.month === month) {
      dayUnconfirmedCount += 1;
      continue;
    }
    if (place.kind === 'day' && place.year === year && place.month === month) {
      dayCounts[place.day - 1] += 1;
    }
  }
  return projectHistoryMonthFromCounts(year, month, dayCounts, dayUnconfirmedCount);
}

export function projectHistoryDay(
  moments: MomentRecord[],
  year: number,
  month: number,
  day: number,
  clock: HistoryClock,
): HistoryDayView {
  const items = moments
    .filter((moment) => {
      const place = placeMomentForHistory(moment, clock);
      return place.kind === 'day' && place.year === year && place.month === month && place.day === day;
    })
    .sort(compareListedMoments)
    .map((moment) => toListedMoment(moment, clock));
  return {
    year,
    month,
    day,
    title: `${year}年${month}月${day}日`,
    items,
    isEmpty: items.length === 0,
  };
}

export function projectHistoryUnconfirmed(
  moments: MomentRecord[],
  filter: { kind: 'unknown' } | { kind: 'year'; year: number } | { kind: 'month'; year: number; month: number },
  clock: HistoryClock,
  hasMore: boolean,
): HistoryUnconfirmedView {
  const filtered = moments.filter((moment) => {
    const place = placeMomentForHistory(moment, clock);
    if (filter.kind === 'unknown') return place.kind === 'unknown';
    if (filter.kind === 'year') return place.kind === 'year' && place.year === filter.year;
    return place.kind === 'month' && place.year === filter.year && place.month === filter.month;
  });
  const ordered =
    filter.kind === 'unknown'
      ? [...filtered].sort((left, right) => right.time.recordedAt.localeCompare(left.time.recordedAt))
      : [...filtered].sort(compareListedMoments);
  const items = ordered.map((moment) => toListedMoment(moment, clock));
  if (filter.kind === 'unknown') {
    return {
      kind: 'unknown',
      title: '时间未确认',
      explanation: '这些记录没有可以确定的发生时间。记录时间只用来说明它们是后来写下的，不会当成发生日期。',
      items,
      hasMore,
    };
  }
  if (filter.kind === 'year') {
    return {
      kind: 'year',
      title: `${filter.year}年，月份未确认`,
      explanation: '只知道发生在这一年，没有更具体的月份。不会放进某一个月的格子里。',
      items,
      hasMore,
    };
  }
  return {
    kind: 'month',
    title: `${filter.year}年${filter.month}月，日子未确认`,
    explanation: '只知道发生在这一个月，没有更具体的日期。不会放进某一天。',
    items,
    hasMore,
  };
}

function projectYearSummary(
  moments: MomentRecord[],
  year: number,
  clock: HistoryClock,
): HistoryYearSummary {
  const monthCounts = Array.from({ length: 12 }, () => 0);
  let yearUnconfirmedCount = 0;
  let momentCount = 0;
  for (const moment of moments) {
    const place = placeMomentForHistory(moment, clock);
    if (place.kind === 'unknown') continue;
    if (place.year !== year) continue;
    momentCount += 1;
    if (place.kind === 'year') {
      yearUnconfirmedCount += 1;
      continue;
    }
    monthCounts[place.month - 1] += 1;
  }
  const filledMonths = monthCounts.filter((count) => count > 0).length;
  return {
    year,
    monthCounts,
    filledMonths,
    quietMonths: 12 - filledMonths,
    yearUnconfirmedCount,
    momentCount,
  };
}

export function toListedMoment(moment: MomentRecord, clock: HistoryClock): HistoryListedMoment {
  const precision = moment.time.occurredAtPrecision;
  const occurredMillis = parseMillis(moment.time.occurredAt || moment.time.recordedAt);
  const recordedMillis = parseMillis(moment.time.recordedAt);
  const occurredOffset = occurredMillis === null ? 0 : offsetMinutesAt(occurredMillis, clock);
  const recordedOffset = recordedMillis === null ? 0 : offsetMinutesAt(recordedMillis, clock);
  const timeLabel = formatCalendarDate(
    moment.time.occurredAt || moment.time.recordedAt,
    precision,
    occurredOffset,
  );
  const usedRecordedAtFallback = precision === 'unknown' || !moment.time.occurredAt;
  return {
    id: moment.id,
    note: moment.content.note,
    precision,
    timeLabel: usedRecordedAtFallback ? '时间未确认' : timeLabel,
    usedRecordedAtFallback,
    recordedFallbackLabel: usedRecordedAtFallback
      ? `记录于 ${formatCalendarDate(moment.time.recordedAt, 'day', recordedOffset)}`
      : undefined,
  };
}

function compareListedMoments(left: MomentRecord, right: MomentRecord): number {
  const leftExact = left.time.occurredAtPrecision === 'exact' ? left.time.occurredAt || '' : '';
  const rightExact = right.time.occurredAtPrecision === 'exact' ? right.time.occurredAt || '' : '';
  if (leftExact && rightExact && leftExact !== rightExact) return leftExact.localeCompare(rightExact);
  if (leftExact && !rightExact) return -1;
  if (!leftExact && rightExact) return 1;
  return left.time.recordedAt.localeCompare(right.time.recordedAt);
}
