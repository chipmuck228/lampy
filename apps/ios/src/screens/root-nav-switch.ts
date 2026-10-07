/**
 * Root-tab switch contract (最近 / 回看 / 生活册)
 *
 * Destinations: `/` · `/lookback` · `/albums`
 *
 * 1. Switching among these three must not keep pushing copies of the same roots.
 *    Prefer `dismissTo(href)` so an existing root is popped to, not stacked again.
 * 2. Direct 最近 → 回看 keeps the existing origin-token + `push` path so `back()`
 *    can restore the recent reading position. Do not reuse that token for 生活册.
 * 3. 回看 → 最近 keeps `goToRecentFromLookbackRoot` (token + previous-route check,
 *    else `dismissTo('/')`). Never guess with `canGoBack()`.
 * 4. Any switch that leaves 回看 while the catalog is open must close the catalog
 *    first so no inert overlay remains.
 * 5. 生活册 list refreshes name/cover/count on focus; scroll Y is remembered in
 *    process memory when leaving and restored when possible.
 * 6. Collect mode still uses `lookbackParamsWithCollect`; returning to a manage
 *    page uses existing dismiss/back to that album — not this root switch helper.
 * 7. Device lock / private gate stays on the existing layout shell; root switches
 *    do not bypass authentication.
 */

export type RootNavDest = 'recent' | 'lookback' | 'albums';

export const ROOT_NAV_HREF = {
  recent: '/',
  lookback: '/lookback',
  albums: '/albums',
} as const;

export type RootNavRouter = {
  dismissTo: (href: '/' | '/lookback' | '/albums') => void;
};

export function shouldIgnoreRootNavPress(here: RootNavDest, dest: RootNavDest): boolean {
  return here === dest;
}

/** Switch to a root that is not 回看-from-最近 (that path stays origin-token aware). */
export function dismissToRootNav(router: RootNavRouter, dest: RootNavDest): void {
  router.dismissTo(ROOT_NAV_HREF[dest]);
}
