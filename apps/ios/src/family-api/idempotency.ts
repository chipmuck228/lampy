import { FAMILY_ERROR, FamilyError } from './errors';
import type { FamilyStore, IdempotentRecord } from './store';

function fnv1aHex(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function digestStable(value: string) {
  return fnv1aHex(value);
}

export function fingerprintCreateFamily() {
  return digestStable('CreateFamily:v1');
}

export function fingerprintInviteMember(familyId: string) {
  return digestStable(`InviteMember:v1:familyId=${familyId}`);
}

export function fingerprintAcceptInvitation(code: string) {
  return digestStable(`AcceptInvitation:v1:code=${digestStable(code)}`);
}

export function canonicalizeShareSnapshot(input: {
  note: string;
  emotion: string;
  occurredAt?: string;
  occurredAtPrecision: string;
  mediaObjectIds: readonly string[];
}) {
  return JSON.stringify({
    note: input.note,
    emotion: input.emotion,
    occurredAt: input.occurredAt || '',
    occurredAtPrecision: input.occurredAtPrecision,
    mediaObjectIds: [...input.mediaObjectIds],
  });
}

export function fingerprintShareMoment(input: {
  familyId: string;
  sourceMomentId: string;
  sourceRevision: number;
  snapshotCanonical: string;
}) {
  return digestStable(
    `ShareMoment:v1:familyId=${input.familyId}:moment=${digestStable(input.sourceMomentId)}:rev=${input.sourceRevision}:snap=${digestStable(input.snapshotCanonical)}`,
  );
}

export function idempotencyStoreKey(userId: string, command: string, idempotencyKey: string | undefined) {
  if (!idempotencyKey) return undefined;
  return `${userId}:${command}:${idempotencyKey}`;
}

export function readIdempotent<T>(
  store: FamilyStore,
  key: string | undefined,
  requestFingerprint: string,
): T | undefined {
  if (!key) return undefined;
  const hit = store.idempotency.get(key);
  if (!hit) return undefined;
  if (hit.requestFingerprint !== requestFingerprint) {
    throw new FamilyError(
      FAMILY_ERROR.CONFLICT,
      'Idempotency key was reused with a different request.',
    );
  }
  return hit.body as T;
}

export function writeIdempotent<T>(
  store: FamilyStore,
  key: string | undefined,
  requestFingerprint: string,
  body: T,
  status = 200,
): T {
  if (key) {
    const record: IdempotentRecord = { requestFingerprint, status, body };
    store.idempotency.set(key, record);
  }
  return body;
}
