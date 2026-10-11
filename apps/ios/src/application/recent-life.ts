import { tr } from '../i18n';
import {
  calendarPartsAt,
  pad2,
  parseMillis,
  type HistoryClock,
} from '../domain-adapters/calendar';

export const UNKNOWN_RECENT_DAY_KEY = 'unknown';
export const UNKNOWN_RECENT_DAY_LABEL = tr("时间未确认");
export const RECENT_VISIBLE_DAY_COUNT = 7;

export type RecentDayStamp = {
  dayKey: string;
  dayLabel: string;
};

export type RecentDayGroup<T extends RecentDayStamp> = {
  key: string;
  label: string;
  items: T[];
};

export function recordedHeadingForRecent(dayLabel: string): string {
  return dayLabel.startsWith(tr("记录于")) ? dayLabel : tr("记录于 {0}", [dayLabel]);
}

export function sameViewerCalendarDay(
  leftIso: string | undefined,
  rightIso: string | undefined,
  clock: HistoryClock,
): boolean {
  if (!leftIso || !rightIso) return false;
  const left = parseMillis(leftIso);
  const right = parseMillis(rightIso);
  if (left == null || right == null) return false;
  const a = calendarPartsAt(left, clock);
  const b = calendarPartsAt(right, clock);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function recordedDayForRecent(
  recordedAt: string,
  now: Date,
  clock: HistoryClock,
): RecentDayStamp {
  const millis = parseMillis(recordedAt);
  if (millis == null) {
    return { dayKey: UNKNOWN_RECENT_DAY_KEY, dayLabel: UNKNOWN_RECENT_DAY_LABEL };
  }
  const parts = calendarPartsAt(millis, clock);
  const nowParts = calendarPartsAt(now.getTime(), clock);
  const dayKey = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  const monthDay = tr("{0}月{1}日", [parts.month, parts.day]);
  const dayLabel = parts.year !== nowParts.year ? tr("{0}年{1}", [parts.year, monthDay]) : monthDay;
  return { dayKey, dayLabel };
}

export function groupRecentLifeDays<T extends RecentDayStamp>(items: T[]): RecentDayGroup<T>[] {
  const groups: RecentDayGroup<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.key === item.dayKey) {
      last.items.push(item);
    } else {
      groups.push({ key: item.dayKey, label: recordedHeadingForRecent(item.dayLabel), items: [item] });
    }
  }
  return groups;
}

export function takeRecentLifeDays<T extends RecentDayStamp>(
  days: RecentDayGroup<T>[],
  limit = RECENT_VISIBLE_DAY_COUNT,
): RecentDayGroup<T>[] {
  if (limit < 1) return [];
  return days.slice(0, limit);
}
