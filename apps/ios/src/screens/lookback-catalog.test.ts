import {
  lookbackCatalogChromeHeight,
  lookbackCatalogMaxHeight,
  lookbackCatalogToggleLabel,
  LOOKBACK_CATALOG_CHROME_HEIGHT,
  LOOKBACK_CATALOG_CHROME_HEIGHT_SHORT,
  LOOKBACK_CATALOG_MIN_HEIGHT,
} from './lookback-catalog';
import {
  leaveFabScrollReserve,
  LEAVE_FAB_GAP_ABOVE_NAV,
  LEAVE_FAB_HIT,
  LEAVE_FAB_TRAIL,
} from './leave-fab';
import { NAV_BAND_HIT } from './life-page';

describe('lookback catalog and shared leave fab helpers', () => {
  it('caps an in-place catalog at half the remaining viewport and keeps a usable short-screen floor', () => {
    expect(
      lookbackCatalogMaxHeight({
        windowHeight: 844,
        insetTop: 47,
        insetBottom: 34,
        headerHeight: lookbackCatalogChromeHeight(false),
      }),
    ).toBe(Math.floor((844 - 47 - 34 - LOOKBACK_CATALOG_CHROME_HEIGHT - 56) * 0.5));
    expect(
      lookbackCatalogMaxHeight({
        windowHeight: 390,
        insetTop: 20,
        insetBottom: 20,
        headerHeight: lookbackCatalogChromeHeight(true),
      }),
    ).toBeGreaterThanOrEqual(LOOKBACK_CATALOG_MIN_HEIGHT);
    expect(lookbackCatalogToggleLabel(false)).toBe('打开时间目录');
    expect(lookbackCatalogToggleLabel(true)).toBe('收起时间目录');
  });

  it('does not feed the expanded catalog back into its own cap', () => {
    expect(lookbackCatalogChromeHeight(false)).toBe(LOOKBACK_CATALOG_CHROME_HEIGHT);
    expect(lookbackCatalogChromeHeight(true)).toBe(LOOKBACK_CATALOG_CHROME_HEIGHT_SHORT);
    const chrome = lookbackCatalogChromeHeight(false);
    const cap = lookbackCatalogMaxHeight({
      windowHeight: 844,
      insetTop: 47,
      insetBottom: 34,
      headerHeight: chrome,
    });
    const ifCatalogWereMeasured = lookbackCatalogMaxHeight({
      windowHeight: 844,
      insetTop: 47,
      insetBottom: 34,
      headerHeight: chrome + cap,
    });
    expect(ifCatalogWereMeasured).toBeLessThan(cap);
  });

  it('reserves only the shared leave button occupancy, not the nav band', () => {
    expect(leaveFabScrollReserve()).toBe(LEAVE_FAB_HIT + LEAVE_FAB_GAP_ABOVE_NAV + LEAVE_FAB_TRAIL);
    expect(leaveFabScrollReserve()).toBeLessThan(LEAVE_FAB_HIT + NAV_BAND_HIT + LEAVE_FAB_GAP_ABOVE_NAV);
  });
});
