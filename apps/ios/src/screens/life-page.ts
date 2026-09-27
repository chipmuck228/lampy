export const paper = '#F3F0E9';
export const paperDeep = '#E8E1D5';
export const ink = '#25231F';
export const inkSoft = '#5C5851';
export const sage = '#53604F';
export const clay = '#87513D';
export const sound = '#4F626D';
export const hairline = 'rgba(37,35,31,0.16)';
export const placeholder = '#777168';

export const READING_MAX = 520;
export const DATE_RAIL_WIDTH = 120;
export const DATE_RAIL_GAP = 32;
export const COMPACT_HEIGHT = 500;
export const REGULAR_WIDTH = 768;
export const LARGE_TYPE = 1.3;

export function pageGutter(windowWidth: number, windowHeight?: number): number {
  return isRegularWidth(windowWidth, windowHeight) ? 48 : 24;
}

export function readingWidth(windowWidth: number, windowHeight?: number): number {
  const inner = windowWidth - 2 * pageGutter(windowWidth, windowHeight);
  return Math.min(Math.max(inner, 0), READING_MAX);
}

export function readingPageWidth(windowWidth: number, windowHeight?: number): number {
  return pageGutter(windowWidth, windowHeight) * 2 + readingWidth(windowWidth, windowHeight);
}

export function railPageWidth(windowWidth: number, windowHeight?: number): number {
  return (
    pageGutter(windowWidth, windowHeight) * 2 +
    DATE_RAIL_WIDTH +
    DATE_RAIL_GAP +
    readingWidth(windowWidth, windowHeight)
  );
}

export function pageColumnWidth(windowWidth: number, windowHeight?: number): number {
  if (isRegularWidth(windowWidth, windowHeight)) {
    return railPageWidth(windowWidth, windowHeight);
  }
  return readingPageWidth(windowWidth, windowHeight);
}

export function isRegularWidth(windowWidth: number, windowHeight?: number): boolean {
  if (windowHeight !== undefined && windowHeight < COMPACT_HEIGHT) return false;
  return windowWidth >= REGULAR_WIDTH;
}

export function isCompactHeight(windowHeight: number): boolean {
  return windowHeight < COMPACT_HEIGHT;
}

export function isLargeType(fontScale: number): boolean {
  return fontScale >= LARGE_TYPE;
}

export function shouldStackRecentDay(windowWidth: number, windowHeight: number, fontScale: number): boolean {
  return !isRegularWidth(windowWidth, windowHeight) || isLargeType(fontScale);
}

export function recentColumnWidth(windowWidth: number, windowHeight: number, fontScale: number): number {
  return isLargeType(fontScale) ? readingPageWidth(windowWidth, windowHeight) : pageColumnWidth(windowWidth, windowHeight);
}

export function shouldShowSameDayRule(indexInDay: number): boolean {
  return indexInDay > 0;
}
