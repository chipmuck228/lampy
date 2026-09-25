import { ApplicationError } from './errors';
import type { FamilyApiClient } from '../infrastructure/family-http-client';
import {
  pendingAcceptOperationId,
  pendingCreateFamilyOperationId,
  pendingInviteFingerprint,
  pendingShareOperationId,
  type FamilyWriteCommand,
  type PendingFamilyOperationStore,
} from '../infrastructure/pending-family-operations';
import {
  canonicalizeShareSnapshot,
  fingerprintAcceptInvitation,
  fingerprintCreateFamily,
  fingerprintShareMoment,
} from '../family-api/idempotency';
import type { AssetRead, MomentRead } from '../infrastructure/repositories';
import type { ShareView } from '../family-api/types';
import { DEFAULT_SESSION_TTL_MS } from '../family-api/ids';
import type { FamilyMemberView, FamilyView, InvitationView, MediaObjectView } from '../family-api/types';

export type SharePreviewMedia = {
  assetId: string;
  objectId?: string;
  mimeType: string;
  ready: boolean;
};

export type SharePreview = {
  familyId: string;
  sourceMomentId: string;
  sourceRevision: number;
  note: string;
  emotion: string;
  occurredAt?: string;
  occurredAtPrecision: string;
  media: SharePreviewMedia[];
  canConfirm: boolean;
};

export type ShareConfirmState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'stored'; share: ShareView }
  | { status: 'failed'; code: string; message: string };

export type SelectedMediaUploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'stored'; object: MediaObjectView }
  | { status: 'failed'; code: string; message: string };

export type PendingSessionRevoke = {
  userId: string;
  sessionToken: string;
  createdAt: string;
};

export type SignOutResult =
  | { local: 'signed-out'; server: 'revoked' }
  | { local: 'signed-out'; server: 'unconfirmed' }
  | { local: 'still-signed-in'; server: 'unconfirmed' };

export type FamilySessionStore = {
  getSessionToken(): Promise<string | null>;
  getUserId(): Promise<string | null>;
  setSession(session: { userId: string; sessionToken: string }): Promise<void>;
  clearSession(): Promise<void>;
  getPendingRevoke(): Promise<PendingSessionRevoke | null>;
  savePendingRevoke(row: PendingSessionRevoke): Promise<void>;
  clearPendingRevoke(): Promise<void>;
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
  let pendingRevoke: PendingSessionRevoke | null = null;
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
    async getPendingRevoke() {
      return pendingRevoke;
    },
    async savePendingRevoke(row) {
      pendingRevoke = row;
    },
    async clearPendingRevoke() {
      pendingRevoke = null;
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
  pending: PendingFamilyOperationStore;
  cache?: FamilyCache;
  idempotencyKey?: (prefix: string) => string;
  operationId?: (prefix: string) => string;
  clock?: { now: () => Date };
  sessionRevokeTtlMs?: number;
  personal?: {
    moments: { findById(id: string): Promise<MomentRead> };
    assets: { findById(id: string): Promise<AssetRead> };
  };
}) {
  const cache = deps.cache ?? createNoopFamilyCache();
  const pending = deps.pending;
  const nextKey = deps.idempotencyKey ?? newIdempotencyKey;
  const nextOperationId = deps.operationId ?? newOperationId;
  const clock = deps.clock ?? { now: () => new Date() };
  const sessionRevokeTtlMs = deps.sessionRevokeTtlMs ?? DEFAULT_SESSION_TTL_MS;
  let selectedMediaUpload: SelectedMediaUploadState = { status: 'idle' };
  let shareConfirm: ShareConfirmState = { status: 'idle' };

  function isUnconfirmedNetwork(error: ApplicationError) {
    return error.code === 'SERVER_UNREACHABLE' || error.code === 'NETWORK';
  }

  function pendingRevokeExpired(row: PendingSessionRevoke) {
    const created = new Date(row.createdAt).getTime();
    return !Number.isFinite(created) || created + sessionRevokeTtlMs <= clock.now().getTime();
  }

  function isConfirmedTokenGone(error: ApplicationError) {
    return error.code === 'UNAUTHENTICATED';
  }

  async function flushPendingRevoke(): Promise<void> {
    const row = await deps.session.getPendingRevoke();
    if (!row) return;
    if (pendingRevokeExpired(row)) {
      await deps.session.clearPendingRevoke();
      return;
    }
    try {
      await deps.client.signOut(row.sessionToken);
      await deps.session.clearPendingRevoke();
    } catch (error) {
      const appError = asApplicationError(error);
      if (isConfirmedTokenGone(appError)) {
        await deps.session.clearPendingRevoke();
      }
    }
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
    if (existing && existing.requestFingerprint !== input.requestFingerprint) {
      throw new ApplicationError(
        'PENDING_CONFLICT',
        'This operation id is already bound to a different family request.',
      );
    }
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
        const pendingRow = await deps.session.getPendingRevoke();
        if (pendingRow?.userId === result.userId) {
          await deps.session.clearPendingRevoke();
        } else {
          await flushPendingRevoke();
        }
        await deps.session.setSession({ userId: result.userId, sessionToken: result.sessionToken });
        return { userId: result.userId };
      } catch (error) {
        await deps.session.clearSession();
        throw asApplicationError(error);
      }
    },

    async getMembership(): Promise<FamilyMembershipView> {
      await flushPendingRevoke();
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

    async listPendingInvitations(familyId: string) {
      const { sessionToken } = await requireAccount();
      return deps.client.listPendingInvitations(sessionToken, familyId);
    },

    async signOut(): Promise<SignOutResult> {
      const token = await deps.session.getSessionToken();
      const userId = await deps.session.getUserId();
      if (!token || !userId) {
        await deps.session.clearSession();
        await cache.clear();
        return { local: 'signed-out', server: 'revoked' };
      }
      try {
        await deps.client.signOut(token);
        await deps.session.clearSession();
        await cache.clear();
        await deps.session.clearPendingRevoke();
        selectedMediaUpload = { status: 'idle' };
        shareConfirm = { status: 'idle' };
        return { local: 'signed-out', server: 'revoked' };
      } catch (error) {
        const appError = asApplicationError(error);
        if (isConfirmedTokenGone(appError)) {
          await deps.session.clearSession();
          await cache.clear();
          await deps.session.clearPendingRevoke();
          return { local: 'signed-out', server: 'revoked' };
        }
        try {
          await deps.session.savePendingRevoke({
            userId,
            sessionToken: token,
            createdAt: clock.now().toISOString(),
          });
        } catch {
          return { local: 'still-signed-in', server: 'unconfirmed' };
        }
        await deps.session.clearSession();
        await cache.clear();
        return { local: 'signed-out', server: 'unconfirmed' };
      }
    },

    async hasUnconfirmedSessionRevoke() {
      const row = await deps.session.getPendingRevoke();
      return Boolean(row && !pendingRevokeExpired(row));
    },

    getSelectedMediaUploadStatus(): SelectedMediaUploadState {
      return selectedMediaUpload;
    },

    async uploadSelectedMedia(input: { bytes: Uint8Array; mimeType: string; idempotencyKey?: string }) {
      selectedMediaUpload = { status: 'uploading' };
      try {
        const { sessionToken } = await requireAccount();
        const object = await deps.client.uploadMedia(sessionToken, {
          bytes: input.bytes,
          mimeType: input.mimeType,
          idempotencyKey: input.idempotencyKey,
        });
        selectedMediaUpload = { status: 'stored', object };
        return selectedMediaUpload;
      } catch (error) {
        const appError = asApplicationError(error);
        selectedMediaUpload = { status: 'failed', code: appError.code, message: appError.message };
        return selectedMediaUpload;
      }
    },

    async getOwnedMedia(objectId: string) {
      const { sessionToken } = await requireAccount();
      return deps.client.getMediaObject(sessionToken, objectId);
    },

    async getOwnedMediaContent(objectId: string) {
      const { sessionToken } = await requireAccount();
      return deps.client.getMediaContent(sessionToken, objectId);
    },

    getShareConfirmStatus(): ShareConfirmState {
      return shareConfirm;
    },

    async prepareSharePreview(momentId: string, mediaByAsset?: Record<string, string>): Promise<SharePreview> {
      const membership = await this.getMembership();
      if (membership.kind === 'unauthenticated' || (membership.kind === 'unconfirmed' && membership.reason === 'unauthenticated')) {
        throw new ApplicationError('UNAUTHENTICATED', 'Sign in is required.');
      }
      if (membership.kind !== 'ready') {
        throw new ApplicationError('NOT_IN_FAMILY', 'Not a member of this family.');
      }
      if (!deps.personal) {
        throw new ApplicationError('MOMENT_NOT_FOUND', 'This moment is not on this device.');
      }
      const found = await deps.personal.moments.findById(momentId);
      if (found.kind !== 'ready' || found.moment.lifecycle.status !== 'active') {
        throw new ApplicationError('MOMENT_NOT_FOUND', 'This moment is not on this device.');
      }
      const media: SharePreviewMedia[] = [];
      for (const assetId of found.moment.assetIds) {
        const asset = await deps.personal.assets.findById(assetId);
        const objectId = mediaByAsset?.[assetId];
        media.push({
          assetId,
          objectId,
          mimeType: asset.kind === 'ready' ? asset.asset.metadata.mimeType || '' : '',
          ready: Boolean(objectId),
        });
      }
      return {
        familyId: membership.familyId,
        sourceMomentId: found.moment.id,
        sourceRevision: found.moment.revision,
        note: found.moment.content.note,
        emotion: found.moment.content.emotion,
        occurredAt: found.moment.time.occurredAt,
        occurredAtPrecision: found.moment.time.occurredAtPrecision,
        media,
        canConfirm: media.every((item) => item.ready),
      };
    },

    async confirmShareMoment(input: {
      momentId: string;
      sourceRevision: number;
      mediaByAsset?: Record<string, string>;
      idempotencyKey?: string;
    }) {
      shareConfirm = { status: 'confirming' };
      try {
        const preview = await this.prepareSharePreview(input.momentId, input.mediaByAsset);
        if (preview.sourceRevision !== input.sourceRevision) {
          throw new ApplicationError('CONFLICT', 'This moment changed. Confirm the current fields again.');
        }
        if (!preview.canConfirm) {
          throw new ApplicationError('SHARE_MEDIA_INCOMPLETE', 'Confirmed media is incomplete and will not be dropped.');
        }
        const { sessionToken } = await requireAccount();
        const mediaObjectIds = preview.media.map((item) => item.objectId).filter((id): id is string => Boolean(id));
        const snapshotCanonical = canonicalizeShareSnapshot({
          note: preview.note,
          emotion: preview.emotion,
          occurredAt: preview.occurredAt,
          occurredAtPrecision: preview.occurredAtPrecision,
          mediaObjectIds,
        });
        const result = await withPending({
          command: 'shareMoment',
          operationId: pendingShareOperationId(preview.sourceMomentId, preview.sourceRevision),
          requestFingerprint: fingerprintShareMoment({
            familyId: preview.familyId,
            sourceMomentId: preview.sourceMomentId,
            sourceRevision: preview.sourceRevision,
            snapshotCanonical,
          }),
          familyId: preview.familyId,
          idempotencyKey: input.idempotencyKey,
          work: (key) =>
            deps.client.shareMoment(sessionToken, preview.familyId, {
              sourceMomentId: preview.sourceMomentId,
              sourceRevision: preview.sourceRevision,
              note: preview.note,
              emotion: preview.emotion,
              occurredAt: preview.occurredAt,
              occurredAtPrecision: preview.occurredAtPrecision,
              mediaObjectIds,
              expectedMediaCount: preview.media.length,
              idempotencyKey: key,
            }),
        });
        shareConfirm = { status: 'stored', share: result };
        return shareConfirm;
      } catch (error) {
        const appError = asApplicationError(error);
        shareConfirm = { status: 'failed', code: appError.code, message: appError.message };
        return shareConfirm;
      }
    },

    async getOwnedShare(familyId: string, shareId: string) {
      const { sessionToken } = await requireAccount();
      return deps.client.getShare(sessionToken, familyId, shareId);
    },
  };
}

export type FamilyUseCases = ReturnType<typeof createFamilyUseCases>;

export function familyMembersOrEmpty(view: FamilyMembershipView): FamilyView['members'] {
  return view.kind === 'ready' ? view.members : [];
}
