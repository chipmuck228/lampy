import { FAMILY_ERROR, FamilyError } from './errors';
import { fingerprintUploadMedia, sha256MediaBytes } from './media-validate';
import type { FamilyRepository, FamilyTx } from './repository';
import { FamilyStoreConstraintError } from './repository';
import type { MediaBlobStore } from './media-blobs';
import type { MediaObjectRecord, MediaObjectView } from './types';

export type MediaCommands = {
  uploadMedia(
    sessionToken: string,
    input: { bytes: Uint8Array; mimeType: string; idempotencyKey?: string },
  ): Promise<MediaObjectView>;
  getMediaObject(sessionToken: string, objectId: string): Promise<MediaObjectView>;
  getMediaContent(sessionToken: string, objectId: string): Promise<{ mimeType: string; bytes: Uint8Array }>;
};

function toView(row: MediaObjectRecord): MediaObjectView {
  return {
    objectId: row.objectId,
    ownerUserId: row.ownerUserId,
    mimeType: row.mimeType,
    byteLength: row.byteLength,
    createdAt: row.createdAt,
  };
}

function newObjectId() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `med_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
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

async function requireOwnedMedia(tx: FamilyTx, sessionToken: string, objectId: string, now: Date) {
  const userId = await requireUser(tx, sessionToken, now);
  const row = await tx.findMediaObject(objectId);
  if (!row) {
    throw new FamilyError(FAMILY_ERROR.MEDIA_NOT_FOUND, 'Media object was not found.');
  }
  if (row.ownerUserId !== userId) {
    throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'This media object is not available.');
  }
  return row;
}

export function createMediaCommands(deps: {
  repository: FamilyRepository;
  blobs: MediaBlobStore;
  clock?: { now: () => Date };
  objectId?: () => string;
  assertPayload: (bytes: Uint8Array | undefined, mime: string | undefined) => string;
}): MediaCommands {
  const clock = deps.clock ?? { now: () => new Date() };

  return {
    async uploadMedia(sessionToken, input) {
      const mime = deps.assertPayload(input.bytes, input.mimeType);
      const bytes = input.bytes;
      const sha256 = sha256MediaBytes(bytes);
      const fingerprint = fingerprintUploadMedia(sha256, mime, bytes.length);

      const prepared = await deps.repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock.now());
        if (input.idempotencyKey) {
          const existing = await tx.findIdempotent(userId, 'uploadMedia', input.idempotencyKey);
          if (existing) {
            if (existing.requestFingerprint !== fingerprint) {
              throw new FamilyError(FAMILY_ERROR.CONFLICT, 'Idempotency key was reused with a different request.');
            }
            return { kind: 'replay' as const, view: existing.body as MediaObjectView };
          }
        }
        const sameHash = await tx.findMediaByOwnerHash(userId, sha256);
        if (sameHash) {
          if (input.idempotencyKey) {
            await tx.saveIdempotent(userId, 'uploadMedia', input.idempotencyKey, {
              requestFingerprint: fingerprint,
              status: 200,
              body: toView(sameHash),
            });
          }
          return { kind: 'replay' as const, view: toView(sameHash) };
        }
        return { kind: 'create' as const, userId };
      });
      if (prepared.kind === 'replay') return prepared.view;

      const objectId = (deps.objectId ?? newObjectId)();
      const row: MediaObjectRecord = {
        objectId,
        ownerUserId: prepared.userId,
        mimeType: mime,
        byteLength: bytes.length,
        contentSha256: sha256,
        storageKey: objectId,
        createdAt: clock.now().toISOString(),
      };
      try {
        await deps.blobs.write(row.storageKey, bytes);
      } catch (error) {
        if (error instanceof FamilyError) throw error;
        throw new FamilyError(FAMILY_ERROR.MEDIA_WRITE_FAILED, 'Media could not be stored.');
      }
      try {
        await deps.repository.withTransaction(async (tx) => {
          const userId = await requireUser(tx, sessionToken, clock.now());
          if (userId !== prepared.userId) {
            throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.');
          }
          const raced = await tx.findMediaByOwnerHash(userId, sha256);
          if (raced) {
            if (input.idempotencyKey) {
              await tx.saveIdempotent(userId, 'uploadMedia', input.idempotencyKey, {
                requestFingerprint: fingerprint,
                status: 200,
                body: toView(raced),
              });
            }
            row.objectId = raced.objectId;
            row.storageKey = raced.storageKey;
            row.createdAt = raced.createdAt;
            return;
          }
          try {
            await tx.saveMediaObject(row);
          } catch (error) {
            if (error instanceof FamilyStoreConstraintError && error.constraint === 'media_hash') {
              const existing = await tx.findMediaByOwnerHash(userId, sha256);
              if (existing) {
                row.objectId = existing.objectId;
                row.storageKey = existing.storageKey;
                row.createdAt = existing.createdAt;
                return;
              }
            }
            throw new FamilyError(FAMILY_ERROR.MEDIA_WRITE_FAILED, 'Media metadata could not be stored.');
          }
          if (input.idempotencyKey) {
            await tx.saveIdempotent(userId, 'uploadMedia', input.idempotencyKey, {
              requestFingerprint: fingerprint,
              status: 200,
              body: toView(row),
            });
          }
        });
      } catch (error) {
        await deps.blobs.remove(objectId);
        if (error instanceof FamilyError) throw error;
        throw new FamilyError(FAMILY_ERROR.MEDIA_WRITE_FAILED, 'Media metadata could not be stored.');
      }
      if (row.storageKey !== objectId) {
        await deps.blobs.remove(objectId);
      }
      return toView(row);
    },

    async getMediaObject(sessionToken, objectId) {
      return deps.repository.withTransaction(async (tx) => {
        return toView(await requireOwnedMedia(tx, sessionToken, objectId, clock.now()));
      });
    },

    async getMediaContent(sessionToken, objectId) {
      const row = await deps.repository.withTransaction(async (tx) => {
        return requireOwnedMedia(tx, sessionToken, objectId, clock.now());
      });
      const bytes = await deps.blobs.read(row.storageKey);
      if (bytes.length !== row.byteLength) {
        throw new FamilyError(FAMILY_ERROR.MEDIA_NOT_FOUND, 'Media object was not found.');
      }
      return { mimeType: row.mimeType, bytes };
    },
  };
}
