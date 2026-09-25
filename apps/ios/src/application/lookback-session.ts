const scrollOffsets = new Map<string, number>();

export function lookbackScrollKey(path: string): string {
  return path;
}

export function rememberLookbackScroll(path: string, offsetY: number): void {
  scrollOffsets.set(path, offsetY);
}

export function readLookbackScroll(path: string): number {
  return scrollOffsets.get(path) ?? 0;
}

export function resetLookbackSessionForTests(): void {
  scrollOffsets.clear();
}

/**
 * 滚动位置只存在于本次进程。
 * 所选年 / 月 / 日在路由参数里；栈内返回可以回到原页。
 * 冷启动回到「最近」，不自动跳回上次回看位置。
 */
export const LOOKBACK_RESTORE_POLICY = {
  selectedDate: 'route-params-and-back-stack',
  scrollOffset: 'in-process-only',
  coldStart: 'recent-home',
} as const;
