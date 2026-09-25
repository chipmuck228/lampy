import type { Account, Family, Invitation, MediaObjectRecord, Membership, Session } from './types';

export type IdempotentRecord = {
  requestFingerprint: string;
  status: number;
  body: unknown;
};

export type FamilyStore = {
  accounts: Account[];
  sessions: Session[];
  families: Family[];
  memberships: Membership[];
  invitations: Invitation[];
  mediaObjects: MediaObjectRecord[];
  idempotency: Map<string, IdempotentRecord>;
};

export function createFamilyStore(): FamilyStore {
  return {
    accounts: [],
    sessions: [],
    families: [],
    memberships: [],
    invitations: [],
    mediaObjects: [],
    idempotency: new Map(),
  };
}

export function findAccountByAppleSubject(store: FamilyStore, appleSubject: string) {
  return store.accounts.find((account) => account.appleSubject === appleSubject) ?? null;
}

export function findAccountByUserId(store: FamilyStore, userId: string) {
  return store.accounts.find((account) => account.userId === userId) ?? null;
}

export function findSession(store: FamilyStore, token: string) {
  return store.sessions.find((session) => session.token === token) ?? null;
}

export function findFamily(store: FamilyStore, familyId: string) {
  return store.families.find((family) => family.familyId === familyId) ?? null;
}

export function findActiveMembershipForUser(store: FamilyStore, userId: string) {
  return (
    store.memberships.find((row) => {
      if (row.userId !== userId || row.status !== 'active') return false;
      const family = findFamily(store, row.familyId);
      return family?.status === 'active';
    }) ?? null
  );
}

export function findActiveMembership(store: FamilyStore, familyId: string, userId: string) {
  const family = findFamily(store, familyId);
  if (!family || family.status !== 'active') return null;
  return (
    store.memberships.find(
      (row) => row.familyId === familyId && row.userId === userId && row.status === 'active',
    ) ?? null
  );
}

export function findActiveCreator(store: FamilyStore, familyId: string, userId: string) {
  const membership = findActiveMembership(store, familyId, userId);
  return membership?.role === 'creator' ? membership : null;
}

export function listActiveMembers(store: FamilyStore, familyId: string) {
  return store.memberships.filter((row) => row.familyId === familyId && row.status === 'active');
}

export function findInvitationByCode(store: FamilyStore, code: string) {
  return store.invitations.find((row) => row.code === code) ?? null;
}

export function findInvitationById(store: FamilyStore, invitationId: string) {
  return store.invitations.find((row) => row.invitationId === invitationId) ?? null;
}
