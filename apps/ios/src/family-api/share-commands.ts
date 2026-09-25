import { FAMILY_ERROR, FamilyError } from './errors';
import { canonicalizeShareSnapshot, fingerprintShareMoment } from './idempotency';
import { sha256MediaBytes } from './media-validate';
import type { MediaBlobStore } from './media-blobs';
import type { FamilyRepository, FamilyTx } from './repository';
import { FamilyStoreConstraintError } from './repository';
import type { ShareMediaView, ShareMomentInput, ShareRecord, ShareSnapshot, ShareView } from './types';

export type ShareCommands = {
  shareMoment(sessionToken: string, familyId: string, input: ShareMomentInput): Promise<ShareView>;
  listVisibleShares(sessionToken: string, familyId: string): Promise<{ shares: ShareView[] }>;
  getShare(sessionToken: string, familyId: string, shareId: string): Promise<ShareView>;
  getShareMedia(sessionToken: string, familyId: string, shareId: string, objectId: string): Promise<ShareMediaView>;
  getShareMediaContent(
    sessionToken: string,
    familyId: string,
    shareId: string,
    objectId: string,
  ): Promise<{ mimeType: string; bytes: Uint8Array }>;
};

function toView(row: ShareRecord): ShareView {
  return {
    shareId: row.shareId,
    familyId: row.familyId,
    authorUserId: row.authorUserId,
    sourceMomentId: row.sourceMomentId,
    sourceRevision: row.sourceRevision,
    snapshot: row.snapshot,
    audienceUserIds: [...row.audienceUserIds],
    sharedAt: row.sharedAt,
    stored: 'server',
  };
}

function newShareId() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `shr_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function asShareView(body: unknown): ShareView | null {
  if (!body || typeof body !== 'object') return null;
  const shareId = (body as { shareId?: unknown }).shareId;
  return typeof shareId === 'string' && shareId ? (body as ShareView) : null;
}

function assertShareInput(input: ShareMomentInput) {
  if (!input.sourceMomentId.trim()) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'A source moment is required.');
  }
  if (!Number.isInteger(input.sourceRevision) || input.sourceRevision < 1) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'sourceRevision must be a positive integer.');
  }
  if (typeof input.note !== 'string' || typeof input.emotion !== 'string') {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Note and emotion must be text.');
  }
  if (typeof input.occurredAtPrecision !== 'string' || !input.occurredAtPrecision) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Time precision is required.');
  }
  if (input.occurredAt !== undefined && input.occurredAt !== '' && Number.isNaN(Date.parse(input.occurredAt))) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'occurredAt is not a valid time.');
  }
  if (!Array.isArray(input.mediaObjectIds) || input.mediaObjectIds.some((id) => typeof id !== 'string' || !id)) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Media references must be server object ids.');
  }
  if (input.mediaObjectIds.some((id) => id.includes('/') || id.startsWith('file:') || id.includes('localUri'))) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Media references must be server object ids.');
  }
  if (new Set(input.mediaObjectIds).size !== input.mediaObjectIds.length) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Media references must be unique.');
  }
  if (input.expectedMediaCount !== input.mediaObjectIds.length) {
    throw new FamilyError(FAMILY_ERROR.SHARE_MEDIA_INCOMPLETE, 'Confirmed media is incomplete and will not be dropped.');
  }
  if (!input.note.trim() && input.mediaObjectIds.length === 0) {
    throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'A share needs a note or at least one media object.');
  }
}

async function requireUser(tx: FamilyTx, sessionToken: string | undefined, now: Date) {
  if (!sessionToken) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Sign in is required.');
  }
  const session = await tx.findSession(sessionToken);
  if (!session || new Date(session.expiresAt).getTime() <= now.getTime()) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.');
  }
  return session.userId;
}

function shareIsActive(_row: ShareRecord) {
  return true;
}

async function requireActiveMember(tx: FamilyTx, familyId: string, userId: string) {
  const family = await tx.findFamily(familyId);
  if (!family || family.status === 'dissolved') {
    throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.');
  }
  const membership = await tx.findActiveMembership(familyId, userId);
  if (!membership) {
    throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.');
  }
  return membership;
}

async function blobMatches(
  blobs: MediaBlobStore,
  row: { storageKey: string; byteLength: number; contentSha256: string },
) {
  try {
    const bytes = await blobs.read(row.storageKey);
    return bytes.length === row.byteLength && sha256MediaBytes(bytes) === row.contentSha256;
  } catch {
    return false;
  }
}

function snapshotEquals(left: ShareSnapshot, right: ShareSnapshot) {
  return (
    left.note === right.note &&
    left.emotion === right.emotion &&
    (left.occurredAt || '') === (right.occurredAt || '') &&
    left.occurredAtPrecision === right.occurredAtPrecision &&
    JSON.stringify(left.media.map((item) => item.objectId)) === JSON.stringify(right.media.map((item) => item.objectId))
  );
}

export function createShareCommands(deps: {
  repository: FamilyRepository;
  blobs: MediaBlobStore;
  clock?: { now: () => Date };
  shareId?: () => string;
}): ShareCommands {
  const clock = deps.clock ?? { now: () => new Date() };

  async function ownedReadableMedia(tx: FamilyTx, userId: string, objectIds: string[]) {
    const media = [];
    for (const objectId of objectIds) {
      const row = await tx.findMediaObject(objectId);
      if (!row) {
        throw new FamilyError(FAMILY_ERROR.SHARE_MEDIA_UNAVAILABLE, 'A selected media object is not available.');
      }
      if (row.ownerUserId !== userId) {
        throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'This media object is not available.');
      }
      if (!(await blobMatches(deps.blobs, row))) {
        throw new FamilyError(FAMILY_ERROR.SHARE_MEDIA_UNAVAILABLE, 'A selected media object is not available.');
      }
      media.push({ objectId: row.objectId, mimeType: row.mimeType, byteLength: row.byteLength });
    }
    return media;
  }

  return {
    async shareMoment(sessionToken, familyId, input) {
      assertShareInput(input);
      const snapshotCanonical = canonicalizeShareSnapshot({
        note: input.note,
        emotion: input.emotion,
        occurredAt: input.occurredAt,
        occurredAtPrecision: input.occurredAtPrecision,
        mediaObjectIds: input.mediaObjectIds,
      });
      const fingerprint = fingerprintShareMoment({
        familyId,
        sourceMomentId: input.sourceMomentId,
        sourceRevision: input.sourceRevision,
        snapshotCanonical,
      });

      return deps.repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock.now());
        await requireActiveMember(tx, familyId, userId);

        if (input.idempotencyKey) {
          const existing = await tx.findIdempotent(userId, 'shareMoment', input.idempotencyKey);
          if (existing) {
            if (existing.requestFingerprint !== fingerprint) {
              throw new FamilyError(FAMILY_ERROR.CONFLICT, 'Idempotency key was reused with a different request.');
            }
            const replayed = asShareView(existing.body);
            const row = replayed ? await tx.findShare(replayed.shareId) : null;
            if (!row || row.authorUserId !== userId) {
              throw new FamilyError(FAMILY_ERROR.SHARE_NOT_FOUND, 'Share was not found.');
            }
            return toView(row);
          }
        }

        const sameRevision = await tx.findShareBySource(familyId, userId, input.sourceMomentId, input.sourceRevision);
        const media = await ownedReadableMedia(tx, userId, input.mediaObjectIds);
        const audienceUserIds = (await tx.listActiveMembers(familyId)).map((row) => row.userId).sort();
        const shareId = (deps.shareId ?? newShareId)();
        const snapshot: ShareSnapshot = {
          note: input.note,
          emotion: input.emotion,
          occurredAt: input.occurredAt || undefined,
          occurredAtPrecision: input.occurredAtPrecision,
          media,
          origin: {
            type: 'received',
            transmissionId: sameRevision?.shareId ?? shareId,
            originalMomentId: input.sourceMomentId,
            snapshotRevision: input.sourceRevision,
          },
        };
        if (sameRevision) {
          if (!snapshotEquals(sameRevision.snapshot, snapshot)) {
            throw new FamilyError(FAMILY_ERROR.CONFLICT, 'This moment revision was already shared with different fields.');
          }
          if (input.idempotencyKey) {
            await tx.saveIdempotent(userId, 'shareMoment', input.idempotencyKey, {
              requestFingerprint: fingerprint,
              status: 200,
              body: toView(sameRevision),
            });
          }
          return toView(sameRevision);
        }

        const row: ShareRecord = {
          shareId,
          familyId,
          authorUserId: userId,
          sourceMomentId: input.sourceMomentId,
          sourceRevision: input.sourceRevision,
          snapshot,
          audienceUserIds,
          sharedAt: clock.now().toISOString(),
        };
        try {
          await tx.saveShare(row);
        } catch (error) {
          if (error instanceof FamilyStoreConstraintError && error.constraint === 'share_revision') {
            const raced = await tx.findShareBySource(familyId, userId, input.sourceMomentId, input.sourceRevision);
            if (raced) {
              if (!snapshotEquals(raced.snapshot, snapshot)) {
                throw new FamilyError(
                  FAMILY_ERROR.CONFLICT,
                  'This moment revision was already shared with different fields.',
                );
              }
              if (input.idempotencyKey) {
                await tx.saveIdempotent(userId, 'shareMoment', input.idempotencyKey, {
                  requestFingerprint: fingerprint,
                  status: 200,
                  body: toView(raced),
                });
              }
              return toView(raced);
            }
          }
          throw error;
        }
        if (input.idempotencyKey) {
          await tx.saveIdempotent(userId, 'shareMoment', input.idempotencyKey, {
            requestFingerprint: fingerprint,
            status: 200,
            body: toView(row),
          });
        }
        return toView(row);
      });
    },

    async listVisibleShares(sessionToken, familyId) {
      return deps.repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock.now());
        await requireActiveMember(tx, familyId, userId);
        const rows = await tx.listSharesInFamily(familyId);
        return {
          shares: rows
            .filter((row) => shareIsActive(row) && row.audienceUserIds.includes(userId))
            .map(toView),
        };
      });
    },

    async getShare(sessionToken, familyId, shareId) {
      return deps.repository.withTransaction(async (tx) => {
        const { share } = await authorizeVisibleShare(tx, sessionToken, familyId, shareId, clock.now());
        return toView(share);
      });
    },

    async getShareMedia(sessionToken, familyId, shareId, objectId) {
      return deps.repository.withTransaction(async (tx) => {
        await authorizeVisibleShare(tx, sessionToken, familyId, shareId, clock.now());
        return authorizedShareMedia(tx, deps.blobs, shareId, familyId, objectId);
      });
    },

    async getShareMediaContent(sessionToken, familyId, shareId, objectId) {
      return deps.repository.withTransaction(async (tx) => {
        await authorizeVisibleShare(tx, sessionToken, familyId, shareId, clock.now());
        const media = await authorizedShareMedia(tx, deps.blobs, shareId, familyId, objectId);
        const bytes = await deps.blobs.read(media.objectId);
        if (bytes.length !== media.byteLength || sha256MediaBytes(bytes) !== media.contentSha256) {
          throw new FamilyError(FAMILY_ERROR.SHARE_MEDIA_UNAVAILABLE, 'A selected media object is not available.');
        }
        return { mimeType: media.mimeType, bytes };
      });
    },
  };
}

async function authorizeVisibleShare(
  tx: FamilyTx,
  sessionToken: string,
  familyId: string,
  shareId: string,
  now: Date,
) {
  const userId = await requireUser(tx, sessionToken, now);
  await requireActiveMember(tx, familyId, userId);
  const row = await tx.findShare(shareId);
  if (!row || row.familyId !== familyId || !shareIsActive(row)) {
    throw new FamilyError(FAMILY_ERROR.SHARE_NOT_FOUND, 'Share was not found.');
  }
  if (!row.audienceUserIds.includes(userId)) {
    throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'This share is not available.');
  }
  return { userId, share: row };
}

async function authorizedShareMedia(
  tx: FamilyTx,
  blobs: MediaBlobStore,
  shareId: string,
  familyId: string,
  objectId: string,
): Promise<ShareMediaView> {
  const share = await tx.findShare(shareId);
  if (!share || share.familyId !== familyId || !shareIsActive(share)) {
    throw new FamilyError(FAMILY_ERROR.SHARE_NOT_FOUND, 'Share was not found.');
  }
  if (!share.snapshot.media.some((item) => item.objectId === objectId)) {
    throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'This media object is not available.');
  }
  const row = await tx.findMediaObject(objectId);
  if (!row || !(await blobMatches(blobs, row))) {
    throw new FamilyError(FAMILY_ERROR.SHARE_MEDIA_UNAVAILABLE, 'A selected media object is not available.');
  }
  return {
    objectId: row.objectId,
    mimeType: row.mimeType,
    byteLength: row.byteLength,
    contentSha256: row.contentSha256,
  };
}
