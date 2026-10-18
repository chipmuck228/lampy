import {purgeMemoryAccount} from './account-purge-memory';
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
  purgeAccount(userId:string):Promise<void>;
  isMediaStorageKeyLive(key:string):Promise<boolean>;
  enqueueAccountMediaCleanup(key:string):Promise<void>;
  listAccountMediaCleanup():Promise<string[]>;
  completeAccountMediaCleanup(key:string):Promise<void>;
  purchaseToken(userId:string):Promise<string|null>;
  savePurchaseToken(userId:string,token:string):Promise<void>;
  findPurchase(key:string):Promise<import('./purchase-types').PurchaseRecord|null>;
  listPurchases(userId:string):Promise<import('./purchase-types').PurchaseRecord[]>;
  savePurchase(row:import('./purchase-types').PurchaseRecord):Promise<void>;
  listPurchaseGrants(familyId:string):Promise<import('./purchase-types').FamilyPurchaseGrant[]>;
  savePurchaseGrant(row:import('./purchase-types').FamilyPurchaseGrant):Promise<void>;
  listFamilyAlbums(familyId:string): Promise<import('./family-album-types').FamilyAlbumRecord[]>;
  findFamilyAlbum(albumId:string): Promise<import('./family-album-types').FamilyAlbumRecord | null>;
  saveFamilyAlbum(album:import('./family-album-types').FamilyAlbumRecord): Promise<void>;
  findFamilyAlbumNotice(familyId:string,membershipId:string): Promise<import('./family-album-types').FamilyAlbumNotice | null>;
  saveFamilyAlbumNotice(notice:import('./family-album-types').FamilyAlbumNotice): Promise<void>;
  findAppleChallenge(id: string): Promise<import('./types').AppleChallenge | null>;
  saveAppleChallenge(challenge: import('./types').AppleChallenge): Promise<void>;
  deleteAppleChallenge(id: string): Promise<void>;
  pruneAppleChallenges(now: string): Promise<void>;

  findLoginIdentity(provider: import('./types').LoginProvider, subject: string): Promise<import('./types').LoginIdentity | null>;
  listLoginIdentities(userId: string): Promise<import('./types').LoginIdentity[]>;
  // Internal persistence only: callers must verify credentials before attaching an identity.
  attachLoginIdentity(identity: import('./types').LoginIdentity): Promise<void>;
  findProfile(userId: string): Promise<import('./types').UserProfile | null>;
  saveProfile(profile: import('./types').UserProfile): Promise<void>;
  listPastFamilies(userId: string): Promise<import('./types').PastFamilySummary[]>;
  listSharesReferencingMedia(objectId: string): Promise<ShareRecord[]>;
  listTransfers(familyId: string): Promise<import('./types').FamilyTransfer[]>;
  saveTransfer(transfer: import('./types').FamilyTransfer): Promise<void>;
  findInviteLinkByHash(hash: string): Promise<import('./types').InviteLink | null>;
  findInviteLinkById(id: string): Promise<import('./types').InviteLink | null>;
  listInviteLinks(familyId: string): Promise<import('./types').InviteLink[]>;
  saveInviteLink(invite: import('./types').InviteLink): Promise<void>;
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
      | 'login_identity'
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
    async purgeAccount(userId) {purgeMemoryAccount(store,userId);},
    async isMediaStorageKeyLive(key) {return store.mediaObjects.some(r=>r.storageKey===key);},
    async enqueueAccountMediaCleanup(key) {if(!store.accountMediaCleanup.includes(key))store.accountMediaCleanup.push(key);},
    async listAccountMediaCleanup() {return [...store.accountMediaCleanup].slice(0,100);},
    async completeAccountMediaCleanup(key) {store.accountMediaCleanup=store.accountMediaCleanup.filter(k=>k!==key);},
    async purchaseToken(userId) {return store.purchaseTokens.find(r=>r.userId===userId)?.token??null;},
    async savePurchaseToken(userId,token) {replaceBy(store.purchaseTokens,r=>r.userId,{userId,token});},
    async findPurchase(key) {const r=store.purchases.find(r=>r.key===key);return r?{...r}:null;},
    async listPurchases(userId) {return store.purchases.filter(r=>r.userId===userId).map(r=>({...r}));},
    async savePurchase(row) {const old=store.purchases.find(r=>r.key===row.key);if(old&&old.userId!==row.userId)throw new FamilyError('PURCHASE_ACCOUNT_MISMATCH','Purchase is bound to another account.');if(old&&row.signedAt<old.signedAt)return;replaceBy(store.purchases,r=>r.key,{...row,revoked:!!old?.revoked&&row.signedAt<=old.signedAt||row.revoked});},
    async listPurchaseGrants(familyId) {return store.purchaseGrants.filter(r=>r.familyId===familyId).map(r=>({...r}));},
    async savePurchaseGrant(row) {replaceBy(store.purchaseGrants,r=>r.familyId+':'+r.purchaseKey,{...row});},
    async listFamilyAlbums(familyId) { return store.familyAlbums.filter(row=>row.familyId===familyId).map(row=>({...row,shareIds:[...row.shareIds],...(row.coverChoice?{coverChoice:{...row.coverChoice}}:{})})); },
    async findFamilyAlbum(id) { const row=store.familyAlbums.find(row=>row.albumId===id);return row?{...row,shareIds:[...row.shareIds],...(row.coverChoice?{coverChoice:{...row.coverChoice}}:{})}:null; },
    async saveFamilyAlbum(row) { replaceBy(store.familyAlbums,row=>row.albumId,{...row,shareIds:[...row.shareIds],...(row.coverChoice?{coverChoice:{...row.coverChoice}}:{})}); },
    async findFamilyAlbumNotice(familyId,membershipId) { return store.familyAlbumNotices.find(row=>row.familyId===familyId&&row.membershipId===membershipId)??null; },
    async saveFamilyAlbumNotice(row) { replaceBy(store.familyAlbumNotices,row=>`${row.familyId}:${row.membershipId}`,{...row}); },
    async findAppleChallenge(id) { return store.appleChallenges.find(c => c.id === id) ?? null; },
    async saveAppleChallenge(c) { store.appleChallenges.push({...c}); },
    async deleteAppleChallenge(id) { store.appleChallenges = store.appleChallenges.filter(c => c.id !== id); },
    async pruneAppleChallenges(now) { store.appleChallenges = store.appleChallenges.filter(c => c.expiresAt > now); },
    async findLoginIdentity(provider, subject) {
      return store.loginIdentities.find(i => i.provider === provider && i.subject === subject) ?? null;
    },
    async listLoginIdentities(userId) { return store.loginIdentities.filter(i => i.userId === userId); },
    async attachLoginIdentity(identity) {
      if (!['apple', 'controlled-password'].includes(identity.provider) || !identity.subject.trim() || !store.accounts.some(a => a.userId === identity.userId)) throw new FamilyStoreConstraintError('login_identity');
      if (store.loginIdentities.some(i => i.provider === identity.provider &&
        ((i.subject === identity.subject && i.userId !== identity.userId) || (i.userId === identity.userId && i.subject !== identity.subject)))) {
        throw new FamilyStoreConstraintError('login_identity');
      }
      if (!store.loginIdentities.some(i => i.provider === identity.provider && i.subject === identity.subject)) store.loginIdentities.push({ ...identity });
    },
    async findProfile(userId) { return store.profiles.find(p => p.userId === userId) ?? null; },
    async saveProfile(profile) { replaceBy(store.profiles,p => p.userId,profile); },
    async listPastFamilies(userId) { return store.directoryHistory.filter(row => row.userId === userId).map(row => ({ familyId: row.familyId, name: row.name, createdAt: row.createdAt, role: row.role, status: row.status })); },
    async listSharesReferencingMedia(objectId) { return store.shares.filter(s => s.snapshot.media.some(m => m.objectId === objectId)); },
    async listTransfers(familyId) { return store.transfers.filter(row => row.familyId === familyId); },
    async saveTransfer(transfer) { replaceBy(store.transfers, row => row.transferId, transfer); },
    async findInviteLinkByHash(hash) { return store.inviteLinks.find(i => i.tokenHash === hash) ?? null; },
    async findInviteLinkById(id) { return store.inviteLinks.find(i => i.invitationId === id) ?? null; },
    async listInviteLinks(familyId) { return store.inviteLinks.filter(i => i.familyId === familyId); },
    async saveInviteLink(invite) { replaceBy(store.inviteLinks, i => i.invitationId, invite); },
    async findAccountByAppleSubject(appleSubject) {
      const identity = await tx.findLoginIdentity('apple', appleSubject);
      return identity ? await tx.findAccountByUserId(identity.userId) : findAccountByAppleSubject(store, appleSubject);
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
      if (account.appleSubject !== undefined && !account.appleSubject.trim()) throw new FamilyStoreConstraintError('login_identity');
      const previous = store.accounts.find(a => a.userId === account.userId);
      if (previous?.appleSubject && account.appleSubject !== previous.appleSubject) throw new FamilyStoreConstraintError('login_identity');
      if (account.appleSubject) {
        // Check conflicts before mutating the account (memory repository has no rollback).
        if (store.loginIdentities.some(i => i.provider === 'apple' &&
          ((i.subject === account.appleSubject && i.userId !== account.userId) || (i.userId === account.userId && i.subject !== account.appleSubject)))) throw new FamilyStoreConstraintError('login_identity');
      }
      replaceBy(store.accounts, (row) => row.userId, account);
      if (account.appleSubject) await tx.attachLoginIdentity({ provider: 'apple', subject: account.appleSubject, userId: account.userId, createdAt: account.createdAt });
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
      const previous = store.testCredentials.find(c => c.credentialId === credential.credentialId);
      if (previous && (previous.userId !== credential.userId || previous.loginNormalized !== credential.loginNormalized)) throw new FamilyStoreConstraintError('login_identity');
      await tx.attachLoginIdentity({ provider: 'controlled-password', subject: credential.loginNormalized, userId: credential.userId, createdAt: credential.createdAt });
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
      if (family.status === 'dissolved') for (const row of store.directoryHistory) {
        if (row.familyId === family.familyId) row.status = 'dissolved';
      }
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
      const family = findFamily(store, membership.familyId);
      store.directoryHistory = store.directoryHistory.filter(row => row.userId !== membership.userId || row.familyId !== membership.familyId);
      if (family && (membership.status !== 'active' || family.status === 'dissolved')) {
        store.directoryHistory.push({ userId: membership.userId, familyId: membership.familyId, name: family.name || '', createdAt: family.createdAt, role: membership.role,
          status: family.status === 'dissolved' ? 'dissolved' : membership.status === 'left' ? 'left' : 'removed' });
      }
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
