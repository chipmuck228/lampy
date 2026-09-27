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
export const COMPACT_HEIGHT = 500;
export const REGULAR_WIDTH = 768;

export function pageGutter(windowWidth: number): number {
  return windowWidth >= REGULAR_WIDTH ? 48 : 24;
}

export function readingWidth(windowWidth: number): number {
  return Math.min(windowWidth, READING_MAX);
}

export function isRegularWidth(windowWidth: number): boolean {
  return windowWidth >= REGULAR_WIDTH;
}

export function isCompactHeight(windowHeight: number): boolean {
  return windowHeight < COMPACT_HEIGHT;
}
