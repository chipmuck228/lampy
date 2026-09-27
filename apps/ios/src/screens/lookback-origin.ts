export const LOOKBACK_FROM_RECENT = 'recent';
export const LEAVE_FROM_RECENT = 'recent';
export const LEAVE_FROM_LOOKBACK = 'lookback';

export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function lookbackOpenedFromRecent(from: string | string[] | undefined): boolean {
  return firstSearchParam(from) === LOOKBACK_FROM_RECENT;
}

export function lookbackRootHref(fromRecent: boolean): '/lookback?from=recent' | '/lookback' {
  return fromRecent ? '/lookback?from=recent' : '/lookback';
}

export function leaveHref(from: 'recent' | 'lookback'): '/leave?from=recent' | '/leave?from=lookback' {
  return from === 'lookback' ? '/leave?from=lookback' : '/leave?from=recent';
}

export function leaveOpenedFromLookback(from: string | string[] | undefined): boolean {
  return firstSearchParam(from) === LEAVE_FROM_LOOKBACK;
}

export function goToRecentFromLookbackRoot(
  router: { back: () => void; dismissTo: (href: '/') => void },
  openedFromRecent: boolean,
): void {
  if (openedFromRecent) {
    router.back();
    return;
  }
  router.dismissTo('/');
}

export function finishLeaveToRecent(router: { dismissTo: (href: '/') => void }): void {
  router.dismissTo('/');
}
