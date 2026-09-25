import { ApplicationError } from './errors';
import type { FamilyApiClient } from '../infrastructure/family-http-client';
import {
  createPendingFamilyOperationDisk,
  createPendingFamilyOperationStore,
  pendingAcceptOperationId,
  pendingCreateFamilyOperationId,
  pendingInviteFingerprint,
  type FamilyWriteCommand,
  type PendingFamilyOperationStore,
} from '../infrastructure/pending-family-operations';
import { fingerprintAcceptInvitation, fingerprintCreateFamily } from '../family-api/idempotency';
import type { FamilyMemberView, FamilyView, InvitationView } from '../family-api/types';

export type FamilySessionStore = {
  getSessionToken(): Promise<string | null>;
  getUserId(): Promise<string | null>;
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

export type InviteMemberOptions = {
  operationId?: string;
  intent?: 'new' | 'retry';
  idempotencyKey?: string;
};

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function newOperationId(prefix: string) {
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
    async getUserId() {
      return current?.userId ?? null;
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
  pending?: PendingFamilyOperationStore;
  idempotencyKey?: (prefix: string) => string;
  operationId?: (prefix: string) => string;
  clock?: { now: () => Date };
}) {
  const cache = deps.cache ?? createNoopFamilyCache();
  const pending = deps.pending ?? createPendingFamilyOperationStore(createPendingFamilyOperationDisk());
  const nextKey = deps.idempotencyKey ?? newIdempotencyKey;
  const nextOperationId = deps.operationId ?? newOperationId;
  const clock = deps.clock ?? { now: () => new Date() };

  function isUnconfirmedNetwork(error: ApplicationError) {
    return error.code === 'SERVER_UNREACHABLE' || error.code === 'NETWORK';
  }

  async function requireAccount() {
    const sessionToken = await deps.session.getSessionToken();
    const userId = await deps.session.getUserId();
    if (!sessionToken || !userId) {
      throw new ApplicationError('UNAUTHENTICATED', 'Sign in is required.');
    }
    return { sessionToken, userId };
  }

  async function withPending<T>(input: {
    command: FamilyWriteCommand;
    operationId: string;
    requestFingerprint: string;
    familyId?: string;
    idempotencyKey?: string;
    work: (key: string) => Promise<T>;
  }): Promise<T> {
    const { userId } = await requireAccount();
    const existing = await pending.find(userId, input.command, input.operationId);
    const idempotencyKey = existing?.idempotencyKey ?? input.idempotencyKey ?? nextKey(input.command);
    if (!existing) {
      await pending.save({
        command: input.command,
        requestFingerprint: input.requestFingerprint,
        operationId: input.operationId,
        idempotencyKey,
        userId,
        createdAt: clock.now().toISOString(),
        familyId: input.familyId,
      });
    }
    try {
      const result = await input.work(existing?.idempotencyKey ?? idempotencyKey);
      await pending.remove(userId, input.command, input.operationId);
      return result;
    } catch (error) {
      const appError = asApplicationError(error);
      if (!isUnconfirmedNetwork(appError)) {
        await pending.remove(userId, input.command, input.operationId);
      }
      throw appError;
    }
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
      const { sessionToken } = await requireAccount();
      return withPending({
        command: 'createFamily',
        operationId: pendingCreateFamilyOperationId(),
        requestFingerprint: fingerprintCreateFamily(),
        idempotencyKey,
        work: (key) => deps.client.createFamily(sessionToken, key),
      });
    },

    async inviteMember(familyId: string, options?: string | InviteMemberOptions): Promise<InvitationView> {
      const parsed: InviteMemberOptions = typeof options === 'string' ? { idempotencyKey: options } : options || {};
      const intent = parsed.intent ?? 'new';
      const { sessionToken, userId } = await requireAccount();
      let operationId = parsed.operationId;
      if (intent === 'retry') {
        if (!operationId) {
          throw new ApplicationError('PENDING_NOT_FOUND', 'Retrying an invite requires the pending operation id.');
        }
        const existing = await pending.find(userId, 'inviteMember', operationId);
        if (!existing || existing.familyId !== familyId) {
          throw new ApplicationError('PENDING_NOT_FOUND', 'No pending invite operation to retry.');
        }
      } else if (!operationId) {
        operationId = nextOperationId('invite');
      }
      return withPending({
        command: 'inviteMember',
        operationId,
        requestFingerprint: pendingInviteFingerprint(familyId, operationId),
        familyId,
        idempotencyKey: parsed.idempotencyKey,
        work: (key) => deps.client.inviteMember(sessionToken, familyId, key),
      });
    },

    async retryInviteMember(operationId: string): Promise<InvitationView> {
      const { sessionToken, userId } = await requireAccount();
      const existing = await pending.find(userId, 'inviteMember', operationId);
      if (!existing?.familyId) {
        throw new ApplicationError('PENDING_NOT_FOUND', 'No pending invite operation to retry.');
      }
      return withPending({
        command: 'inviteMember',
        operationId,
        requestFingerprint: existing.requestFingerprint,
        familyId: existing.familyId,
        work: (key) => deps.client.inviteMember(sessionToken, existing.familyId as string, key),
      });
    },

    async revokeInvitation(invitationId: string) {
      const { sessionToken } = await requireAccount();
      return deps.client.revokeInvitation(sessionToken, invitationId);
    },

    async acceptInvitation(code: string, idempotencyKey?: string) {
      const { sessionToken } = await requireAccount();
      return withPending({
        command: 'acceptInvitation',
        operationId: pendingAcceptOperationId(code),
        requestFingerprint: fingerprintAcceptInvitation(code),
        idempotencyKey,
        work: (key) => deps.client.acceptInvitation(sessionToken, code, key),
      });
    },

    async leaveFamily() {
      const { sessionToken } = await requireAccount();
      const result = await deps.client.leaveFamily(sessionToken);
      await cache.clear();
      return result;
    },

    async removeMember(familyId: string, userId: string) {
      const { sessionToken } = await requireAccount();
      return deps.client.removeMember(sessionToken, familyId, userId);
    },

    async dissolveFamily(familyId: string) {
      const { sessionToken } = await requireAccount();
      const result = await deps.client.dissolveFamily(sessionToken, familyId);
      await cache.clear();
      return result;
    },
  };
}

export type FamilyUseCases = ReturnType<typeof createFamilyUseCases>;

export function familyMembersOrEmpty(view: FamilyMembershipView): FamilyView['members'] {
  return view.kind === 'ready' ? view.members : [];
}
