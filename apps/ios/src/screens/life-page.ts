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

export function shouldUseNavRail(windowWidth: number, windowHeight: number, fontScale: number): boolean {
  return isRegularWidth(windowWidth, windowHeight) && !isLargeType(fontScale);
}

export const NAV_BAND_PAD_X = 32;
export const NAV_BAND_HIT = 48;
export const NAV_BAND_LABEL_PAD = 8;
export const NAV_BAND_HERE_SIZE = 17;
export const NAV_BAND_LEAVE_SIZE = 20;

export type NavBandLayout = 'row' | 'grid' | 'stack';

export function navBandItemMinWidth(label: string, fontSize: number, fontScale: number): number {
  const textWidth = [...label].length * fontSize * fontScale;
  return Math.max(NAV_BAND_HIT, textWidth + NAV_BAND_LABEL_PAD);
}

export function navBandItemMinHeight(fontSize: number, fontScale: number): number {
  return Math.max(NAV_BAND_HIT, Math.ceil(fontSize * 1.45 * fontScale));
}

export function navBandItemsFor(
  here: 'recent' | 'lookback',
  hasFamily: boolean,
): { label: string; fontSize: number }[] {
  const hereLabel = here === 'recent' ? '最近' : '回看';
  const otherLabel = here === 'recent' ? '回看' : '最近';
  const items = [
    { label: hereLabel, fontSize: NAV_BAND_HERE_SIZE },
    { label: otherLabel, fontSize: NAV_BAND_HERE_SIZE },
    { label: '留下', fontSize: NAV_BAND_LEAVE_SIZE },
  ];
  if (hasFamily) items.push({ label: '家庭', fontSize: NAV_BAND_HERE_SIZE });
  return items;
}

export function navBandOccupiedWidth(
  item: { label: string; fontSize: number; measuredWidth?: number },
  fontScale: number,
): number {
  if (item.measuredWidth != null && item.measuredWidth > 0) {
    return Math.max(NAV_BAND_HIT, item.measuredWidth + NAV_BAND_LABEL_PAD);
  }
  return navBandItemMinWidth(item.label, item.fontSize, fontScale);
}

export function chooseNavBandLayout(input: {
  windowWidth: number;
  fontScale: number;
  items: { label: string; fontSize: number; measuredWidth?: number }[];
}): NavBandLayout {
  const available = input.windowWidth - NAV_BAND_PAD_X;
  const widest = Math.max(
    NAV_BAND_HIT,
    ...input.items.map((item) => navBandOccupiedWidth(item, input.fontScale)),
  );
  const count = input.items.length;
  if (count < 1) return 'row';
  if (available >= count * widest) return 'row';
  if (count === 4 && available >= 2 * widest) return 'grid';
  return 'stack';
}

export function shouldStackNavBand(
  windowWidth: number,
  fontScale: number,
  itemCount = 3,
): boolean {
  return (
    chooseNavBandLayout({
      windowWidth,
      fontScale,
      items: navBandItemsFor('recent', itemCount >= 4),
    }) === 'stack'
  );
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
