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
import { sha256MediaBytes } from '../family-api/media-validate';
import type {
  FamilyCacheCleanup,
  FamilyReceiveCache,
  ReceivedShareRecord,
  ReceivedShareStatus,
} from '../infrastructure/family-receive-cache';
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

export type FamilyInboxItem = {
  shareId: string;
  familyId: string;
  snapshotRevision: number;
  note: string;
  emotion: string;
  occurredAt?: string;
  occurredAtPrecision: string;
  receiveStatus: ReceivedShareStatus;
  expectedMediaCount: number;
  storedMediaCount: number;
  canRevoke: boolean;
};

export type ShareRevokeState =
  | { status: 'idle' }
  | { status: 'revoking'; shareId: string }
  | { status: 'revoked'; shareId: string; revokedAt: string }
  | { status: 'failed'; shareId: string; code: string; message: string };

export type FamilyInboxView =
  | { kind: 'hidden'; reason: 'unauthenticated' | 'unconfirmed' | 'none' | 'unreachable' }
  | { kind: 'ready'; familyId: string; items: FamilyInboxItem[] };

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
    readAssetBytes?: (localUri: string) => Promise<Uint8Array>;
  };
  receiveCache?: FamilyReceiveCache;
}) {
  const cache = deps.cache ?? createNoopFamilyCache();
  const pending = deps.pending;
  const nextKey = deps.idempotencyKey ?? newIdempotencyKey;
  const nextOperationId = deps.operationId ?? newOperationId;
  const clock = deps.clock ?? { now: () => new Date() };
  const sessionRevokeTtlMs = deps.sessionRevokeTtlMs ?? DEFAULT_SESSION_TTL_MS;
  let selectedMediaUpload: SelectedMediaUploadState = { status: 'idle' };
  let shareConfirm: ShareConfirmState = { status: 'idle' };
  let shareRevoke: ShareRevokeState = { status: 'idle' };

  async function safeIsolateAccount(userId: string): Promise<FamilyCacheCleanup | undefined> {
    try {
      return await deps.receiveCache?.isolateAccount(userId);
    } catch {
      return undefined;
    }
  }

  async function safeIsolateShare(userId: string, familyId: string, shareId: string) {
    try {
      await deps.receiveCache?.isolateShare(userId, familyId, shareId);
    } catch {
      return undefined;
    }
  }

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

  async function loadPersonalMoment(momentId: string) {
    if (!deps.personal) {
      throw new ApplicationError('MOMENT_NOT_FOUND', 'This moment is not on this device.');
    }
    const found = await deps.personal.moments.findById(momentId);
    if (found.kind !== 'ready' || found.moment.lifecycle.status !== 'active') {
      throw new ApplicationError('MOMENT_NOT_FOUND', 'This moment is not on this device.');
    }
    return found.moment;
  }

  async function listPersonalShareMedia(
    assetIds: string[],
    mediaByAsset?: Record<string, string>,
  ): Promise<SharePreviewMedia[]> {
    const media: SharePreviewMedia[] = [];
    for (const assetId of assetIds) {
      const asset = deps.personal ? await deps.personal.assets.findById(assetId) : { kind: 'missing' as const };
      const objectId = mediaByAsset?.[assetId];
      const localUri = asset.kind === 'ready' ? asset.asset.localUri : '';
      let canReadLocal = false;
      if (localUri && deps.personal?.readAssetBytes) {
        try {
          const bytes = await deps.personal.readAssetBytes(localUri);
          canReadLocal = bytes.byteLength > 0;
        } catch {
          canReadLocal = false;
        }
      }
      media.push({
        assetId,
        objectId,
        mimeType: asset.kind === 'ready' ? asset.asset.metadata.mimeType || '' : '',
        ready: Boolean(objectId) || canReadLocal,
      });
    }
    return media;
  }

  async function resolvePersonalShareMedia(assetId: string, mediaByAsset?: Record<string, string>) {
    if (!deps.personal) {
      throw new ApplicationError('MOMENT_NOT_FOUND', 'This moment is not on this device.');
    }
    const mapped = mediaByAsset?.[assetId];
    if (mapped) return mapped;
    const asset = await deps.personal.assets.findById(assetId);
    if (asset.kind !== 'ready' || !asset.asset.localUri) {
      throw new ApplicationError('SHARE_MEDIA_INCOMPLETE', 'Confirmed media is incomplete and will not be dropped.');
    }
    if (!deps.personal.readAssetBytes) {
      throw new ApplicationError('SHARE_MEDIA_INCOMPLETE', 'Confirmed media is incomplete and will not be dropped.');
    }
    let bytes: Uint8Array;
    try {
      bytes = await deps.personal.readAssetBytes(asset.asset.localUri);
    } catch {
      throw new ApplicationError('SHARE_MEDIA_INCOMPLETE', 'Confirmed media is incomplete and will not be dropped.');
    }
    if (!bytes.byteLength) {
      throw new ApplicationError('SHARE_MEDIA_INCOMPLETE', 'Confirmed media is incomplete and will not be dropped.');
    }
    const uploaded = await uploadOwnedBytes(bytes, asset.asset.metadata.mimeType || '');
    return uploaded.objectId;
  }

  async function uploadOwnedBytes(bytes: Uint8Array, mimeType: string) {
    const { sessionToken } = await requireAccount();
    selectedMediaUpload = { status: 'uploading' };
    try {
      const object = await deps.client.uploadMedia(sessionToken, { bytes, mimeType });
      selectedMediaUpload = { status: 'stored', object };
      return object;
    } catch (error) {
      const appError = asApplicationError(error);
      selectedMediaUpload = { status: 'failed', code: appError.code, message: appError.message };
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
          const userId = await deps.session.getUserId();
          if (userId) await safeIsolateAccount(userId);
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
          const userId = await deps.session.getUserId();
          await deps.session.clearSession();
          await cache.clear();
          if (userId) await safeIsolateAccount(userId);
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
      const { sessionToken, userId } = await requireAccount();
      const result = await deps.client.leaveFamily(sessionToken);
      await cache.clear();
      const cleanup = await safeIsolateAccount(userId);
      return { ...result, cleanup };
    },

    async recoverFamilyCache() {
      if (!deps.receiveCache) return { hidden: true as const, diskCleared: true };
      return deps.receiveCache.recoverDisk();
    },

    async inspectFamilyReceiveCache() {
      if (!deps.receiveCache) return { pendingCount: 0, fileCount: 0 };
      return deps.receiveCache.inspectCache();
    },

    async removeMember(familyId: string, userId: string) {
      const { sessionToken } = await requireAccount();
      return deps.client.removeMember(sessionToken, familyId, userId);
    },

    async dissolveFamily(familyId: string) {
      const { sessionToken, userId } = await requireAccount();
      const result = await deps.client.dissolveFamily(sessionToken, familyId);
      await cache.clear();
      await safeIsolateAccount(userId);
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
        await safeIsolateAccount(userId);
        await deps.session.clearPendingRevoke();
        selectedMediaUpload = { status: 'idle' };
        shareConfirm = { status: 'idle' };
        shareRevoke = { status: 'idle' };
        return { local: 'signed-out', server: 'revoked' };
      } catch (error) {
        const appError = asApplicationError(error);
        if (isConfirmedTokenGone(appError)) {
          await deps.session.clearSession();
          await cache.clear();
          await safeIsolateAccount(userId);
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
        await safeIsolateAccount(userId);
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
      const moment = await loadPersonalMoment(momentId);
      const media = await listPersonalShareMedia(moment.assetIds, mediaByAsset);
      return {
        familyId: membership.familyId,
        sourceMomentId: moment.id,
        sourceRevision: moment.revision,
        note: moment.content.note,
        emotion: moment.content.emotion,
        occurredAt: moment.time.occurredAt,
        occurredAtPrecision: moment.time.occurredAtPrecision,
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
        const membership = await this.getMembership();
        if (membership.kind === 'unauthenticated' || (membership.kind === 'unconfirmed' && membership.reason === 'unauthenticated')) {
          throw new ApplicationError('UNAUTHENTICATED', 'Sign in is required.');
        }
        if (membership.kind !== 'ready') {
          throw new ApplicationError('NOT_IN_FAMILY', 'Not a member of this family.');
        }
        const moment = await loadPersonalMoment(input.momentId);
        if (moment.revision !== input.sourceRevision) {
          throw new ApplicationError('CONFLICT', 'This moment changed. Confirm the current fields again.');
        }
        const requiredAssetIds = [...moment.assetIds];
        const mediaObjectIds: string[] = [];
        for (const assetId of requiredAssetIds) {
          const objectId = await resolvePersonalShareMedia(assetId, input.mediaByAsset);
          mediaObjectIds.push(objectId);
        }
        if (mediaObjectIds.length !== requiredAssetIds.length) {
          throw new ApplicationError('SHARE_MEDIA_INCOMPLETE', 'Confirmed media is incomplete and will not be dropped.');
        }
        const { sessionToken } = await requireAccount();
        const snapshotCanonical = canonicalizeShareSnapshot({
          note: moment.content.note,
          emotion: moment.content.emotion,
          occurredAt: moment.time.occurredAt,
          occurredAtPrecision: moment.time.occurredAtPrecision,
          mediaObjectIds,
        });
        const result = await withPending({
          command: 'shareMoment',
          operationId: pendingShareOperationId(moment.id, moment.revision),
          requestFingerprint: fingerprintShareMoment({
            familyId: membership.familyId,
            sourceMomentId: moment.id,
            sourceRevision: moment.revision,
            snapshotCanonical,
          }),
          familyId: membership.familyId,
          idempotencyKey: input.idempotencyKey,
          work: (key) =>
            deps.client.shareMoment(sessionToken, membership.familyId, {
              sourceMomentId: moment.id,
              sourceRevision: moment.revision,
              note: moment.content.note,
              emotion: moment.content.emotion,
              occurredAt: moment.time.occurredAt,
              occurredAtPrecision: moment.time.occurredAtPrecision,
              mediaObjectIds,
              expectedMediaCount: requiredAssetIds.length,
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

    getShareRevokeStatus(): ShareRevokeState {
      return shareRevoke;
    },

    async revokeShare(shareId: string): Promise<ShareRevokeState> {
      shareRevoke = { status: 'revoking', shareId };
      try {
        const membership = await this.getMembership();
        if (membership.kind === 'unauthenticated' || (membership.kind === 'unconfirmed' && membership.reason === 'unauthenticated')) {
          throw new ApplicationError('UNAUTHENTICATED', 'Sign in is required.');
        }
        if (membership.kind !== 'ready') {
          throw new ApplicationError('NOT_IN_FAMILY', 'Not a member of this family.');
        }
        const { sessionToken, userId } = await requireAccount();
        const result = await deps.client.revokeShare(sessionToken, membership.familyId, shareId);
        await safeIsolateShare(userId, membership.familyId, shareId);
        shareRevoke = { status: 'revoked', shareId, revokedAt: result.revokedAt };
        return shareRevoke;
      } catch (error) {
        const appError = asApplicationError(error);
        shareRevoke = { status: 'failed', shareId, code: appError.code, message: appError.message };
        return shareRevoke;
      }
    },

    async listFamilyInbox(): Promise<FamilyInboxView> {
      return this.refreshFamilyInbox();
    },

    async refreshFamilyInbox(): Promise<FamilyInboxView> {
      const membership = await this.getMembership();
      if (membership.kind !== 'ready') {
        if (membership.kind === 'none' || membership.kind === 'unauthenticated') {
          const userId = await deps.session.getUserId();
          if (userId) await safeIsolateAccount(userId);
        }
        return hiddenInbox(membership) ?? { kind: 'hidden', reason: 'unconfirmed' };
      }
      try {
        const { sessionToken, userId } = await requireAccount();
        const listed = await deps.client.listVisibleShares(sessionToken, membership.familyId);
        const allowed = new Set(listed.shares.map((share) => share.shareId));
        if (deps.receiveCache) {
          await deps.receiveCache.replaceVisible(userId, membership.familyId, listed.shares);
        }
        const rows = deps.receiveCache
          ? (await deps.receiveCache.list(userId, membership.familyId)).filter((row) => allowed.has(row.shareId))
          : [];
        return {
          kind: 'ready',
          familyId: membership.familyId,
          items: await Promise.all(rows.map((row) => toInboxItem(row, userId))),
        };
      } catch (error) {
        const appError = asApplicationError(error);
        if (appError.code === 'UNAUTHENTICATED') {
          const userId = await deps.session.getUserId();
          if (userId) await safeIsolateAccount(userId);
          return { kind: 'hidden', reason: 'unauthenticated' };
        }
        if (appError.code === 'NOT_IN_FAMILY') {
          const userId = await deps.session.getUserId();
          if (userId) await safeIsolateAccount(userId);
          return { kind: 'hidden', reason: 'none' };
        }
        return { kind: 'hidden', reason: 'unreachable' };
      }
    },

    async receiveShare(shareId: string) {
      const membership = await this.getMembership();
      if (membership.kind !== 'ready') {
        throw new ApplicationError('NOT_IN_FAMILY', 'Not a member of this family.');
      }
      if (!deps.receiveCache) {
        throw new ApplicationError('SHARE_NOT_FOUND', 'Family cache is not available.');
      }
      const { sessionToken, userId } = await requireAccount();
      const share = await deps.client.getShare(sessionToken, membership.familyId, shareId);
      await deps.receiveCache.beginReceive(userId, share);
      try {
        for (const item of share.snapshot.media) {
          const existing = (await deps.receiveCache.listMedia(userId, share.familyId, share.shareId)).find(
            (row) => row.objectId === item.objectId && row.status === 'stored',
          );
          if (existing) {
            const storedBytes = await deps.receiveCache.readMediaBytes(existing.storageKey);
            if (
              storedBytes.length === existing.byteLength &&
              sha256MediaBytes(storedBytes) === existing.contentSha256
            ) {
              continue;
            }
          }
          const meta = await deps.client.getShareMedia(sessionToken, share.familyId, share.shareId, item.objectId);
          const content = await deps.client.getShareMediaContent(
            sessionToken,
            share.familyId,
            share.shareId,
            item.objectId,
          );
          if (
            content.bytes.length !== meta.byteLength ||
            sha256MediaBytes(content.bytes) !== meta.contentSha256
          ) {
            throw new ApplicationError('SHARE_MEDIA_UNAVAILABLE', 'A selected media object is not available.');
          }
          await deps.receiveCache.saveStoredMedia({
            userId,
            familyId: share.familyId,
            shareId: share.shareId,
            objectId: item.objectId,
            mimeType: meta.mimeType,
            byteLength: meta.byteLength,
            contentSha256: meta.contentSha256,
            storageKey: `${userId}/${share.familyId}/${share.shareId}/${item.objectId}`,
            bytes: content.bytes,
          });
        }
        const stored = (await deps.receiveCache.listMedia(userId, share.familyId, share.shareId)).filter(
          (row) => row.status === 'stored',
        );
        if (stored.length !== share.snapshot.media.length) {
          throw new ApplicationError('SHARE_MEDIA_INCOMPLETE', 'Confirmed media is incomplete and will not be dropped.');
        }
        const received = await deps.receiveCache.markReceived(userId, share.familyId, share.shareId);
        return { status: 'received' as const, item: await toInboxItem(received, userId) };
      } catch (error) {
        const appError = asApplicationError(error);
        if (appError.code === 'SHARE_NOT_FOUND' || appError.code === 'FORBIDDEN') {
          await safeIsolateShare(userId, membership.familyId, shareId);
        } else {
          await deps.receiveCache.markFailed(userId, share.familyId, share.shareId);
        }
        throw appError;
      }
    },
  };

  async function toInboxItem(row: ReceivedShareRecord, viewerUserId: string): Promise<FamilyInboxItem> {
    const media = deps.receiveCache ? await deps.receiveCache.listMedia(row.userId, row.familyId, row.shareId) : [];
    return {
      shareId: row.shareId,
      familyId: row.familyId,
      snapshotRevision: row.snapshotRevision,
      note: row.snapshot.note,
      emotion: row.snapshot.emotion,
      occurredAt: row.snapshot.occurredAt,
      occurredAtPrecision: row.snapshot.occurredAtPrecision,
      receiveStatus: row.receiveStatus,
      expectedMediaCount: row.expectedMediaCount,
      storedMediaCount: media.filter((item) => item.status === 'stored').length,
      canRevoke: row.authorUserId === viewerUserId,
    };
  }
}

function hiddenInbox(membership: FamilyMembershipView): Extract<FamilyInboxView, { kind: 'hidden' }> | null {
  if (membership.kind === 'unauthenticated') return { kind: 'hidden', reason: 'unauthenticated' };
  if (membership.kind === 'none') return { kind: 'hidden', reason: 'none' };
  if (membership.kind === 'unconfirmed') {
    return { kind: 'hidden', reason: membership.reason === 'unreachable' ? 'unreachable' : 'unconfirmed' };
  }
  return null;
}

export type FamilyUseCases = ReturnType<typeof createFamilyUseCases>;

export function familyMembersOrEmpty(view: FamilyMembershipView): FamilyView['members'] {
  return view.kind === 'ready' ? view.members : [];
}
