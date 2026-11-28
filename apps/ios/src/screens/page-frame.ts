import { isRegularWidth, pageGutter, TABLET_PAGE_MAX } from './life-page';

/** One page frame for every regular window, independent of device/orientation. */
export const TABLET_READING_MAX = 640;
export const tabletRootTitle = { fontSize: 42, lineHeight: 56, fontWeight: '500' as const, marginTop: 0, letterSpacing: 1.2 };

export function pageFrame(width: number, height: number) {
  const regular = isRegularWidth(width, height);
  const gutter = pageGutter(width, height);
  const column = regular ? Math.min(width, TABLET_PAGE_MAX) : width;
  const content = Math.max(0, column - gutter * 2);
  return {
    regular, gutter, column, content,
    reading: Math.min(content, TABLET_READING_MAX),
    top: regular ? 28 : height < 500 ? 12 : 20,
    bottom: 24,
  };
}
