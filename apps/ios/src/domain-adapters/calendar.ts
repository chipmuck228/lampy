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

export function calendarRangeStartUtc(
  year: number,
  month = 1,
  day = 1,
  timezoneOffsetMinutes = 0,
): number {
  return Date.UTC(year, month - 1, day) - timezoneOffsetMinutes * 60 * 1000;
}

export function calendarYearBounds(year: number, timezoneOffsetMinutes = 0): {
  startIso: string;
  endIso: string;
} {
  return {
    startIso: new Date(calendarRangeStartUtc(year, 1, 1, timezoneOffsetMinutes)).toISOString(),
    endIso: new Date(calendarRangeStartUtc(year + 1, 1, 1, timezoneOffsetMinutes)).toISOString(),
  };
}

export function calendarMonthBounds(
  year: number,
  month: number,
  timezoneOffsetMinutes = 0,
): { startIso: string; endIso: string } {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    startIso: new Date(calendarRangeStartUtc(year, month, 1, timezoneOffsetMinutes)).toISOString(),
    endIso: new Date(calendarRangeStartUtc(nextYear, nextMonth, 1, timezoneOffsetMinutes)).toISOString(),
  };
}

export function calendarDayBounds(
  year: number,
  month: number,
  day: number,
  timezoneOffsetMinutes = 0,
): { startIso: string; endIso: string } {
  const start = calendarRangeStartUtc(year, month, day, timezoneOffsetMinutes);
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
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
