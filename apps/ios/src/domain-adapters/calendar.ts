/* eslint-disable @typescript-eslint/no-require-imports */
const calendar = require('@lampy/domain/shared/calendar.js') as {
  getCalendarParts: (
    timestamp: number,
    timezoneOffsetMinutes?: number,
  ) => { year: number; month: number; day: number };
  getCalendarKey: (timestamp: number, timezoneOffsetMinutes?: number) => string;
  deviceTimezoneOffsetMinutes: (now?: Date | number) => number;
};

const dateFormat = require('@lampy/domain/shared/date-format.js') as {
  formatCalendarDate: (
    timestamp: string | number,
    precision: string,
    timezoneOffsetMinutes?: number,
  ) => string;
};

const time = require('@lampy/domain/shared/time.js') as {
  parseMillis: (value: unknown) => number | null;
};

export const {
  getCalendarParts,
  getCalendarKey,
  deviceTimezoneOffsetMinutes,
} = calendar;

export const { formatCalendarDate } = dateFormat;
export const { parseMillis } = time;

export type HistoryClock = number | { timeZone: string };

export function offsetMinutesAt(atMillis: number, clock: HistoryClock): number {
  if (typeof clock === 'number') return clock;
  return timezoneOffsetMinutesAt(atMillis, clock.timeZone);
}

export function timezoneOffsetMinutesAt(atMillis: number, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(atMillis));
  const value = Object.fromEntries(
    formatted.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  );
  return (asUtc - atMillis) / 60000;
}

export function calendarPartsAt(atMillis: number, clock: HistoryClock): {
  year: number;
  month: number;
  day: number;
} {
  return getCalendarParts(atMillis, offsetMinutesAt(atMillis, clock));
}

function dateKey(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

export function startOfCalendarDayUtc(
  year: number,
  month: number,
  day: number,
  clock: HistoryClock,
): number {
  const utcGuess = Date.UTC(year, month - 1, day);
  let low = utcGuess - 36 * 60 * 60 * 1000;
  let high = utcGuess + 36 * 60 * 60 * 1000;
  const target = dateKey(year, month, day);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const parts = calendarPartsAt(mid, clock);
    if (dateKey(parts.year, parts.month, parts.day) >= target) high = mid;
    else low = mid;
  }
  return high;
}

export function nextCalendarDay(year: number, month: number, day: number): {
  year: number;
  month: number;
  day: number;
} {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

export function calendarDayBounds(
  year: number,
  month: number,
  day: number,
  clock: HistoryClock,
): { startIso: string; endIso: string } {
  const start = startOfCalendarDayUtc(year, month, day, clock);
  const next = nextCalendarDay(year, month, day);
  const end = startOfCalendarDayUtc(next.year, next.month, next.day, clock);
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  };
}

export function calendarMonthBounds(
  year: number,
  month: number,
  clock: HistoryClock,
): { startIso: string; endIso: string } {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    startIso: new Date(startOfCalendarDayUtc(year, month, 1, clock)).toISOString(),
    endIso: new Date(startOfCalendarDayUtc(nextYear, nextMonth, 1, clock)).toISOString(),
  };
}

export function calendarYearBounds(
  year: number,
  clock: HistoryClock,
): { startIso: string; endIso: string } {
  return {
    startIso: new Date(startOfCalendarDayUtc(year, 1, 1, clock)).toISOString(),
    endIso: new Date(startOfCalendarDayUtc(year + 1, 1, 1, clock)).toISOString(),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidCalendarDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
