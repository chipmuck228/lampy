import {
  DATE_RAIL_GAP,
  DATE_RAIL_WIDTH,
  READING_MAX,
  isCompactHeight,
  isLargeType,
  isRegularWidth,
  pageColumnWidth,
  pageGutter,
  readingPageWidth,
  readingWidth,
  recentColumnWidth,
  shouldShowSameDayRule,
  shouldStackNavBand,
  shouldStackRecentDay,
  shouldUseNavRail,
} from './life-page';

describe('life page measures', () => {
  it('keeps a 520 reading column beside the date rail on a tablet', () => {
    expect(readingWidth(1024, 1366)).toBe(READING_MAX);
    expect(pageColumnWidth(1024, 1366)).toBe(
      pageGutter(1024, 1366) * 2 + DATE_RAIL_WIDTH + DATE_RAIL_GAP + READING_MAX,
    );
    expect(pageColumnWidth(1024, 1366)).toBe(768);
    expect(pageGutter(1024, 1366)).toBe(48);
    expect(isRegularWidth(768, 1024)).toBe(true);
  });

  it('does not treat a landscape phone as a tablet page', () => {
    expect(isRegularWidth(852, 393)).toBe(false);
    expect(readingWidth(852, 393)).toBe(READING_MAX);
    expect(pageColumnWidth(852, 393)).toBe(readingPageWidth(852, 393));
    expect(pageColumnWidth(852, 393)).toBe(568);
    expect(pageGutter(852, 393)).toBe(24);
  });

  it('uses the phone gutter outside the reading measure', () => {
    expect(readingWidth(390, 844)).toBe(342);
    expect(pageColumnWidth(390, 844)).toBe(390);
    expect(pageGutter(390, 844)).toBe(24);
    expect(isRegularWidth(390, 844)).toBe(false);
    expect(isCompactHeight(390)).toBe(true);
    expect(isCompactHeight(844)).toBe(false);
  });

  it('treats accessibility extra-large and above as stacked reading, not a date rail', () => {
    expect(isLargeType(1)).toBe(false);
    expect(isLargeType(1.3)).toBe(true);
    expect(isLargeType(3.1)).toBe(true);
    expect(shouldStackRecentDay(1024, 1366, 1)).toBe(false);
    expect(shouldStackRecentDay(1024, 1366, 3.1)).toBe(true);
    expect(shouldStackRecentDay(390, 844, 1)).toBe(true);
    expect(recentColumnWidth(1024, 1366, 1)).toBe(768);
    expect(recentColumnWidth(1024, 1366, 3.1)).toBe(616);
    expect(recentColumnWidth(390, 844, 3.1)).toBe(390);
  });

  it('uses a left rail on tablet regular type and stacks the band for large type or a narrow phone', () => {
    expect(shouldUseNavRail(1024, 1366, 1)).toBe(true);
    expect(shouldUseNavRail(1024, 1366, 3.1)).toBe(false);
    expect(shouldUseNavRail(390, 844, 1)).toBe(false);
    expect(shouldUseNavRail(852, 393, 1)).toBe(false);
    expect(shouldStackNavBand(390, 1)).toBe(false);
    expect(shouldStackNavBand(390, 1, 4)).toBe(false);
    expect(shouldStackNavBand(320, 1)).toBe(false);
    expect(shouldStackNavBand(320, 1, 4)).toBe(true);
    expect(shouldStackNavBand(1024, 3.1)).toBe(true);
  });

  it('draws a same-day rule only between siblings, never around a day', () => {
    expect(shouldShowSameDayRule(0)).toBe(false);
    expect(shouldShowSameDayRule(1)).toBe(true);
    expect(shouldShowSameDayRule(2)).toBe(true);
  });
});
