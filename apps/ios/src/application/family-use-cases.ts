import { ApplicationError } from './errors';
import type { FamilyApiClient } from '../infrastructure/family-http-client';
import type { FamilyMemberView, FamilyView } from '../family-api/types';

export type FamilySessionStore = {
  getSessionToken(): Promise<string | null>;
  setSession(session: { userId: string; sessionToken: string }): Promise<void>;
  clearSession(): Promise<void>;
};

export type FamilyCache = {
  clear(): Promise<void>;
};

export type FamilyMembershipView =
  | { kind: 'unauthenticated' }
  | { kind: 'unconfirmed'; reason: 'unreachable' | 'unauthenticated' }
  | { kind: 'none' }
  | { kind: 'ready'; familyId: string; role: 'creator' | 'member'; members: FamilyMemberView[] };

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function asApplicationError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  if (error && typeof error === 'object' && 'code' in error) {
    return new ApplicationError(String((error as { code?: string }).code), error instanceof Error ? error.message : 'family failed');
  }
  return new ApplicationError('APPLICATION_FAILED', error instanceof Error ? error.message : 'family failed');
}

export function createMemoryFamilySessionStore(): FamilySessionStore {
  let current: { userId: string; sessionToken: string } | null = null;
  return {
    async getSessionToken() {
      return current?.sessionToken ?? null;
    },
    async setSession(session) {
      current = session;
    },
    async clearSession() {
      current = null;
    },
  };
}

export function createNoopFamilyCache(): FamilyCache {
  return {
    async clear() {
      return undefined;
    },
  };
}

export function createMemoryFamilyCache(): FamilyCache & { readonly clearCount: number } {
  let clearCount = 0;
  return {
    get clearCount() {
      return clearCount;
    },
    async clear() {
      clearCount += 1;
    },
  };
}

export function createFamilyUseCases(deps: {
  client: FamilyApiClient;
  session: FamilySessionStore;
  cache?: FamilyCache;
  idempotencyKey?: (prefix: string) => string;
}) {
  const cache = deps.cache ?? createNoopFamilyCache();
  const nextKey = deps.idempotencyKey ?? newIdempotencyKey;
  const pendingKeys = new Map<string, string>();

  function operationSlot(command: string, part?: string) {
    return part ? `${command}:${part}` : command;
  }

  function keyFor(command: string, part: string | undefined, explicit?: string) {
    if (explicit) return explicit;
    const slot = operationSlot(command, part);
    const existing = pendingKeys.get(slot);
    if (existing) return existing;
    const created = nextKey(command);
    pendingKeys.set(slot, created);
    return created;
  }

  function settle(command: string, part?: string) {
    pendingKeys.delete(operationSlot(command, part));
  }

  function isUnconfirmedNetwork(error: ApplicationError) {
    return error.code === 'SERVER_UNREACHABLE' || error.code === 'NETWORK';
  }

  async function withRetainedKey<T>(
    command: string,
    part: string | undefined,
    explicit: string | undefined,
    work: (key: string) => Promise<T>,
  ): Promise<T> {
    const key = keyFor(command, part, explicit);
    try {
      const result = await work(key);
      settle(command, part);
      return result;
    } catch (error) {
      const appError = asApplicationError(error);
      if (!isUnconfirmedNetwork(appError)) settle(command, part);
      throw appError;
    }
  }

  async function requireSession() {
    const token = await deps.session.getSessionToken();
    if (!token) {
      throw new ApplicationError('UNAUTHENTICATED', 'Sign in is required.');
    }
    return token;
  }

  return {
    async signInWithApple(identityToken: string) {
      try {
        const result = await deps.client.signInWithApple(identityToken);
        await deps.session.setSession({ userId: result.userId, sessionToken: result.sessionToken });
        return { userId: result.userId };
      } catch (error) {
        await deps.session.clearSession();
        throw asApplicationError(error);
      }
    },

    async getMembership(): Promise<FamilyMembershipView> {
      const token = await deps.session.getSessionToken();
      if (!token) return { kind: 'unauthenticated' };
      try {
        const listed = await deps.client.listMembership(token);
        if (!listed.family) {
          await cache.clear();
          return { kind: 'none' };
        }
        return {
          kind: 'ready',
          familyId: listed.family.familyId,
          role: listed.family.role,
          members: listed.family.members,
        };
      } catch (error) {
        const appError = asApplicationError(error);
        if (appError.code === 'UNAUTHENTICATED' || appError.code === 'APPLE_TOKEN_INVALID') {
          await deps.session.clearSession();
          await cache.clear();
          return { kind: 'unconfirmed', reason: 'unauthenticated' };
        }
        if (appError.code === 'SERVER_UNREACHABLE' || appError.code === 'NETWORK') {
          return { kind: 'unconfirmed', reason: 'unreachable' };
        }
        throw appError;
      }
    },

    async createFamily(idempotencyKey?: string) {
      const token = await requireSession();
      return withRetainedKey('createFamily', undefined, idempotencyKey, (key) =>
        deps.client.createFamily(token, key),
      );
    },

    async inviteMember(familyId: string, idempotencyKey?: string) {
      const token = await requireSession();
      return withRetainedKey('inviteMember', familyId, idempotencyKey, (key) =>
        deps.client.inviteMember(token, familyId, key),
      );
    },

    async revokeInvitation(invitationId: string) {
      const token = await requireSession();
      return deps.client.revokeInvitation(token, invitationId);
    },

    async acceptInvitation(code: string, idempotencyKey?: string) {
      const token = await requireSession();
      return withRetainedKey('acceptInvitation', code, idempotencyKey, (key) =>
        deps.client.acceptInvitation(token, code, key),
      );
    },

    async leaveFamily() {
      const token = await requireSession();
      const result = await deps.client.leaveFamily(token);
      await cache.clear();
      return result;
    },

    async removeMember(familyId: string, userId: string) {
      const token = await requireSession();
      return deps.client.removeMember(token, familyId, userId);
    },

    async dissolveFamily(familyId: string) {
      const token = await requireSession();
      const result = await deps.client.dissolveFamily(token, familyId);
      await cache.clear();
      return result;
    },
  };
}

export type FamilyUseCases = ReturnType<typeof createFamilyUseCases>;

export function familyMembersOrEmpty(view: FamilyMembershipView): FamilyView['members'] {
  return view.kind === 'ready' ? view.members : [];
}
