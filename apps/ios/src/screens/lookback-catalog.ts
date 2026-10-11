import { tr } from '../i18n';
import { COMPACT_HEIGHT, NAV_BAND_HIT } from './life-page';

export const LOOKBACK_CATALOG_NAV_HEIGHT = 8 + NAV_BAND_HIT;
export const LOOKBACK_CATALOG_MIN_HEIGHT = 88;
/** Chrome only: kicker / title / rule. Never the expanded catalog. */
export const LOOKBACK_CATALOG_CHROME_HEIGHT = 112;
export const LOOKBACK_CATALOG_CHROME_HEIGHT_SHORT = 96;

export function lookbackCatalogChromeHeight(shortHeight: boolean): number {
  return shortHeight ? LOOKBACK_CATALOG_CHROME_HEIGHT_SHORT : LOOKBACK_CATALOG_CHROME_HEIGHT;
}

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
  return expanded ? tr("收起时间目录") : tr("打开时间目录");
}
