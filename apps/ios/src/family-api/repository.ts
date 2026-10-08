import { FamilyError, FAMILY_ERROR } from './errors';
import type {
  Account,
  AuthRateLimit,
  Family,
  Invitation,
  MediaObjectRecord,
  Membership,
  Session,
  ShareRecord,
  TestCredential,
} from './types';
import type { FamilyStore, IdempotentRecord } from './store';
import {
  findAccountByAppleSubject,
  findActiveMembership,
  findActiveMembershipForUser,
  findFamily,
  findInvitationByCode,
  findInvitationById,
  findSession,
  listActiveMembers,
} from './store';

export type FamilyTx = {
  findAccountByAppleSubject(appleSubject: string): Promise<Account | null>;
  findAccountByUserId(userId: string): Promise<Account | null>;
  saveAccount(account: Account): Promise<void>;
  findSession(token: string): Promise<Session | null>;
  saveSession(session: Session): Promise<void>;
  deleteSession(token: string): Promise<void>;
  deleteOtherSessions(userId: string, keepToken: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
  findTestCredentialByLogin(loginNormalized: string): Promise<TestCredential | null>;
  findTestCredentialByUserId(userId: string): Promise<TestCredential | null>;
  saveTestCredential(credential: TestCredential): Promise<void>;
  findRateLimit(bucket: string): Promise<AuthRateLimit | null>;
  saveRateLimit(row: AuthRateLimit): Promise<void>;
  findFamily(familyId: string): Promise<Family | null>;
  saveFamily(family: Family): Promise<void>;
  findActiveMembershipForUser(userId: string): Promise<Membership | null>;
  findActiveMembership(familyId: string, userId: string): Promise<Membership | null>;
  findMembership(familyId: string, userId: string): Promise<Membership | null>;
  findMembershipsInFamily(familyId: string, userId: string): Promise<Membership[]>;
  findMembershipsForUser(userId: string): Promise<Membership[]>;
  listActiveMembers(familyId: string): Promise<Membership[]>;
  saveMembership(membership: Membership): Promise<void>;
  findInvitationByCode(code: string): Promise<Invitation | null>;
  findInvitationById(invitationId: string): Promise<Invitation | null>;
  listPendingInvitations(familyId: string): Promise<Invitation[]>;
  saveInvitation(invitation: Invitation): Promise<void>;
  claimPendingInvitation(invitationId: string, acceptedByUserId: string): Promise<Invitation | null>;
  findIdempotent(userId: string, command: string, idempotencyKey: string): Promise<IdempotentRecord | null>;
  saveIdempotent(
    userId: string,
    command: string,
    idempotencyKey: string,
    record: IdempotentRecord,
  ): Promise<void>;
  findMediaObject(objectId: string): Promise<MediaObjectRecord | null>;
  findMediaByOwnerHash(ownerUserId: string, contentSha256: string): Promise<MediaObjectRecord | null>;
  saveMediaObject(object: MediaObjectRecord): Promise<void>;
  findShare(shareId: string): Promise<ShareRecord | null>;
  findShareBySource(
    familyId: string,
    authorUserId: string,
    sourceMomentId: string,
    sourceRevision: number,
  ): Promise<ShareRecord | null>;
  listSharesInFamily(familyId: string): Promise<ShareRecord[]>;
  saveShare(share: ShareRecord): Promise<void>;
};

export type FamilyRepository = {
  withTransaction<T>(work: (tx: FamilyTx) => Promise<T>): Promise<T>;
};

export class FamilyStoreConstraintError extends Error {
  constructor(
    readonly constraint:
      | 'active_membership'
      | 'invitation_code'
      | 'apple_subject'
      | 'test_login'
      | 'test_user'
      | 'idempotency'
      | 'media_hash'
      | 'share_revision',
  ) {
    super(constraint);
    this.name = 'FamilyStoreConstraintError';
  }
}

function replaceBy<T>(rows: T[], keyOf: (row: T) => string, next: T) {
  const key = keyOf(next);
  const index = rows.findIndex((row) => keyOf(row) === key);
  if (index >= 0) rows[index] = next;
  else rows.push(next);
}

export function createMemoryFamilyRepository(store: FamilyStore): FamilyRepository {
  let chain = Promise.resolve();
  const tx: FamilyTx = {
    async findAccountByAppleSubject(appleSubject) {
      return findAccountByAppleSubject(store, appleSubject);
    },
    async findAccountByUserId(userId) {
      return store.accounts.find((row) => row.userId === userId) ?? null;
    },
    async saveAccount(account) {
      if (
        account.appleSubject &&
        store.accounts.some((row) => row.appleSubject === account.appleSubject && row.userId !== account.userId)
      ) {
        throw new FamilyStoreConstraintError('apple_subject');
      }
      replaceBy(store.accounts, (row) => row.userId, account);
    },
    async findSession(token) {
      return findSession(store, token);
    },
    async saveSession(session) {
      replaceBy(store.sessions, (row) => row.token, session);
    },
    async deleteSession(token) {
      store.sessions = store.sessions.filter((row) => row.token !== token);
    },
    async deleteOtherSessions(userId, keepToken) {
      store.sessions = store.sessions.filter((row) => row.userId !== userId || row.token === keepToken);
    },
    async deleteSessionsForUser(userId) {
      store.sessions = store.sessions.filter((row) => row.userId !== userId);
    },
    async findTestCredentialByLogin(loginNormalized) {
      return store.testCredentials.find((row) => row.loginNormalized === loginNormalized) ?? null;
    },
    async findTestCredentialByUserId(userId) {
      return store.testCredentials.find((row) => row.userId === userId) ?? null;
    },
    async saveTestCredential(credential) {
      if (
        store.testCredentials.some(
          (row) => row.loginNormalized === credential.loginNormalized && row.credentialId !== credential.credentialId,
        )
      ) {
        throw new FamilyStoreConstraintError('test_login');
      }
      if (
        store.testCredentials.some(
          (row) => row.userId === credential.userId && row.credentialId !== credential.credentialId,
        )
      ) {
        throw new FamilyStoreConstraintError('test_user');
      }
      replaceBy(store.testCredentials, (row) => row.credentialId, credential);
    },
    async findRateLimit(bucket) {
      return store.rateLimits.find((row) => row.bucket === bucket) ?? null;
    },
    async saveRateLimit(row) {
      replaceBy(store.rateLimits, (item) => item.bucket, row);
    },
    async findFamily(familyId) {
      return findFamily(store, familyId);
    },
    async saveFamily(family) {
      replaceBy(store.families, (row) => row.familyId, family);
    },
    async findActiveMembershipForUser(userId) {
      const rows = store.memberships.filter(row => row.userId === userId && row.status === 'active' && store.families.some(f => f.familyId === row.familyId && f.status === 'active'));
      if (rows.length > 1) throw new FamilyError(FAMILY_ERROR.FAMILY_SELECTION_REQUIRED, 'Choose a family with the updated app.');
      return findActiveMembershipForUser(store, userId);
    },
    async findActiveMembership(familyId, userId) {
      return findActiveMembership(store, familyId, userId);
    },
    async findMembership(familyId, userId) {
      const rows = store.memberships.filter((row) => row.familyId === familyId && row.userId === userId);
      return rows.find((row) => row.status === 'active') ?? rows[rows.length - 1] ?? null;
    },
    async findMembershipsInFamily(familyId, userId) {
      return store.memberships.filter((row) => row.familyId === familyId && row.userId === userId);
    },
    async findMembershipsForUser(userId) {
      return store.memberships.filter((row) => row.userId === userId);
    },
    async listActiveMembers(familyId) {
      return listActiveMembers(store, familyId);
    },
    async saveMembership(membership) {
      const conflict = store.memberships.find(
        (row) =>
          row.userId === membership.userId &&
          row.familyId === membership.familyId &&
          row.status === 'active' &&
          membership.status === 'active' &&
          row.membershipId !== membership.membershipId,
      );
      if (conflict) throw new FamilyStoreConstraintError('active_membership');
      if (membership.status === 'active' && membership.role === 'creator' && store.memberships.some(row =>
        row.familyId === membership.familyId && row.role === 'creator' && row.status === 'active' && row.membershipId !== membership.membershipId)) {
        throw new FamilyStoreConstraintError('active_membership');
      }
      replaceBy(store.memberships, (row) => row.membershipId, membership);
    },
    async findInvitationByCode(code) {
      return findInvitationByCode(store, code);
    },
    async findInvitationById(invitationId) {
      return findInvitationById(store, invitationId);
    },
    async listPendingInvitations(familyId) {
      return store.invitations.filter((row) => row.familyId === familyId && row.status === 'pending');
    },
    async saveInvitation(invitation) {
      if (store.invitations.some((row) => row.code === invitation.code && row.invitationId !== invitation.invitationId)) {
        throw new FamilyStoreConstraintError('invitation_code');
      }
      replaceBy(store.invitations, (row) => row.invitationId, invitation);
    },
    async claimPendingInvitation(invitationId, acceptedByUserId) {
      const invitation = findInvitationById(store, invitationId);
      if (!invitation || invitation.status !== 'pending') return null;
      invitation.status = 'accepted';
      invitation.acceptedByUserId = acceptedByUserId;
      return invitation;
    },
    async findIdempotent(userId, command, idempotencyKey) {
      return store.idempotency.get(`${userId}:${command}:${idempotencyKey}`) ?? null;
    },
    async saveIdempotent(userId, command, idempotencyKey, record) {
      const key = `${userId}:${command}:${idempotencyKey}`;
      if (store.idempotency.has(key)) throw new FamilyStoreConstraintError('idempotency');
      store.idempotency.set(key, record);
    },
    async findMediaObject(objectId) {
      return store.mediaObjects.find((row) => row.objectId === objectId) ?? null;
    },
    async findMediaByOwnerHash(ownerUserId, contentSha256) {
      return (
        store.mediaObjects.find((row) => row.ownerUserId === ownerUserId && row.contentSha256 === contentSha256) ?? null
      );
    },
    async saveMediaObject(object) {
      if (
        store.mediaObjects.some(
          (row) =>
            row.ownerUserId === object.ownerUserId &&
            row.contentSha256 === object.contentSha256 &&
            row.objectId !== object.objectId,
        )
      ) {
        throw new FamilyStoreConstraintError('media_hash');
      }
      replaceBy(store.mediaObjects, (row) => row.objectId, object);
    },
    async findShare(shareId) {
      return store.shares.find((row) => row.shareId === shareId) ?? null;
    },
    async findShareBySource(familyId, authorUserId, sourceMomentId, sourceRevision) {
      return (
        store.shares.find(
          (row) =>
            row.familyId === familyId &&
            row.authorUserId === authorUserId &&
            row.sourceMomentId === sourceMomentId &&
            row.sourceRevision === sourceRevision,
        ) ?? null
      );
    },
    async listSharesInFamily(familyId) {
      return store.shares
        .filter((row) => row.familyId === familyId)
        .slice()
        .sort((left, right) => right.sharedAt.localeCompare(left.sharedAt));
    },
    async saveShare(share) {
      if (
        store.shares.some(
          (row) =>
            row.familyId === share.familyId &&
            row.authorUserId === share.authorUserId &&
            row.sourceMomentId === share.sourceMomentId &&
            row.sourceRevision === share.sourceRevision &&
            row.shareId !== share.shareId,
        )
      ) {
        throw new FamilyStoreConstraintError('share_revision');
      }
      replaceBy(store.shares, (row) => row.shareId, share);
    },
  };

  return {
    withTransaction(work) {
      const run = chain.then(() => work(tx));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
