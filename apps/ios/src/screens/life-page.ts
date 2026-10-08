import { tr } from '../i18n';
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

export function shouldUseNavRail(windowWidth: number, windowHeight: number): boolean {
  return isRegularWidth(windowWidth, windowHeight);
}

export const NAV_BAND_PAD_X = 32;
export const NAV_BAND_HIT = 48;
export const NAV_BAND_LABEL_PAD = 8;
export const NAV_BAND_HERE_SIZE = 13;
export const NAV_BAND_LABEL_SIZE = 13;
export const NAV_BAND_ICON_SIZE = 23;
export const NAV_BAND_ICON_GAP = 4;
export const NAV_BAND_LEAVE_SIZE = 20;

export type NavBandLayout = 'row' | 'grid' | 'stack';

export function navBandItemMinWidth(label: string, fontSize: number): number {
  const textWidth = [...label].length * fontSize;
  return Math.max(NAV_BAND_HIT, textWidth + NAV_BAND_LABEL_PAD);
}

export function navBandItemMinHeight(fontSize: number): number {
  return Math.max(NAV_BAND_HIT, Math.ceil(fontSize * 1.45));
}

export function navBandItemsFor(
  _here: 'recent' | 'lookback' | 'albums',
  hasFamily: boolean,
): { label: string; fontSize: number }[] {
  const items = [
    { label: tr("最近"), fontSize: NAV_BAND_LABEL_SIZE },
    { label: tr("回看"), fontSize: NAV_BAND_LABEL_SIZE },
    { label: tr("生活册"), fontSize: NAV_BAND_LABEL_SIZE },
  ];
  if (hasFamily) items.push({ label: tr("家庭"), fontSize: NAV_BAND_LABEL_SIZE });
  return items;
}

export function navBandOccupiedWidth(item: {
  label: string;
  fontSize: number;
  measuredWidth?: number;
}): number {
  if (item.measuredWidth != null && item.measuredWidth > 0) {
    return Math.max(NAV_BAND_HIT, item.measuredWidth + NAV_BAND_LABEL_PAD);
  }
  return navBandItemMinWidth(item.label, item.fontSize);
}

export function chooseNavBandLayout(input: {
  windowWidth: number;
  items: { label: string; fontSize: number; measuredWidth?: number }[];
}): NavBandLayout {
  const available = input.windowWidth - NAV_BAND_PAD_X;
  const widest = Math.max(NAV_BAND_HIT, ...input.items.map((item) => navBandOccupiedWidth(item)));
  const count = input.items.length;
  if (count < 1) return 'row';
  if (available >= count * widest) return 'row';
  if (count === 4 && available >= 2 * widest) return 'grid';
  return 'stack';
}

export function shouldStackNavBand(windowWidth: number, itemCount = 3): boolean {
  return (
    chooseNavBandLayout({
      windowWidth,
      items: navBandItemsFor('recent', itemCount >= 4),
    }) === 'stack'
  );
}

export function shouldStackRecentDay(windowWidth: number, windowHeight: number): boolean {
  return !isRegularWidth(windowWidth, windowHeight);
}

export function recentColumnWidth(windowWidth: number, windowHeight: number): number {
  return pageColumnWidth(windowWidth, windowHeight);
}

/** Width left for photos after gutters and safe edges. */
export function recentImageColumnWidth(
  windowWidth: number,
  windowHeight: number,
  safeLeft = 0,
  safeRight = 0,
): number {
  const gutter = pageGutter(windowWidth, windowHeight);
  const pageCol = recentColumnWidth(windowWidth, windowHeight);
  const used = Math.min(Math.max(0, windowWidth - safeLeft - safeRight), pageCol);
  const inner = used - gutter * 2;
  return Math.max(0, inner);
}

export function shouldShowSameDayRule(indexInDay: number): boolean {
  return indexInDay > 0;
}

const LEAVE_MEDIA_ICON = 24;
const LEAVE_ACTION_GAP = 20;
const LEAVE_MEDIA_SIZE = 16;
const LEAVE_SAVE_SIZE = 18;

export function shouldStackLeaveActions(availableWidth: number): boolean {
  const camera = navBandItemMinWidth(tr("拍摄"), LEAVE_MEDIA_SIZE) + LEAVE_MEDIA_ICON;
  const photo = navBandItemMinWidth(tr("照片"), LEAVE_MEDIA_SIZE) + LEAVE_MEDIA_ICON;
  const save = navBandItemMinWidth(tr("留下"), LEAVE_SAVE_SIZE);
  return camera + photo + save + LEAVE_ACTION_GAP * 2 > availableWidth;
}
