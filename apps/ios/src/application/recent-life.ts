import {
  calendarPartsAt,
  pad2,
  parseMillis,
  type HistoryClock,
} from '../domain-adapters/calendar';

export const UNKNOWN_RECENT_DAY_KEY = 'unknown';
export const UNKNOWN_RECENT_DAY_LABEL = '时间未确认';

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
  return dayLabel.startsWith('记录于') ? dayLabel : `记录于 ${dayLabel}`;
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
  const monthDay = `${parts.month}月${parts.day}日`;
  const dayLabel = parts.year !== nowParts.year ? `${parts.year}年${monthDay}` : monthDay;
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
