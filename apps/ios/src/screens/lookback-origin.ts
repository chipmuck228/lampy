export const LEAVE_FROM_RECENT = 'recent';
export const LEAVE_FROM_LOOKBACK = 'lookback';

const issuedOrigins = new Set<string>();
const issuedBookOrigins = new Set<string>();

export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function resetLookbackOriginsForTests(): void {
  issuedOrigins.clear();
  issuedBookOrigins.clear();
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

export function issueLookbackBookOrigin(): string {
  const token = `bk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  issuedBookOrigins.add(token);
  return token;
}

export function forgetLookbackBookOrigin(token: string | string[] | undefined): void {
  const value = firstSearchParam(token);
  if (value) issuedBookOrigins.delete(value);
}

export function lookbackBookOriginWasIssued(token: string | string[] | undefined): boolean {
  const value = firstSearchParam(token);
  return !!value && issuedBookOrigins.has(value);
}

export function lookbackDayHrefFromBook(
  year: number,
  month: number,
  day: number,
): `/lookback/${number}/${string}/${string}?b=${string}` {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `/lookback/${year}/${mm}/${dd}?b=${issueLookbackBookOrigin()}`;
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

export function shouldBackToLookbackBook(input: {
  originToken?: string | string[];
  navigationState?: { index?: number; routes?: { name?: string }[] };
}): boolean {
  return lookbackBookOriginWasIssued(input.originToken) && previousRouteIsLookbackRoot(input.navigationState);
}

export function goToLookbackBookFromDay(
  router: { back: () => void; dismissTo: (href: '/lookback') => void },
  openedFromBook: boolean,
): void {
  if (openedFromBook) {
    router.back();
    return;
  }
  router.dismissTo('/lookback');
}
