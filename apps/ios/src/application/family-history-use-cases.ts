import { utf8ToBytes } from '@noble/hashes/utils.js';
import { ApplicationError } from './errors';
import type { FamilyApiClient } from '../infrastructure/family-http-client';
import type { FamilySessionStore } from './family-use-cases';
import type { FamilyReceiveCache } from '../infrastructure/family-receive-cache';
import type { PendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import type { AssetRead, MomentRead } from '../infrastructure/repositories';
import type { FamilySummary, ShareView } from '../family-api/types';
import { sha256MediaBytes } from '../family-api/media-validate';

export const HISTORY_AUDIENCE_CONFIRMATION = 'new-members-can-read-active-history';
export type HistoryCurrent = () => boolean;
export type HistoryPreview = {
  userId: string; family: FamilySummary; sourceMomentId: string; sourceRevision: number;
  note: string; emotion: string; occurredAt?: string; occurredAtPrecision: string;
  media: { assetId: string; mimeType: string; ready: boolean }[];
  availableMedia: { assetId: string; mimeType: string }[];
};
export type HistoryReading = {
  userId: string; share: ShareView;
  media: { objectId: string; mimeType: string; uri: string }[];
};

type Account = { userId: string; sessionToken: string };
type Personal = {
  moments: { findById(id: string): Promise<MomentRead> };
  assets: { findById(id: string): Promise<AssetRead> };
  readAssetBytes?: (uri: string) => Promise<Uint8Array>;
};
function error(code: string) { return new ApplicationError(code, code); }
function digest(value: unknown) { return sha256MediaBytes(utf8ToBytes(JSON.stringify(value))); }

// D2 uses explicit targets. It never infers a family from the legacy single-family membership API.
export function createFamilyHistoryUseCases(deps: {
  client: FamilyApiClient; session: FamilySessionStore; pending: PendingFamilyOperationStore;
  personal?: Personal; receiveCache?: FamilyReceiveCache;
  mediaUri?: (storageKey: string) => string;
}) {
  const frozen = new WeakMap<HistoryPreview, { account: Account; fingerprint: string; familyId: string; momentId: string; selectedAssetIds: string[] }>();
  let cacheTail: Promise<unknown> = Promise.resolve();
  async function account(): Promise<Account> {
    const sessionToken = await deps.session.getSessionToken();
    const userId = await deps.session.getUserId();
    if (!sessionToken || !userId) throw error('UNAUTHENTICATED');
    return { userId, sessionToken };
  }
  async function check(a: Account, current: HistoryCurrent) {
    if (!current()) throw error('STALE_FAMILY_REQUEST');
    const next = await account();
    if (!current() || a.userId !== next.userId || a.sessionToken !== next.sessionToken) throw error('STALE_FAMILY_REQUEST');
  }
  function api() {
    if (!deps.client.history || !deps.client.getHistoryPolicy) throw error('FAMILY_UPGRADE_REQUIRED');
    return deps.client.history;
  }
  async function family(a: Account, familyId: string, current: HistoryCurrent) {
    if (!deps.client.listFamilies) throw error('FAMILY_UPGRADE_REQUIRED');
    await check(a, current);
    const list = await deps.client.listFamilies(a.sessionToken);
    await check(a, current);
    const found = list.families.find(f => f.familyId === familyId);
    if (!found) throw error('NOT_IN_FAMILY');
    return found;
  }
  async function source(momentId: string, a: Account, current: HistoryCurrent, selection?: string[]) {
    const found = await deps.personal?.moments.findById(momentId);
    await check(a, current);
    if (found?.kind !== 'ready' || found.moment.lifecycle.status !== 'active' || found.moment.ownerId !== 'local-user') throw error('MOMENT_NOT_FOUND');
    // Copy values before any later await; repository records may be mutable test doubles.
    const m = JSON.parse(JSON.stringify(found.moment)) as typeof found.moment;
    const selected = selection ?? m.assetIds;
    if (new Set(selected).size !== selected.length || selected.some(id => !m.assetIds.includes(id))) throw error('SOURCE_CHANGED');
    const media: { assetId: string; mimeType: string; hash: string; bytes: Uint8Array }[] = [];
    const availableMedia: HistoryPreview['availableMedia'] = [];
    for (const assetId of m.assetIds) {
      const read = await deps.personal!.assets.findById(assetId);
      await check(a, current);
      availableMedia.push({ assetId, mimeType: read.kind === 'ready' ? read.asset.metadata.mimeType || '' : '' });
      if (!selected.includes(assetId)) continue;
      if (read.kind !== 'ready' || !read.asset.localUri || !deps.personal?.readAssetBytes) {
        media.push({ assetId, mimeType: '', hash: '', bytes: new Uint8Array() }); continue;
      }
      const asset = JSON.parse(JSON.stringify(read.asset)) as typeof read.asset;
      let bytes: Uint8Array;
      try { bytes = await deps.personal.readAssetBytes(asset.localUri); }
      catch { bytes = new Uint8Array(); }
      await check(a, current);
      media.push({ assetId, mimeType: asset.metadata.mimeType || '', hash: bytes.byteLength ? sha256MediaBytes(bytes) : '', bytes });
    }
    const snapshot = { sourceMomentId: m.id, sourceRevision: m.revision, note: m.content.note,
      emotion: m.content.emotion, occurredAt: m.time.occurredAt, occurredAtPrecision: m.time.occurredAtPrecision };
    return { snapshot, media, availableMedia, fingerprint: digest({ ...snapshot, media: media.map(({ assetId, mimeType, hash }) => ({ assetId, mimeType, hash })) }) };
  }
  async function cacheWork<T>(a: Account, familyId: string, shareId: string | undefined, current: HistoryCurrent, work: (cache: FamilyReceiveCache) => Promise<T>) {
    if (!deps.receiveCache) throw error('FAMILY_CACHE_UNAVAILABLE');
    const job = cacheTail.catch(() => undefined).then(async () => {
      await check(a, current);
      try {
        const result = await work(deps.receiveCache!);
        await check(a, current);
        return result;
      } catch (e) {
        // A write already in flight can finish after sign-out. Hide its rows before the next cache job.
        try { await check(a, current); }
        catch {
          if (shareId) await deps.receiveCache!.isolateShare(a.userId, familyId, shareId);
          else await deps.receiveCache!.isolateFamily(a.userId, familyId);
        }
        throw e;
      }
    });
    cacheTail = job;
    return job;
  }
  async function invalidateDenied(a: Account, familyId: string, shareId: string | undefined, current: HistoryCurrent, failure: unknown) {
    const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : '';
    if (!['UNAUTHENTICATED','NOT_IN_FAMILY','FORBIDDEN','SHARE_NOT_FOUND','FAMILY_HISTORY_CLOSED'].includes(String(code))) return;
    // This cleanup touches only this account/family/share, never personal records.
    await cacheWork(a, familyId, shareId, current, cache => shareId
      ? cache.isolateShare(a.userId,familyId,shareId) : cache.isolateFamily(a.userId,familyId)).catch(() => undefined);
  }
  async function policy(a: Account, familyId: string, current: HistoryCurrent) {
    api();
    await check(a, current);
    const result = await deps.client.getHistoryPolicy!(a.sessionToken, familyId);
    await check(a, current);
    return result.policy;
  }

  return {
    async getPolicy(familyId: string, current: HistoryCurrent) {
      const a = await account();
      const target = await family(a, familyId, current);
      return { userId: a.userId, family: target, policy: await policy(a, familyId, current) };
    },
    async confirmPolicy(familyId: string, current: HistoryCurrent) {
      const a = await account();
      const target = await family(a, familyId, current);
      if (target.role !== 'creator') throw error('FORBIDDEN');
      if (!deps.client.confirmHistoryPolicy) throw error('FAMILY_UPGRADE_REQUIRED');
      await check(a, current);
      const result = await deps.client.confirmHistoryPolicy(a.sessionToken, familyId);
      await check(a, current);
      return result;
    },
    async prepare(momentId: string, familyId: string, current: HistoryCurrent, selectedAssetIds?: string[]): Promise<HistoryPreview> {
      const a = await account();
      const target = await family(a, familyId, current);
      if (await policy(a, familyId, current) !== 'family-history-v2') throw error('FAMILY_POLICY_UPGRADE_REQUIRED');
      const read = await source(momentId, a, current, selectedAssetIds);
      const preview: HistoryPreview = { userId: a.userId, family: target, ...read.snapshot,
        availableMedia: read.availableMedia, media: read.media.map(({ assetId, mimeType, hash }) => ({ assetId, mimeType, ready: Boolean(hash) })) };
      frozen.set(preview, { account: a, fingerprint: read.fingerprint, familyId, momentId, selectedAssetIds: read.media.map(m => m.assetId) });
      return preview;
    },
    async share(preview: HistoryPreview, confirmation: string, current: HistoryCurrent) {
      const original = frozen.get(preview);
      if (!original || confirmation !== HISTORY_AUDIENCE_CONFIRMATION || preview.family.familyId !== original.familyId || preview.sourceMomentId !== original.momentId) throw error('BAD_REQUEST');
      const a = original.account;
      await check(a, current);
      await family(a, preview.family.familyId, current);
      if (await policy(a, preview.family.familyId, current) !== 'family-history-v2') throw error('FAMILY_POLICY_UPGRADE_REQUIRED');
      const read = await source(preview.sourceMomentId, a, current, original.selectedAssetIds);
      if (read.fingerprint !== original.fingerprint) throw error('SOURCE_CHANGED');
      if (read.media.some(m => !m.hash)) throw error('SHARE_MEDIA_INCOMPLETE');
      const mediaObjectIds: string[] = [];
      for (const item of read.media) {
        await check(a, current);
        const uploaded = await deps.client.uploadMedia(a.sessionToken, { bytes: item.bytes, mimeType: item.mimeType,
          idempotencyKey: `history-media:${digest({ assetId: item.assetId, hash: item.hash, mime: item.mimeType })}` });
        await check(a, current);
        mediaObjectIds.push(uploaded.objectId);
      }
      // Upload completion is not permission to save an outdated/private selection.
      const latest = await source(preview.sourceMomentId, a, current, original.selectedAssetIds);
      if (latest.fingerprint !== original.fingerprint) throw error('SOURCE_CHANGED');
      await family(a, preview.family.familyId, current);
      const body = { ...read.snapshot, mediaObjectIds, expectedMediaCount: mediaObjectIds.length,
        audienceConfirmation: HISTORY_AUDIENCE_CONFIRMATION };
      const operationId = `history:${digest({ familyId: preview.family.familyId, ...body })}`;
      const fingerprint = digest(body);
      const existing = await deps.pending.find(a.userId, 'shareMoment', operationId);
      await check(a, current);
      if (existing && existing.requestFingerprint !== fingerprint) throw error('PENDING_CONFLICT');
      const key = existing?.idempotencyKey ?? operationId;
      if (!existing) await deps.pending.save({ userId: a.userId, familyId: preview.family.familyId,
        command: 'shareMoment', operationId, requestFingerprint: fingerprint, idempotencyKey: key, createdAt: new Date().toISOString() });
      await check(a, current);
      const result = await api().shareMoment(a.sessionToken, preview.family.familyId, { ...body, idempotencyKey: key });
      await check(a, current);
      await deps.pending.remove(a.userId, 'shareMoment', operationId);
      await check(a, current);
      return result;
    },
    async list(familyId: string, current: HistoryCurrent) {
      const a = await account();
      await family(a, familyId, current);
      let result;
      try { result = await api().listVisibleShares(a.sessionToken, familyId); }
      catch(e) { await invalidateDenied(a,familyId,undefined,current,e); throw e; }
      await check(a, current);
      await cacheWork(a, familyId, undefined, current, c => c.replaceVisible(a.userId, familyId, result.shares));
      return { userId: a.userId, shares: result.shares };
    },
    async read(familyId: string, shareId: string, current: HistoryCurrent): Promise<HistoryReading> {
      const a = await account();
      const client = api();
      let share;
      try { share = await client.getShare(a.sessionToken, familyId, shareId); }
      catch(e) { await invalidateDenied(a,familyId,shareId,current,e); throw e; }
      await check(a, current);
      let received: HistoryReading['media'];
      try { received = await cacheWork(a, familyId, shareId, current, async cache => {
        await cache.beginReceive(a.userId, share);
        const media: HistoryReading['media'] = [];
        for (const item of share.snapshot.media) {
          await check(a, current);
          // Metadata always comes from a fresh authenticated request, including for a cached file.
          const meta = await client.getShareMedia(a.sessionToken, familyId, shareId, item.objectId);
          await check(a, current);
          const stored = (await cache.listMedia(a.userId, familyId, shareId)).find(m => m.objectId === item.objectId && m.status === 'stored');
          let bytes: Uint8Array | undefined;
          if (stored) try { bytes = await cache.readMediaBytes(stored.storageKey); } catch { /* fetch below */ }
          if (!bytes || bytes.length !== meta.byteLength || sha256MediaBytes(bytes) !== meta.contentSha256) {
            const content = await client.getShareMediaContent(a.sessionToken, familyId, shareId, item.objectId);
            await check(a, current);
            bytes = content.bytes;
          }
          if (bytes.length !== meta.byteLength || sha256MediaBytes(bytes) !== meta.contentSha256) throw error('SHARE_MEDIA_UNAVAILABLE');
          const storageKey = `${a.userId}/${familyId}/${shareId}/${item.objectId}`;
          await check(a, current);
          await cache.saveStoredMedia({ userId: a.userId, familyId, shareId, objectId: item.objectId,
            mimeType: meta.mimeType, byteLength: meta.byteLength, contentSha256: meta.contentSha256, storageKey, bytes });
          await check(a, current);
          media.push({ objectId: item.objectId, mimeType: meta.mimeType, uri: deps.mediaUri?.(storageKey) || '' });
        }
        // Revalidate after all media awaits. Revocation in the middle cannot publish a readable result.
        await client.getShare(a.sessionToken, familyId, shareId);
        await check(a, current);
        await cache.markReceived(a.userId, familyId, shareId);
        return media;
      }); } catch(e) { await invalidateDenied(a,familyId,shareId,current,e); throw e; }
      await check(a, current);
      return { userId: a.userId, share, media: received };
    },
    async authorize(familyId: string, shareId: string, current: HistoryCurrent) {
      const a = await account();
      let share;
      try { share = await api().getShare(a.sessionToken, familyId, shareId); }
      catch(e) { await invalidateDenied(a,familyId,shareId,current,e); throw e; }
      await check(a, current);
      return { userId: a.userId, share };
    },
    async revoke(familyId: string, shareId: string, current: HistoryCurrent) {
      const a = await account();
      await check(a, current);
      const result = await api().revokeShare(a.sessionToken, familyId, shareId);
      await check(a, current);
      await cacheWork(a, familyId, shareId, current, c => c.isolateShare(a.userId, familyId, shareId));
      return result;
    },
  };
}
export type FamilyHistoryUseCases = ReturnType<typeof createFamilyHistoryUseCases>;
