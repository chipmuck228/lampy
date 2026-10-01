import {
  DATE_RAIL_GAP,
  DATE_RAIL_WIDTH,
  READING_MAX,
  isCompactHeight,
  isRegularWidth,
  pageColumnWidth,
  pageGutter,
  readingPageWidth,
  readingWidth,
  recentColumnWidth,
  recentImageColumnWidth,
  chooseNavBandLayout,
  navBandItemMinHeight,
  navBandItemsFor,
  shouldShowSameDayRule,
  shouldStackLeaveActions,
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

  it('stacks the date rail from available width, not from system type', () => {
    expect(shouldStackRecentDay(1024, 1366)).toBe(false);
    expect(shouldStackRecentDay(390, 844)).toBe(true);
    expect(shouldStackRecentDay(852, 393)).toBe(true);
    expect(recentColumnWidth(1024, 1366)).toBe(768);
    expect(recentColumnWidth(390, 844)).toBe(390);
  });

  it('measures the image column after gutters, the date rail, and safe edges', () => {
    expect(recentImageColumnWidth(1024, 1366)).toBe(READING_MAX);
    expect(recentImageColumnWidth(390, 844)).toBe(342);
    expect(recentImageColumnWidth(320, 700)).toBe(272);
    expect(recentImageColumnWidth(768, 1024, 200, 200)).toBe(120);
    expect(768).toBeGreaterThanOrEqual(280);
    expect(recentImageColumnWidth(768, 1024, 200, 200)).toBeLessThan(280);
  });

  it('uses a left rail on tablet width, not on a phone', () => {
    expect(shouldUseNavRail(1024, 1366)).toBe(true);
    expect(shouldUseNavRail(390, 844)).toBe(false);
    expect(shouldUseNavRail(852, 393)).toBe(false);
  });

  it('picks a band layout from available width and painted label size', () => {
    const withFamily = navBandItemsFor('recent', true);
    const two = navBandItemsFor('lookback', false);
    expect(withFamily.map((item) => item.label)).toEqual(['最近', '回看', '家庭']);
    expect(two.map((item) => item.label)).toEqual(['回看', '最近']);
    expect(navBandItemMinHeight(17)).toBe(48);
    expect(chooseNavBandLayout({ windowWidth: 390, items: withFamily })).toBe('row');
    expect(chooseNavBandLayout({ windowWidth: 390, items: two })).toBe('row');
    expect(chooseNavBandLayout({ windowWidth: 200, items: withFamily })).toBe('row');
    expect(chooseNavBandLayout({ windowWidth: 200, items: two })).toBe('row');
    expect(chooseNavBandLayout({ windowWidth: 1024, items: withFamily })).toBe('row');
    expect(
      chooseNavBandLayout({
        windowWidth: 390,
        items: two.map((item) => ({ ...item, measuredWidth: 180 })),
      }),
    ).toBe('stack');
    expect(
      chooseNavBandLayout({
        windowWidth: 390,
        items: two.map((item) => ({ ...item, measuredWidth: 28 })),
      }),
    ).toBe('row');
    expect(shouldStackNavBand(390, 4)).toBe(false);
    expect(shouldStackNavBand(200, 4)).toBe(false);
  });

  it('stacks 留下 onto its own row when the three actions no longer fit', () => {
    expect(shouldStackLeaveActions(342)).toBe(false);
    expect(shouldStackLeaveActions(220)).toBe(true);
  });

  it('draws a same-day rule only between siblings, never around a day', () => {
    expect(shouldShowSameDayRule(0)).toBe(false);
    expect(shouldShowSameDayRule(1)).toBe(true);
    expect(shouldShowSameDayRule(2)).toBe(true);
  });
});
