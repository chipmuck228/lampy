import { firstSearchParam } from './lookback-origin';

export const ALBUM_CREATE_COLLECT_PARAM = 'c';
export const ALBUM_CREATE_MOMENT_PARAM = 'm';

type CollectCreateIntent = {
  momentId: string;
};

const issuedIntents = new Map<string, CollectCreateIntent>();

export function resetAlbumCollectCreateIntentsForTests(): void {
  issuedIntents.clear();
}

export function issueAlbumCollectCreateIntent(momentId: string): string {
  const trimmed = momentId.trim();
  if (!trimmed) {
    throw new Error('collect-create intent requires momentId');
  }
  const token = `ac${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  issuedIntents.set(token, { momentId: trimmed });
  return token;
}

export function albumCollectCreateIntentWasIssued(
  token: string | string[] | undefined,
): boolean {
  const value = firstSearchParam(token);
  return !!value && issuedIntents.has(value);
}

export function peekAlbumCollectCreateMomentId(
  token: string | string[] | undefined,
  momentParam: string | string[] | undefined,
): string | null {
  const value = firstSearchParam(token);
  if (!value) return null;
  const intent = issuedIntents.get(value);
  if (!intent) return null;
  const momentId = firstSearchParam(momentParam)?.trim();
  if (!momentId || momentId !== intent.momentId) return null;
  return intent.momentId;
}

/** Consume after a finished create+collect (success or abandoned return). */
export function consumeAlbumCollectCreateIntent(
  token: string | string[] | undefined,
): CollectCreateIntent | null {
  const value = firstSearchParam(token);
  if (!value) return null;
  const intent = issuedIntents.get(value) ?? null;
  if (intent) issuedIntents.delete(value);
  return intent;
}

export function forgetAlbumCollectCreateIntent(
  token: string | string[] | undefined,
): void {
  const value = firstSearchParam(token);
  if (value) issuedIntents.delete(value);
}

export function albumCollectCreateHref(momentId: string): {
  pathname: '/albums/new';
  params: { m: string; c: string };
} {
  const token = issueAlbumCollectCreateIntent(momentId);
  return {
    pathname: '/albums/new',
    params: {
      m: momentId,
      c: token,
    },
  };
}

export function isMomentDetailStackRoute(route?: { name?: string }): boolean {
  const name = route?.name ?? '';
  return (
    name === 'moment/[id]' ||
    name === 'moment/[id].tsx' ||
    name === 'moment' ||
    /^moment\//.test(name)
  );
}

export function previousRouteIsMomentDetail(state?: {
  index?: number;
  routes?: { name?: string; params?: { id?: string | string[] } }[];
}, momentId?: string): boolean {
  if (!state || typeof state.index !== 'number' || state.index < 1) return false;
  const prev = state.routes?.[state.index - 1];
  if (!isMomentDetailStackRoute(prev)) return false;
  if (!momentId) return true;
  const prevId = firstSearchParam(prev?.params?.id);
  return !!prevId && prevId === momentId;
}

/**
 * Trusted return after collect-create: issued intent + matching prior moment route.
 * Never accepts an arbitrary return URL.
 */
export function shouldReturnToMomentAfterCollectCreate(input: {
  intentToken?: string | string[];
  momentId?: string;
  navigationState?: {
    index?: number;
    routes?: { name?: string; params?: { id?: string | string[] } }[];
  };
}): boolean {
  if (!albumCollectCreateIntentWasIssued(input.intentToken)) return false;
  const momentId = input.momentId?.trim();
  if (!momentId) return false;
  return previousRouteIsMomentDetail(input.navigationState, momentId);
}

export function finishCollectCreateToMoment(
  router: { back: () => void; dismissTo: (href: `/moment/${string}`) => void },
  input: { openedFromMoment: boolean; momentId: string },
): void {
  if (input.openedFromMoment) {
    router.back();
    return;
  }
  router.dismissTo(`/moment/${input.momentId}`);
}
