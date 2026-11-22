import {normalizeEmail} from '../family-api/email-normalize';
import type {EmailCodeRequest,EmailCodeVerification,EmailCodeStatus} from '../family-api/email-code-types';
import {readFamilyAccount} from './family-account-scope';
import { prepareFamilyShareMedia } from './prepare-family-share-media';
import {createFamilySafetyUseCases} from './family-safety-use-cases';
import { familyReceivedMediaKey } from '../infrastructure/family-receive-cache';
import { createFamilyAlbumUseCases } from './family-album';
import { createFamilyHistoryUseCases } from './family-history-use-cases';
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
import { sha256MediaBytes } from '../family-api/media-validate';
import type {
  FamilyCacheCleanup,
  FamilyReceiveCache,
  ReceivedShareRecord,
  ReceivedShareStatus,
} from '../infrastructure/family-receive-cache';
import { DEFAULT_SESSION_TTL_MS } from '../family-api/ids';
import type {
  FamilyMemberView,
  FamilyListView,
  FamilySummary,
  FamilyView,
  InvitationView,
  MediaObjectView,
  ShareView,
} from '../family-api/types';

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
  getSession?():Promise<{userId:string;sessionToken:string}|null>;
  getRevision?():number;
  subscribe?(listener:()=>void):()=>void;
  getSessionToken(): Promise<string | null>;
  getUserId(): Promise<string | null>;
  setSession(session: { userId: string; sessionToken: string }): Promise<void>;
  clearSession(): Promise<void>;
  getPendingRevoke(): Promise<PendingSessionRevoke | null>;
  savePendingRevoke(row: PendingSessionRevoke): Promise<void>;
  clearPendingRevoke(expectedToken?:string): Promise<void>;
};

export type FamilyCache = {
  clear(): Promise<void>;
};

export type FamilyMembershipView =
  | { kind: 'unauthenticated' }
  | { kind: 'unconfirmed'; reason: 'unreachable' | 'unauthenticated' }
  | { kind: 'none' }
  | { kind: 'selection-required' }
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
  let revision=0;
  const listeners=new Set<()=>void>();
  function changed(){revision++;for(const listener of listeners)listener();}
  return {
    async getSession(){return current?{...current}:null;},
    getRevision:()=>revision,
    subscribe(listener){listeners.add(listener);return ()=>{listeners.delete(listener);};},
    async getSessionToken() {
      return current?.sessionToken ?? null;
    },
    async getUserId() {
      return current?.userId ?? null;
    },
    async setSession(session) {
      current = {...session};
      changed();
    },
    async clearSession() {
      current = null;
      changed();
    },
    async getPendingRevoke() {
      return pendingRevoke;
    },
    async savePendingRevoke(row) {
      pendingRevoke = row;
    },
    async clearPendingRevoke(expectedToken) {
      if(expectedToken && pendingRevoke?.sessionToken!==expectedToken)return;
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
  convertImageForShare?: (bytes: Uint8Array, mimeType: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;
  };
  receiveCache?: FamilyReceiveCache;
  mediaUri?: (storageKey: string) => string;
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
  deps.session.subscribe?.(() => {
    selectedMediaUpload = {status:'idle'};
    shareConfirm = {status:'idle'};
    shareRevoke = {status:'idle'};
  });

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
      await deps.session.clearPendingRevoke(row.sessionToken);
      return;
    }
    try {
      await deps.client.signOut(row.sessionToken);
      await deps.session.clearPendingRevoke(row.sessionToken);
    } catch (error) {
      const appError = asApplicationError(error);
      if (isConfirmedTokenGone(appError)) {
        await deps.session.clearPendingRevoke(row.sessionToken);
      }
    }
  }

  async function requireAccount() {return readFamilyAccount(deps.session);}

  async function withPending<T>(input: {
    expectedSessionToken: string;
    command: FamilyWriteCommand;
    operationId: string;
    requestFingerprint: string;
    familyId?: string;
    idempotencyKey?: string;
    work: (key: string) => Promise<T>;
  }): Promise<T> {
    const owner=await requireAccount();
    if(owner.sessionToken!==input.expectedSessionToken)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
    const {userId}=owner;
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
      await assertSameAccount(owner);
      const result = await input.work(existing?.idempotencyKey ?? idempotencyKey);
      await assertSameAccount(owner);
      await pending.remove(userId, input.command, input.operationId);
      return result;
    } catch (error) {
      const appError = asApplicationError(error);
      if (!isUnconfirmedNetwork(appError) && appError.code !== 'STALE_FAMILY_REQUEST') {
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

  async function resolvePersonalShareMedia(owner:Awaited<ReturnType<typeof requireAccount>>, assetId: string, mediaByAsset?: Record<string, string>) {
    if (!deps.personal) {
      throw new ApplicationError('MOMENT_NOT_FOUND', 'This moment is not on this device.');
    }
    await assertSameAccount(owner);
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
    const uploaded = await uploadOwnedBytes(owner, bytes, asset.asset.metadata.mimeType || '');
    return uploaded.objectId;
  }

  async function uploadOwnedBytes(owner:Awaited<ReturnType<typeof requireAccount>>,bytes: Uint8Array, mimeType: string) {
    await assertSameAccount(owner);
    const { sessionToken } = owner;
    selectedMediaUpload = { status: 'uploading' };
    try {
      const outgoing = await prepareFamilyShareMedia(bytes, mimeType, deps.personal?.convertImageForShare);
      await assertSameAccount(owner);
      const object = await deps.client.uploadMedia(sessionToken, outgoing);
      await assertSameAccount(owner);
      selectedMediaUpload = { status: 'stored', object };
      return object;
    } catch (error) {
      const appError = asApplicationError(error);
      if (appError.code !== 'STALE_FAMILY_REQUEST') selectedMediaUpload = { status: 'failed', code: appError.code, message: appError.message };
      throw appError;
    }
  }

  async function performSignOut():Promise<SignOutResult> {
      const token = await deps.session.getSessionToken();
      const userId = await deps.session.getUserId();
      if (!token || !userId) {
        await deps.session.clearSession();
        await cache.clear();
        return { local: 'signed-out', server: 'revoked' };
      }
      const owner=await requireAccount();
      if(owner.sessionToken!==token||owner.userId!==userId)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
      try {
        await deps.client.signOut(token);
        await assertSameAccount(owner);
        await deps.session.clearSession();
        await cache.clear();
        await safeIsolateAccount(userId);
        await deps.session.clearPendingRevoke();
        selectedMediaUpload = { status: 'idle' };
        shareConfirm = { status: 'idle' };
        shareRevoke = { status: 'idle' };
        return { local: 'signed-out', server: 'revoked' };
      } catch (error) {
        if(await deps.session.getSessionToken()!==token)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
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

  }

  let identityCommit: Promise<unknown> = Promise.resolve();
  function commitSignedIn(result: { userId: string; sessionToken: string }, isCurrent: () => boolean = () => true) {
    const work = () => performSignedIn(result, isCurrent);
    const next = identityCommit.then(work,work);
    identityCommit = next.then(() => undefined, () => undefined);
    return next;
  }
  async function performSignedIn(result: { userId: string; sessionToken: string }, isCurrent: () => boolean = () => true) {
    const check = () => { if (!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST', 'Identity screen is inactive.'); };
    check();
    const previousUserId = await deps.session.getUserId();
    check();
    const pendingRow = await deps.session.getPendingRevoke();
    check();
    if (pendingRow?.userId === result.userId) {
      await deps.session.clearPendingRevoke();
    } else {
      await flushPendingRevoke();
    }
    check();
    if (previousUserId && previousUserId !== result.userId) {
      await cache.clear();
      check();
      await safeIsolateAccount(previousUserId);
    }
    check();
    try {
      await deps.session.setSession({ userId: result.userId, sessionToken: result.sessionToken });
      check();
      await safeIsolateAccount(result.userId);
      check();
      return { userId: result.userId };
    } catch (error) {
      // Still inside the identity commit queue: a newer sign-in cannot be cleared here.
      if (!isCurrent() && await deps.session.getSessionToken() === result.sessionToken) await deps.session.clearSession();
      throw error;
    }
  }

  async function assertSameAccount(account: { userId: string; sessionToken: string; revision?: number }) {
    if (account.revision !== undefined && account.revision !== deps.session.getRevision?.()) throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
    if (await deps.session.getSessionToken() !== account.sessionToken || await deps.session.getUserId() !== account.userId) {
      throw new ApplicationError('STALE_FAMILY_REQUEST', 'The account changed during this request.');
    }
  }

  async function purchaseRequest<T>(work:(api:NonNullable<FamilyApiClient['purchases']>,token:string)=>Promise<T>,isCurrent=()=>true) {
    const a=await requireAccount();
    if(!isCurrent())throw new ApplicationError('STALE_FAMILY_REQUEST','Purchase screen is inactive.');
    if(!deps.client.purchases)throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
    const result=await work(deps.client.purchases,a.sessionToken);await assertSameAccount(a);
    if(!isCurrent())throw new ApplicationError('STALE_FAMILY_REQUEST','Purchase screen is inactive.');
    return result;
  }
  const history = createFamilyHistoryUseCases(deps);
  let directoryRequest = 0;
  let emailAuthRequest = 0;
  const emailTickets=new Map<string,{email:string;intent:EmailCodeRequest['intent'];token:string|null;userId:string|null;revision:number|undefined}>();
  async function controlledEmailAuth(input: { email: string; password: string; nickname?: string }, register: boolean, isCurrent: () => boolean) {
    const request = ++emailAuthRequest;
    const initialToken = await deps.session.getSessionToken();
    const eligible = () => request === emailAuthRequest && isCurrent();
    if (!eligible()) throw new ApplicationError('STALE_FAMILY_REQUEST','Identity screen is inactive.');
    const method = register ? deps.client.registerControlledEmail : deps.client.signInWithControlledEmail;
    if (!method) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
    const result = register
      ? await deps.client.registerControlledEmail!({email:input.email,password:input.password,nickname:input.nickname || ''})
      : await deps.client.signInWithControlledEmail!({email:input.email,password:input.password});
    try {
      if (!eligible() || await deps.session.getSessionToken() !== initialToken) throw new ApplicationError('STALE_FAMILY_REQUEST','Identity changed during sign-in.');
      return await commitSignedIn(result, eligible);
    } catch (error) {
      // Revoke only the new, discarded session, never another device/account's session.
      try { await deps.client.signOut(result.sessionToken); } catch { /* expires server-side if offline */ }
      throw asApplicationError(error);
    }
  }
  return {
    purchaseAccountContext:(current?:()=>boolean)=>purchaseRequest((api,token)=>api.context(token),current),
    claimPurchase:(transactionId:string,current?:()=>boolean)=>purchaseRequest((api,token)=>api.claim(token,transactionId),current),
    familyPurchaseAccess:(familyId:string,current?:()=>boolean)=>purchaseRequest((api,token)=>api.familyAccess(token,familyId),current),
    unlockFamilyPurchase:(familyId:string,current?:()=>boolean)=>purchaseRequest((api,token)=>api.unlockFamily(token,familyId),current),
    async assertPurchaseAccount(userId:string) {if((await requireAccount()).userId!==userId)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');},
    albums: createFamilyAlbumUseCases({client:deps.client,session:deps.session}),
    history,
    safety: createFamilySafetyUseCases({client:deps.client,session:deps.session,clearCache:history.clearSafetyCache}),
    async previewInviteLink(token: string) {
      if(!deps.client.previewInviteLink) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      return deps.client.previewInviteLink(token);
    },
    async inviteLinkAccount() { return (await requireAccount()).userId; },
    async createInviteLink(familyId: string, isCurrent: () => boolean) {
      const a=await requireAccount();await assertSameAccount(a);
      if(!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Invitation screen is inactive.');
      if(!deps.client.createInviteLink) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const result=await deps.client.createInviteLink(a.sessionToken,familyId);await assertSameAccount(a);
      if(!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Invitation screen is inactive.');
      return result;
    },
    async listInviteLinks(familyId: string) {
      const a=await requireAccount();if(!deps.client.listInviteLinks) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const result=await deps.client.listInviteLinks(a.sessionToken,familyId);await assertSameAccount(a);return result;
    },
    async revokeInviteLink(id: string, isCurrent: () => boolean) {
      const a=await requireAccount();if(!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Invitation screen is inactive.');
      if(!deps.client.revokeInviteLink) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const result=await deps.client.revokeInviteLink(a.sessionToken,id);await assertSameAccount(a);
      if(!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Invitation screen is inactive.');return result;
    },
    async acceptInviteLink(token: string, expectedUserId: string, isCurrent: () => boolean) {
      const a=await requireAccount();await assertSameAccount(a);
      if(a.userId!==expectedUserId || !isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Confirm with the current account.');
      if(!deps.client.acceptInviteLink) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const result=await deps.client.acceptInviteLink(a.sessionToken,token);await assertSameAccount(a);
      if(!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Invitation screen is inactive.');return result;
    },
    async getFamilies(isCurrent: () => boolean = () => true, onStage?: (stage:string)=>void): Promise<FamilyListView & { userId: string }> {
      const request = ++directoryRequest;
      const current = () => isCurrent() && request === directoryRequest;
      onStage?.('DIRECTORY_REVOKE');await flushPendingRevoke();
      onStage?.('DIRECTORY_ACCOUNT');const account = await requireAccount();
      if (!current()) throw new ApplicationError('STALE_FAMILY_REQUEST', 'Directory request is inactive.');
      if (!deps.client.listFamilies) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED', 'Family service must be upgraded.');
      try {
        onStage?.('DIRECTORY_HTTP');const result = await deps.client.listFamilies(account.sessionToken);
        onStage?.('DIRECTORY_ACCOUNT_CHECK');await assertSameAccount(account);
        if (!current()) throw new ApplicationError('STALE_FAMILY_REQUEST', 'Directory request is inactive.');
        onStage?.('DIRECTORY_CACHE');await history.reconcileFamilies(account.userId, result.families.map(f => f.familyId), current);
        onStage?.('DIRECTORY_READY');return { ...result, userId: account.userId };
      } catch (error) {
        await assertSameAccount(account);
        const appError = asApplicationError(error);
        if (appError.code === 'UNAUTHENTICATED') {
          await deps.session.clearSession();
          await cache.clear();
          await safeIsolateAccount(account.userId);
        }
        throw appError;
      }
    },
    async createNamedFamily(name: string, operationId: string, isCurrent: () => boolean = () => true): Promise<FamilySummary> {
      if (!operationId || operationId.length > 100) throw new ApplicationError('BAD_REQUEST', 'A bounded operation id is required.');
      const account = await requireAccount();
      const assertCurrent = async () => {
        await assertSameAccount(account);
        if (!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST', 'The creation screen is no longer active.');
      };
      await assertCurrent();
      if (!deps.client.createNamedFamily) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED', 'Family service must be upgraded.');
      const id = `named:${operationId}`;
      const requestFingerprint = JSON.stringify({ version: 2, name: name.trim() });
      const existing = await pending.find(account.userId, 'createFamily', id);
      await assertCurrent();
      if (existing && existing.requestFingerprint !== requestFingerprint) throw new ApplicationError('PENDING_CONFLICT', 'Retry the same family name.');
      const key = existing?.idempotencyKey ?? `named:${operationId}`;
      if (!existing) await pending.save({ userId: account.userId, command: 'createFamily', operationId: id,
        requestFingerprint, idempotencyKey: key, createdAt: clock.now().toISOString() });
      await assertCurrent();
      try {
        const result = await deps.client.createNamedFamily(account.sessionToken, name, key);
        await assertCurrent();
        await pending.remove(account.userId, 'createFamily', id);
        await assertCurrent();
        return result;
      } catch (error) {
        await assertCurrent();
        const appError = asApplicationError(error);
        if (!isUnconfirmedNetwork(appError)) await pending.remove(account.userId, 'createFamily', id);
        throw appError;
      }
    },
    async getControlledEmailAvailability() { return deps.client.health(); },
    async getAuthHealth() {
      try {
        return await deps.client.health();
      } catch (error) {
        const appError = asApplicationError(error);
        if (appError.code === 'SERVER_UNREACHABLE' || appError.code === 'NETWORK') {
          return {
            ok: true as const,
            slice: 'identity-membership' as const,
            media: true as const,
            shares: true as const,
            inbox: true as const,
            testAccountLogin: false,
            testAccountLoginReason: 'disabled' as const,
            argon2id: { t: 2, m: 19_456, p: 1, dkLen: 32 },
          };
        }
        throw appError;
      }
    },
    async registerControlledEmail(input: { email: string; password: string; nickname: string }, isCurrent: () => boolean) {
      return controlledEmailAuth(input, true, isCurrent);
    },
    async signInWithControlledEmail(input: { email: string; password: string }, isCurrent: () => boolean) {
      return controlledEmailAuth(input, false, isCurrent);
    },
    async finishEmailProfile(nickname:string,expectedUserId:string,isCurrent:()=>boolean) {
      const owner=await requireAccount();if(owner.userId!==expectedUserId||!isCurrent())throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
      if(!deps.client.updateMyProfile)throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const result=await deps.client.updateMyProfile(owner.sessionToken,nickname);await assertSameAccount(owner);
      if(!isCurrent())throw new ApplicationError('STALE_FAMILY_REQUEST','Page changed.');return result;
    },
    async signOutEmailAccount(expectedUserId:string) {
      emailAuthRequest++;
      const work=async()=>{const owner=await requireAccount();if(owner.userId!==expectedUserId)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');return performSignOut();};
      const next=identityCommit.then(work,work);identityCommit=next.then(()=>undefined,()=>undefined);return next;
    },
    async getEmailCodeAvailability(){const health=await deps.client.health();return health.emailCodeLogin===true;},
    async getEmailCodeAccount():Promise<EmailCodeStatus & {userId?:string}> {
      const token=await deps.session.getSessionToken();if(!token)return {signedIn:false,linked:false};
      const owner=await requireAccount();
      if(!deps.client.emailCodeStatus)throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      try {const result=await deps.client.emailCodeStatus(owner.sessionToken);await assertSameAccount(owner);return {...result,userId:owner.userId};}
      catch(error){await assertSameAccount(owner);const e=asApplicationError(error);if(e.code!=='UNAUTHENTICATED')throw e;
        await deps.session.clearSession();await cache.clear();await safeIsolateAccount(owner.userId);return {signedIn:false,linked:false};}
    },
    async requestEmailCode(input:EmailCodeRequest,isCurrent:()=>boolean,expectedUserId?:string|null) {
      const request=++emailAuthRequest;const revision=deps.session.getRevision?.();
      const snapshot=deps.session.getSession?await deps.session.getSession():{userId:await deps.session.getUserId(),sessionToken:await deps.session.getSessionToken()};
      if(expectedUserId!==undefined&&(snapshot?.userId??null)!==expectedUserId)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
      const issued={email:normalizeEmail(input.email),intent:input.intent,token:snapshot?.sessionToken??null,userId:snapshot?.userId??null,revision};
      const check=async()=>{if(!isCurrent()||request!==emailAuthRequest||revision!==deps.session.getRevision?.()||await deps.session.getSessionToken()!==issued.token)throw new ApplicationError('STALE_FAMILY_REQUEST','Email request is inactive.');};
      await check();if(input.intent!=='login'&&!issued.token)throw new ApplicationError('UNAUTHENTICATED','Sign in first.');
      if(!deps.client.requestEmailCode)throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const ticket=await deps.client.requestEmailCode({...input,email:issued.email},input.intent==='login'?undefined:issued.token!);
      await check();emailTickets.clear();emailTickets.set(ticket.challengeId,issued);return ticket;
    },
    async verifyEmailCode(input:EmailCodeVerification,isCurrent:()=>boolean) {
      const request=++emailAuthRequest;const issued=emailTickets.get(input.challengeId);
      if(!issued||issued.email!==normalizeEmail(input.email)||issued.intent!==input.intent)throw new ApplicationError('EMAIL_CODE_INVALID','Request a new code.');
      const eligible=()=>request===emailAuthRequest&&isCurrent();
      const same=async()=>{if(issued.revision!==deps.session.getRevision?.()||await deps.session.getSessionToken()!==issued.token||await deps.session.getUserId()!==issued.userId)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');};
      await same();if(!eligible())throw new ApplicationError('STALE_FAMILY_REQUEST','Email request is inactive.');
      if(!deps.client.verifyEmailCode)throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const result=await deps.client.verifyEmailCode({...input,email:issued.email},issued.intent==='login'?undefined:issued.token!);
      emailTickets.delete(input.challengeId);
      if('sessionToken' in result){
        try {await same();if(!eligible())throw new ApplicationError('STALE_FAMILY_REQUEST','Email request is inactive.');await commitSignedIn(result,eligible);return {signedIn:true as const,userId:result.userId,needsProfile:result.needsProfile};}
        catch(error){try{await deps.client.signOut(result.sessionToken);}catch{/* only discard the new session */}throw asApplicationError(error);}
      }
      await same();
      if('deleted' in result){
        const cleanup=async()=>{await same();emailAuthRequest++;await deps.session.clearSession();await cache.clear();if(issued.userId)await safeIsolateAccount(issued.userId);await deps.session.clearPendingRevoke();};
        const next=identityCommit.then(cleanup,cleanup);identityCommit=next.then(()=>undefined,()=>undefined);await next;return result;
      }
      if(!eligible())throw new ApplicationError('STALE_FAMILY_REQUEST','Email request is inactive.');
      return result;
    },
    async getMyProfile(isCurrent: () => boolean) {
      const account = await requireAccount();
      if (!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Profile is inactive.');
      if (!deps.client.getMyProfile) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const profile = await deps.client.getMyProfile(account.sessionToken);
      await assertSameAccount(account);
      if (!isCurrent() || profile.userId !== account.userId) throw new ApplicationError('STALE_FAMILY_REQUEST','Profile account changed.');
      return profile;
    },
    async updateMyProfile(nickname: string, isCurrent: () => boolean) {
      const account = await requireAccount();
      if (!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Profile is inactive.');
      if (!deps.client.updateMyProfile) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const profile = await deps.client.updateMyProfile(account.sessionToken,nickname);
      await assertSameAccount(account);
      if (!isCurrent() || profile.userId !== account.userId) throw new ApplicationError('STALE_FAMILY_REQUEST','Profile account changed.');
      return profile;
    },
    async getAppleLink(isCurrent:()=>boolean) {
      const a=await requireAccount();if(!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Profile is inactive.');
      if(!deps.client.getAppleLink) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const result=await deps.client.getAppleLink(a.sessionToken);await assertSameAccount(a);
      if(!isCurrent()) throw new ApplicationError('STALE_FAMILY_REQUEST','Profile is inactive.');return result;
    },
    async authenticateApple(intent:'login'|'link',authorize:(nonce:string)=>Promise<string>,isCurrent:()=>boolean) {
      const request=++emailAuthRequest;const initialToken=await deps.session.getSessionToken();
      const eligible=()=>request===emailAuthRequest && isCurrent();
      const check=async()=>{if(!eligible() || await deps.session.getSessionToken()!==initialToken) throw new ApplicationError('STALE_FAMILY_REQUEST','Apple request is inactive.');};
      await check();
      if(intent==='link' && !initialToken) throw new ApplicationError('UNAUTHENTICATED','Sign in first.');
      if(!deps.client.beginAppleAuth || !deps.client.completeAppleAuth) throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const c=await deps.client.beginAppleAuth(intent,intent==='link'?initialToken || undefined:undefined);
      await check();
      const identityToken=await authorize(c.nonce);await check();
      const result=await deps.client.completeAppleAuth({challengeId:c.challengeId,identityToken},intent==='link'?initialToken || undefined:undefined);
      if('linked' in result) {await check();return result;}
      try {await check();return await commitSignedIn(result,eligible);}
      catch(error) {try {await deps.client.signOut(result.sessionToken);} catch { /* discarded session expires */ }throw asApplicationError(error);}
    },
    async signInWithApple(identityToken: string) {
      const request = ++emailAuthRequest;
      let result: { userId: string; sessionToken: string } | undefined;
      try {
        result = await deps.client.signInWithApple(identityToken);
        return await commitSignedIn(result, () => request === emailAuthRequest);
      } catch (error) {
        if (result) { try { await deps.client.signOut(result.sessionToken); } catch { /* only discarded token */ } }
        // A failed sign-in must not clear a pre-existing or newer account session.
        throw asApplicationError(error);
      }
    },
    async signInWithTestAccount(login: string, password: string) {
      const request = ++emailAuthRequest;
      let result: { userId: string; sessionToken: string } | undefined;
      try {
        result = await deps.client.signInWithTestAccount({ login, password });
        return await commitSignedIn(result, () => request === emailAuthRequest);
      } catch (error) {
        if (result) { try { await deps.client.signOut(result.sessionToken); } catch { /* only discarded token */ } }
        // A failed sign-in must not clear a pre-existing or newer account session.
        throw asApplicationError(error);
      }
    },

    async getMembership(): Promise<FamilyMembershipView> {
      await flushPendingRevoke();
      const token = await deps.session.getSessionToken();
      if (!token) return { kind: 'unauthenticated' };
      const owner=await requireAccount();
      if(token!==owner.sessionToken)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
      try {
        const listed = await deps.client.listMembership(token);
        await assertSameAccount(owner);
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
        await assertSameAccount(owner);
        const appError = asApplicationError(error);
        if (appError.code === 'UNAUTHENTICATED' || appError.code === 'APPLE_TOKEN_INVALID') {
          const userId = await deps.session.getUserId();
          await deps.session.clearSession();
          await cache.clear();
          if (userId) await safeIsolateAccount(userId);
          return { kind: 'unconfirmed', reason: 'unauthenticated' };
        }
        if (appError.code === 'FAMILY_SELECTION_REQUIRED') return { kind: 'selection-required' };
        if (appError.code === 'SERVER_UNREACHABLE' || appError.code === 'NETWORK') {
          return { kind: 'unconfirmed', reason: 'unreachable' };
        }
        throw appError;
      }
    },

    async createFamily(idempotencyKey?: string) {
      const { sessionToken } = await requireAccount();
      return withPending({
        expectedSessionToken:sessionToken,
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
        expectedSessionToken:sessionToken,
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
        expectedSessionToken:sessionToken,
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
        expectedSessionToken:sessionToken,
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

    async deleteAccount(authorize:(nonce:string)=>Promise<{identityToken:string;authorizationCode:string|null}>,isCurrent:()=>boolean) {
      const account=await requireAccount();
      const check=async()=>{await assertSameAccount(account);if(!isCurrent())throw new ApplicationError('STALE_FAMILY_REQUEST','Deletion request is inactive.');};
      await check();
      if(!deps.client.beginAppleAuth||!deps.client.deleteAccount)throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Service upgrade required.');
      const c=await deps.client.beginAppleAuth('delete',account.sessionToken);await check();
      const credential=await authorize(c.nonce);await check();
      const result=await deps.client.deleteAccount(account.sessionToken,{challengeId:c.challengeId,identityToken:credential.identityToken,authorizationCode:credential.authorizationCode||undefined,confirmation:'delete-my-lampy-account-v1'});
      if(result.deleted!==true)throw new ApplicationError('FAMILY_UPGRADE_REQUIRED','Deletion was not confirmed.');
      // Server deletion already completed. Clear this identity even if the screen became inactive.
      await assertSameAccount(account);
      emailAuthRequest++;
      await deps.session.clearSession();await cache.clear();await safeIsolateAccount(account.userId);
      await deps.session.clearPendingRevoke();
      selectedMediaUpload={status:'idle'};shareConfirm={status:'idle'};shareRevoke={status:'idle'};
      return result;
    },
    async signOut(): Promise<SignOutResult> {
      emailAuthRequest++;
      const next=identityCommit.then(performSignOut,performSignOut);
      identityCommit=next.then(()=>undefined,()=>undefined);
      return next;
    },

    async hasUnconfirmedSessionRevoke() {
      const row = await deps.session.getPendingRevoke();
      return Boolean(row && !pendingRevokeExpired(row));
    },

    getSelectedMediaUploadStatus(): SelectedMediaUploadState {
      return selectedMediaUpload;
    },

    async uploadSelectedMedia(input: { bytes: Uint8Array; mimeType: string; idempotencyKey?: string }) {
      const owner=await requireAccount();
      selectedMediaUpload = { status: 'uploading' };
      try {
        const { sessionToken } = await requireAccount();
        const outgoing = await prepareFamilyShareMedia(input.bytes, input.mimeType, deps.personal?.convertImageForShare);
        await assertSameAccount(owner);
        const object = await deps.client.uploadMedia(sessionToken, { ...outgoing, idempotencyKey: input.idempotencyKey });
        await assertSameAccount(owner);
        selectedMediaUpload = { status: 'stored', object };
        return selectedMediaUpload;
      } catch (error) {
        const appError = asApplicationError(error);
        if (appError.code !== 'STALE_FAMILY_REQUEST') selectedMediaUpload = { status: 'failed', code: appError.code, message: appError.message };
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
      const owner=await requireAccount();
      const membership = await this.getMembership();
      if (membership.kind === 'unauthenticated' || (membership.kind === 'unconfirmed' && membership.reason === 'unauthenticated')) {
        throw new ApplicationError('UNAUTHENTICATED', 'Sign in is required.');
      }
      if (membership.kind !== 'ready') {
        throw new ApplicationError('NOT_IN_FAMILY', 'Not a member of this family.');
      }
      const moment = await loadPersonalMoment(momentId);
      const media = await listPersonalShareMedia(moment.assetIds, mediaByAsset);
      await assertSameAccount(owner);
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
      const owner=await requireAccount();
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
          const objectId = await resolvePersonalShareMedia(owner, assetId, input.mediaByAsset);
          mediaObjectIds.push(objectId);
        }
        if (mediaObjectIds.length !== requiredAssetIds.length) {
          throw new ApplicationError('SHARE_MEDIA_INCOMPLETE', 'Confirmed media is incomplete and will not be dropped.');
        }
        await assertSameAccount(owner);
        const { sessionToken } = owner;
        const snapshotCanonical = canonicalizeShareSnapshot({
          note: moment.content.note,
          emotion: moment.content.emotion,
          occurredAt: moment.time.occurredAt,
          occurredAtPrecision: moment.time.occurredAtPrecision,
          mediaObjectIds,
        });
        const result = await withPending({
        expectedSessionToken:sessionToken,          command: 'shareMoment',
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
        await assertSameAccount(owner);
        shareConfirm = { status: 'stored', share: result };
        return shareConfirm;
      } catch (error) {
        const appError = asApplicationError(error);
        if (appError.code !== 'STALE_FAMILY_REQUEST') shareConfirm = { status: 'failed', code: appError.code, message: appError.message };
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
      const revision=deps.session.getRevision?.();
      const membership = await this.getMembership();
      if(revision!==deps.session.getRevision?.())throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
      if (membership.kind !== 'ready') {
        if (membership.kind === 'none' || membership.kind === 'unauthenticated') {
          const userId = await deps.session.getUserId();
          if (userId) await safeIsolateAccount(userId);
        }
        return hiddenInbox(membership) ?? { kind: 'hidden', reason: 'unconfirmed' };
      }
      const owner=await requireAccount();
      if(owner.revision!==revision)throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
      try {
        const { sessionToken, userId } = owner;
        const listed = await deps.client.listVisibleShares(sessionToken, membership.familyId);
        await assertSameAccount(owner);
        const allowed = new Set(listed.shares.map((share) => share.shareId));
        if (deps.receiveCache) {
          await deps.receiveCache.replaceVisible(userId, membership.familyId, listed.shares);
        }
        const rows = deps.receiveCache
          ? (await deps.receiveCache.list(userId, membership.familyId)).filter((row) => allowed.has(row.shareId))
          : [];
        const items=await Promise.all(rows.map((row)=>toInboxItem(row,userId)));
        await assertSameAccount(owner);
        return {
          kind: 'ready',
          familyId: membership.familyId,
          items,
        };
      } catch (error) {
        await assertSameAccount(owner);
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
      const owner=await requireAccount();
      const membership = await this.getMembership();
      await assertSameAccount(owner);
      if (membership.kind !== 'ready') {
        throw new ApplicationError('NOT_IN_FAMILY', 'Not a member of this family.');
      }
      if (!deps.receiveCache) {
        throw new ApplicationError('SHARE_NOT_FOUND', 'Family cache is not available.');
      }
      const { sessionToken, userId } = owner;
      const share = await deps.client.getShare(sessionToken, membership.familyId, shareId);
      await assertSameAccount(owner);
      await deps.receiveCache.beginReceive(userId, share);
      try {
        await assertSameAccount(owner);
        for (const item of share.snapshot.media) {
          await assertSameAccount(owner);
          const existing = (await deps.receiveCache.listMedia(userId, share.familyId, share.shareId)).find(
            (row) => row.objectId === item.objectId && row.status === 'stored',
          );
          if (existing) {
            const storedBytes = await deps.receiveCache.readMediaBytes(existing.storageKey);
            if (
              storedBytes.length === existing.byteLength &&
              sha256MediaBytes(storedBytes) === existing.contentSha256
            ) {
              if(existing.storageKey!==familyReceivedMediaKey(existing))await deps.receiveCache.saveStoredMedia({...existing,bytes:storedBytes});
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
          await assertSameAccount(owner);
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
        await assertSameAccount(owner);
        const received = await deps.receiveCache.markReceived(userId, share.familyId, share.shareId);
        const item=await toInboxItem(received,userId);
        await assertSameAccount(owner);
        return { status: 'received' as const, item };
      } catch (error) {
        const appError = asApplicationError(error);
        if (appError.code === 'STALE_FAMILY_REQUEST') {await safeIsolateShare(userId,membership.familyId,shareId);throw appError;}
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
