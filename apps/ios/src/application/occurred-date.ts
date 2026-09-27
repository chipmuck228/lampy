import {
  calendarDayBounds,
  calendarPartsAt,
  isValidCalendarDay,
  parseMillis,
  type HistoryClock,
} from '../domain-adapters/calendar';
import { ApplicationError } from './errors';

export const OCCURRED_IN_FUTURE_MESSAGE = '还不能选还没到的日子。';
export const OCCURRED_INVALID_DATE_MESSAGE = '这一天不存在。';

export type CalendarDayParts = {
  year: number;
  month: number;
  day: number;
};

export type OccurredDraftInput =
  | { kind: 'today' }
  | { kind: 'day'; year: number; month: number; day: number }
  | { kind: 'unknown' };

export type OccurredChoiceView = {
  kind: 'today' | 'day' | 'unknown';
  year?: number;
  month?: number;
  day?: number;
  label: string;
};

export function calendarDayKey(parts: CalendarDayParts): number {
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

export function isSameCalendarDayParts(left: CalendarDayParts, right: CalendarDayParts): boolean {
  return calendarDayKey(left) === calendarDayKey(right);
}

export function isCalendarDayAfter(left: CalendarDayParts, right: CalendarDayParts): boolean {
  return calendarDayKey(left) > calendarDayKey(right);
}

export function formatOccurredDayLabel(parts: CalendarDayParts, today: CalendarDayParts): string {
  if (isSameCalendarDayParts(parts, today)) return '今天';
  if (parts.year !== today.year) return `${parts.year}年${parts.month}月${parts.day}日`;
  return `${parts.month}月${parts.day}日`;
}

export function projectOccurredChoice(
  time: { occurredAt?: string; occurredAtPrecision?: string },
  now: Date,
  clock: HistoryClock,
): OccurredChoiceView {
  const precision = time.occurredAtPrecision || 'unknown';
  const occurredMillis = parseMillis(time.occurredAt);
  if (precision === 'unknown' || !time.occurredAt || occurredMillis === null) {
    return { kind: 'unknown', label: '时间不确定' };
  }
  const occurred = calendarPartsAt(occurredMillis, clock);
  const today = calendarPartsAt(now.getTime(), clock);
  return {
    kind: isSameCalendarDayParts(occurred, today) ? 'today' : 'day',
    year: occurred.year,
    month: occurred.month,
    day: occurred.day,
    label: formatOccurredDayLabel(occurred, today),
  };
}

export function resolveOccurredPatch(
  input: OccurredDraftInput,
  now: Date,
  clock: HistoryClock,
): {
  occurredAt: string;
  occurredAtPrecision: 'day' | 'unknown';
  timezone?: string;
} {
  if (input.kind === 'unknown') {
    return { occurredAt: '', occurredAtPrecision: 'unknown' };
  }
  const today = calendarPartsAt(now.getTime(), clock);
  const day = input.kind === 'today' ? today : input;
  if (!isValidCalendarDay(day.year, day.month, day.day)) {
    throw new ApplicationError('OCCURRED_INVALID_DATE', OCCURRED_INVALID_DATE_MESSAGE);
  }
  if (isCalendarDayAfter(day, today)) {
    throw new ApplicationError('OCCURRED_IN_FUTURE', OCCURRED_IN_FUTURE_MESSAGE);
  }
  const bounds = calendarDayBounds(day.year, day.month, day.day, clock);
  const timezone = typeof clock === 'object' && clock && 'timeZone' in clock ? clock.timeZone : undefined;
  return {
    occurredAt: bounds.startIso,
    occurredAtPrecision: 'day',
    timezone,
  };
}

export function occurredInputFromChoice(choice: OccurredChoiceView): OccurredDraftInput {
  if (choice.kind === 'unknown') return { kind: 'unknown' };
  if (choice.year && choice.month && choice.day) {
    return { kind: 'day', year: choice.year, month: choice.month, day: choice.day };
  }
  return { kind: 'today' };
}

export function optimisticOccurredChoice(
  input: OccurredDraftInput,
  today: CalendarDayParts,
): OccurredChoiceView {
  if (input.kind === 'unknown') return { kind: 'unknown', label: '时间不确定' };
  const day = input.kind === 'today' ? today : input;
  return {
    kind: input.kind === 'today' || isSameCalendarDayParts(day, today) ? 'today' : 'day',
    year: day.year,
    month: day.month,
    day: day.day,
    label: formatOccurredDayLabel(day, today),
  };
}
