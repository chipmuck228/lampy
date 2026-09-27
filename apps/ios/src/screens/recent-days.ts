import { groupRecentLifeDays, type RecentDayGroup, type RecentDayStamp } from '../application/recent-life';

export type RecentDayItem = RecentDayStamp & {
  id: string;
  dateLabel?: string;
  recordedAt?: string;
};

export type { RecentDayGroup };

export function groupRecentDays<T extends RecentDayItem>(items: T[]): RecentDayGroup<T>[] {
  return groupRecentLifeDays(items);
}
