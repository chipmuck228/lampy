const scrollOffsets = new Map<string, number>();
const expandedMonths = new Map<number, number>();

export function lookbackScrollKey(path: string): string {
  return path;
}

export function rememberLookbackScroll(path: string, offsetY: number): void {
  scrollOffsets.set(path, offsetY);
}

export function readLookbackScroll(path: string): number {
  return scrollOffsets.get(path) ?? 0;
}

export function rememberLookbackExpandedMonth(year: number, month: number | null): void {
  if (month == null) {
    expandedMonths.delete(year);
    return;
  }
  expandedMonths.set(year, month);
}

export function readLookbackExpandedMonth(year: number): number | null {
  return expandedMonths.get(year) ?? null;
}

export function toggleLookbackExpandedMonth(year: number, month: number): number | null {
  const next = readLookbackExpandedMonth(year) === month ? null : month;
  rememberLookbackExpandedMonth(year, next);
  return next;
}

export function resetLookbackSessionForTests(): void {
  scrollOffsets.clear();
  expandedMonths.clear();
}

/**
 * 滚动位置只存在于本次进程。
 * 所选年 / 月 / 日在路由参数里；栈内返回可以回到原页。
 * 年页展开的月只存在于本次进程；冷启动不恢复，除非这次 URL 是月深链。
 * 冷启动回到「最近」，不自动跳回上次回看位置。
 */
export const LOOKBACK_RESTORE_POLICY = {
  selectedDate: 'route-params-and-back-stack',
  expandedMonth: 'in-process-only',
  scrollOffset: 'in-process-only',
  coldStart: 'recent-home',
} as const;
