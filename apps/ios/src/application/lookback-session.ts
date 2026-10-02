import type { LookbackBookIntent } from './lookback-book';
import type { LookbackReadingSnapshot } from './lookback-reading';

const scrollOffsets = new Map<string, number>();
let pendingBookIntent: LookbackBookIntent | null = null;
let bookOpen: { year: number; month: number; day?: number } | null = null;
let readingSnapshot: LookbackReadingSnapshot | null = null;
let catalogScrollY = 0;

export function lookbackScrollKey(path: string): string {
  return path;
}

export function rememberLookbackScroll(path: string, offsetY: number): void {
  scrollOffsets.set(path, offsetY);
}

export function readLookbackScroll(path: string): number {
  return scrollOffsets.get(path) ?? 0;
}

export function writeLookbackBookIntent(intent: LookbackBookIntent): void {
  pendingBookIntent = intent;
}

export function takeLookbackBookIntent(): LookbackBookIntent | null {
  const intent = pendingBookIntent;
  pendingBookIntent = null;
  return intent;
}

export function peekLookbackBookIntentForTests(): LookbackBookIntent | null {
  return pendingBookIntent;
}

export function rememberLookbackBookOpen(open: { year: number; month: number; day?: number } | null): void {
  bookOpen = open;
}

export function readLookbackBookOpen(): { year: number; month: number; day?: number } | null {
  return bookOpen;
}

export function rememberLookbackReadingSnapshot(next: LookbackReadingSnapshot | null): void {
  readingSnapshot = next ? { ...next, expandedIds: [...next.expandedIds] } : null;
}

export function readLookbackReadingSnapshot(): LookbackReadingSnapshot | null {
  return readingSnapshot ? { ...readingSnapshot, expandedIds: [...readingSnapshot.expandedIds] } : null;
}

export function patchLookbackReadingSnapshot(patch: Partial<LookbackReadingSnapshot>): void {
  if (!readingSnapshot) return;
  readingSnapshot = {
    ...readingSnapshot,
    ...patch,
    expandedIds: patch.expandedIds ? [...patch.expandedIds] : [...readingSnapshot.expandedIds],
    scope: patch.scope ?? readingSnapshot.scope,
  };
}

export function rememberLookbackCatalogScroll(offsetY: number): void {
  catalogScrollY = offsetY;
}

export function readLookbackCatalogScroll(): number {
  return catalogScrollY;
}

export function resetLookbackSessionForTests(): void {
  scrollOffsets.clear();
  pendingBookIntent = null;
  bookOpen = null;
  readingSnapshot = null;
  catalogScrollY = 0;
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
