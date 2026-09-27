export type RecentDayItem = {
  id: string;
  dateLabel: string;
  recordedAt: string;
};

export type RecentDayGroup<T extends RecentDayItem> = {
  key: string;
  dateLabel: string;
  items: T[];
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function recentDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function recentDayHeading(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '时间未确认';
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}年${monthDay}`;
  }
  return monthDay;
}

export function groupRecentDays<T extends RecentDayItem>(
  items: T[],
  now: Date = new Date(),
): RecentDayGroup<T>[] {
  const groups: RecentDayGroup<T>[] = [];
  for (const item of items) {
    const key = recentDayKey(item.recordedAt);
    const dateLabel = key === 'unknown' ? '时间未确认' : recentDayHeading(item.recordedAt, now);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, dateLabel, items: [item] });
    }
  }
  return groups;
}
