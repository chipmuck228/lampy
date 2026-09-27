export type RecentDayItem = {
  id: string;
  dateLabel: string;
};

export type RecentDayGroup<T extends RecentDayItem> = {
  dateLabel: string;
  items: T[];
};

export function groupRecentDays<T extends RecentDayItem>(items: T[]): RecentDayGroup<T>[] {
  const groups: RecentDayGroup<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === item.dateLabel) {
      last.items.push(item);
    } else {
      groups.push({ dateLabel: item.dateLabel, items: [item] });
    }
  }
  return groups;
}
