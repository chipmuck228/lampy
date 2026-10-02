import { COMPACT_HEIGHT, NAV_BAND_HIT } from './life-page';

export const LOOKBACK_CATALOG_NAV_HEIGHT = 8 + NAV_BAND_HIT;
export const LOOKBACK_CATALOG_MIN_HEIGHT = 88;

export function lookbackCatalogMaxHeight(input: {
  windowHeight: number;
  insetTop: number;
  insetBottom: number;
  headerHeight: number;
  navHeight?: number;
  rail?: boolean;
}): number {
  const nav = input.rail ? 0 : (input.navHeight ?? LOOKBACK_CATALOG_NAV_HEIGHT);
  const available = Math.max(
    0,
    input.windowHeight - input.insetTop - input.insetBottom - input.headerHeight - nav,
  );
  const compact = input.windowHeight < COMPACT_HEIGHT;
  const cap = Math.floor(available * (compact ? 0.36 : 0.5));
  return Math.max(LOOKBACK_CATALOG_MIN_HEIGHT, cap);
}

export function lookbackCatalogToggleLabel(expanded: boolean): string {
  return expanded ? '收起时间目录' : '打开时间目录';
}
