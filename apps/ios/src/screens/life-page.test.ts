import {
  DATE_RAIL_GAP,
  DATE_RAIL_WIDTH,
  READING_MAX,
  isCompactHeight,
  isRegularWidth,
  pageColumnWidth,
  pageGutter,
  readingWidth,
} from './life-page';

describe('life page measures', () => {
  it('keeps a readable column beside the date rail on a wide tablet', () => {
    expect(readingWidth(1024)).toBe(520);
    expect(pageColumnWidth(1024, 1366)).toBe(DATE_RAIL_WIDTH + DATE_RAIL_GAP + READING_MAX);
    expect(pageColumnWidth(1024, 1366)).toBe(672);
    expect(pageGutter(1024, 1366)).toBe(48);
    expect(isRegularWidth(768, 1024)).toBe(true);
  });

  it('does not treat a landscape phone as a tablet page', () => {
    expect(isRegularWidth(852, 393)).toBe(false);
    expect(pageColumnWidth(852, 393)).toBe(520);
    expect(pageGutter(852, 393)).toBe(24);
  });

  it('uses the compact gutter and short-height rule on a phone', () => {
    expect(readingWidth(390)).toBe(390);
    expect(pageColumnWidth(390, 844)).toBe(390);
    expect(pageGutter(390, 844)).toBe(24);
    expect(isRegularWidth(390, 844)).toBe(false);
    expect(isCompactHeight(390)).toBe(true);
    expect(isCompactHeight(844)).toBe(false);
  });
});
