export const LEAVE_FROM_RECENT = 'recent';
export const LEAVE_FROM_LOOKBACK = 'lookback';

const issuedOrigins = new Set<string>();
const issuedYearOrigins = new Set<string>();

export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function resetLookbackOriginsForTests(): void {
  issuedOrigins.clear();
  issuedYearOrigins.clear();
}

export function issueLookbackOrigin(): string {
  const token = `lb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  issuedOrigins.add(token);
  return token;
}

export function forgetLookbackOrigin(token: string | string[] | undefined): void {
  const value = firstSearchParam(token);
  if (value) issuedOrigins.delete(value);
}

export function lookbackOriginWasIssued(token: string | string[] | undefined): boolean {
  const value = firstSearchParam(token);
  return !!value && issuedOrigins.has(value);
}

export function lookbackRootHrefFromRecent(): `/lookback?o=${string}` {
  return `/lookback?o=${issueLookbackOrigin()}`;
}

export function isRecentStackRoute(route?: { name?: string }): boolean {
  const name = route?.name ?? '';
  return name === 'index' || name === '/' || name === 'index.tsx';
}

export function previousRouteIsRecent(state?: {
  index?: number;
  routes?: { name?: string }[];
}): boolean {
  if (!state || typeof state.index !== 'number' || state.index < 1) return false;
  return isRecentStackRoute(state.routes?.[state.index - 1]);
}

export function shouldBackToRecent(input: {
  originToken?: string | string[];
  navigationState?: { index?: number; routes?: { name?: string }[] };
}): boolean {
  return lookbackOriginWasIssued(input.originToken) && previousRouteIsRecent(input.navigationState);
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

export function issueLookbackYearOrigin(): string {
  const token = `ly${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  issuedYearOrigins.add(token);
  return token;
}

export function forgetLookbackYearOrigin(token: string | string[] | undefined): void {
  const value = firstSearchParam(token);
  if (value) issuedYearOrigins.delete(value);
}

export function lookbackYearOriginWasIssued(token: string | string[] | undefined): boolean {
  const value = firstSearchParam(token);
  return !!value && issuedYearOrigins.has(value);
}

export function lookbackYearHrefFromRoot(year: number): `/lookback/${number}?y=${string}` {
  return `/lookback/${year}?y=${issueLookbackYearOrigin()}`;
}

export function isLookbackRootStackRoute(route?: { name?: string }): boolean {
  const name = route?.name ?? '';
  return name === 'lookback/index' || name === 'lookback' || name === 'lookback/index.tsx';
}

export function previousRouteIsLookbackRoot(state?: {
  index?: number;
  routes?: { name?: string }[];
}): boolean {
  if (!state || typeof state.index !== 'number' || state.index < 1) return false;
  return isLookbackRootStackRoute(state.routes?.[state.index - 1]);
}

export function shouldBackToLookbackRoot(input: {
  originToken?: string | string[];
  navigationState?: { index?: number; routes?: { name?: string }[] };
}): boolean {
  return (
    lookbackYearOriginWasIssued(input.originToken) && previousRouteIsLookbackRoot(input.navigationState)
  );
}

export function goToLookbackRootFromYear(
  router: { back: () => void; dismissTo: (href: '/lookback') => void },
  openedFromLookbackRoot: boolean,
): void {
  if (openedFromLookbackRoot) {
    router.back();
    return;
  }
  router.dismissTo('/lookback');
}
