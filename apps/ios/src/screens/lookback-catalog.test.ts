import { lookbackCatalogMaxHeight, lookbackCatalogToggleLabel, LOOKBACK_CATALOG_MIN_HEIGHT } from './lookback-catalog';
import { leaveFabScrollReserve, LEAVE_FAB_HIT } from './leave-fab';

describe('lookback catalog and shared leave fab helpers', () => {
  it('caps an in-place catalog at half the remaining viewport and keeps a usable short-screen floor', () => {
    expect(
      lookbackCatalogMaxHeight({
        windowHeight: 844,
        insetTop: 47,
        insetBottom: 34,
        headerHeight: 176,
      }),
    ).toBe(Math.floor((844 - 47 - 34 - 176 - 56) * 0.5));
    expect(
      lookbackCatalogMaxHeight({
        windowHeight: 390,
        insetTop: 20,
        insetBottom: 20,
        headerHeight: 160,
      }),
    ).toBeGreaterThanOrEqual(LOOKBACK_CATALOG_MIN_HEIGHT);
    expect(lookbackCatalogToggleLabel(false)).toBe('打开时间目录');
    expect(lookbackCatalogToggleLabel(true)).toBe('收起时间目录');
  });

  it('reserves only the shared leave button occupancy, not the nav band', () => {
    expect(leaveFabScrollReserve()).toBe(LEAVE_FAB_HIT + 16);
  });
});
