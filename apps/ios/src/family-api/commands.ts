import { FAMILY_ERROR, FamilyError } from './errors';
import {
  fingerprintAcceptInvitation,
  fingerprintCreateFamily,
  fingerprintInviteMember,
  idempotencyStoreKey,
  readIdempotent,
  writeIdempotent,
} from './idempotency';
import { DEFAULT_INVITE_TTL_MS, DEFAULT_SESSION_TTL_MS, createFamilyClock, createFamilyIds } from './ids';
import {
  findActiveCreator,
  findActiveMembership,
  findActiveMembershipForUser,
  findFamily,
  findInvitationByCode,
  findInvitationById,
  findSession,
  findAccountByAppleSubject,
  listActiveMembers,
  type FamilyStore,
} from './store';
import type {
  AppleVerifier,
  FamilyClock,
  FamilyIds,
  FamilyView,
  InvitationView,
  MembershipListView,
  SignInResult,
} from './types';

export type FamilyCommands = {
  signInWithApple(identityToken: string): Promise<SignInResult>;
  createFamily(sessionToken: string, idempotencyKey?: string): FamilyView;
  inviteMember(sessionToken: string, familyId: string, idempotencyKey?: string): InvitationView;
  revokeInvitation(sessionToken: string, invitationId: string): InvitationView;
  acceptInvitation(sessionToken: string, code: string, idempotencyKey?: string): FamilyView;
  listMembership(sessionToken: string): MembershipListView;
  leaveFamily(sessionToken: string): { left: true };
  removeMember(sessionToken: string, familyId: string, userId: string): { removed: true };
  dissolveFamily(sessionToken: string, familyId: string): { dissolved: true };
};

function iso(date: Date) {
  return date.toISOString();
}

function requireUser(store: FamilyStore, sessionToken: string | undefined, clock: FamilyClock) {
  if (!sessionToken) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Sign in is required.');
  }
  const session = findSession(store, sessionToken);
  if (!session || new Date(session.expiresAt).getTime() <= clock.now().getTime()) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.');
  }
  return session.userId;
}

function requireActiveFamily(store: FamilyStore, familyId: string) {
  const family = findFamily(store, familyId);
  if (!family) {
    throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Family was not found.');
  }
  if (family.status === 'dissolved') {
    throw new FamilyError(FAMILY_ERROR.FAMILY_DISSOLVED, 'This family has been dissolved.');
  }
  return family;
}

function toFamilyView(store: FamilyStore, familyId: string, userId: string): FamilyView {
  const membership = findActiveMembership(store, familyId, userId);
  if (!membership) {
    throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.');
  }
  return {
    familyId,
    role: membership.role,
    members: listActiveMembers(store, familyId)
      .slice()
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .map((row) => ({
        userId: row.userId,
        role: row.role,
        joinedAt: row.joinedAt,
      })),
  };
}

function toInvitationView(invitation: NonNullable<ReturnType<typeof findInvitationById>>): InvitationView {
  return {
    invitationId: invitation.invitationId,
    familyId: invitation.familyId,
    code: invitation.code,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
  };
}

function expireInvitationIfNeeded(invitation: NonNullable<ReturnType<typeof findInvitationByCode>>, now: Date) {
  if (invitation.status === 'pending' && new Date(invitation.expiresAt).getTime() <= now.getTime()) {
    invitation.status = 'expired';
  }
  return invitation;
}

function requireActiveCreator(store: FamilyStore, familyId: string, userId: string, message: string) {
  if (!findActiveCreator(store, familyId, userId)) {
    throw new FamilyError(FAMILY_ERROR.FORBIDDEN, message);
  }
}

function replayCreateFamily(store: FamilyStore, cached: FamilyView, userId: string): FamilyView {
  const family = findFamily(store, cached.familyId);
  if (!family || family.status === 'dissolved') {
    throw new FamilyError(FAMILY_ERROR.FAMILY_DISSOLVED, 'This family has been dissolved.');
  }
  return toFamilyView(store, cached.familyId, userId);
}

function replayInviteMember(
  store: FamilyStore,
  cached: InvitationView,
  userId: string,
  familyId: string,
  now: Date,
): InvitationView {
  requireActiveFamily(store, familyId);
  requireActiveCreator(store, familyId, userId, 'Only the family creator can invite members.');
  const invitation = findInvitationById(store, cached.invitationId);
  if (!invitation || invitation.familyId !== familyId) {
    throw new FamilyError(FAMILY_ERROR.CONFLICT, 'Idempotency key was reused with a different request.');
  }
  expireInvitationIfNeeded(invitation, now);
  return toInvitationView(invitation);
}

export function createFamilyCommands(deps: {
  store: FamilyStore;
  apple: AppleVerifier;
  clock?: FamilyClock;
  ids?: FamilyIds;
  inviteTtlMs?: number;
  sessionTtlMs?: number;
}): FamilyCommands {
  const clock = deps.clock ?? createFamilyClock();
  const ids = deps.ids ?? createFamilyIds();
  const inviteTtlMs = deps.inviteTtlMs ?? DEFAULT_INVITE_TTL_MS;
  const sessionTtlMs = deps.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const { store } = deps;

  return {
    async signInWithApple(identityToken: string) {
      if (!identityToken.trim()) {
        throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token is invalid.');
      }
      const identity = await deps.apple.verifyIdentityToken(identityToken);
      if (!identity.appleSubject) {
        throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token subject is missing.');
      }
      let account = findAccountByAppleSubject(store, identity.appleSubject);
      if (!account) {
        account = {
          userId: ids.userId(),
          appleSubject: identity.appleSubject,
          email: identity.email,
          createdAt: iso(clock.now()),
        };
        store.accounts.push(account);
      }
      const session = {
        token: ids.sessionToken(),
        userId: account.userId,
        expiresAt: iso(new Date(clock.now().getTime() + sessionTtlMs)),
      };
      store.sessions.push(session);
      return {
        userId: account.userId,
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      };
    },

    createFamily(sessionToken, idempotencyKey) {
      const userId = requireUser(store, sessionToken, clock);
      const fingerprint = fingerprintCreateFamily();
      const key = idempotencyStoreKey(userId, 'createFamily', idempotencyKey);
      const cached = readIdempotent<FamilyView>(store, key, fingerprint);
      if (cached) return replayCreateFamily(store, cached, userId);
      const existing = findActiveMembershipForUser(store, userId);
      if (existing) {
        throw new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.');
      }
      const now = iso(clock.now());
      const familyId = ids.familyId();
      store.families.push({ familyId, createdAt: now, status: 'active' });
      store.memberships.push({
        membershipId: ids.membershipId(),
        familyId,
        userId,
        role: 'creator',
        status: 'active',
        joinedAt: now,
      });
      return writeIdempotent(store, key, fingerprint, toFamilyView(store, familyId, userId));
    },

    inviteMember(sessionToken, familyId, idempotencyKey) {
      const userId = requireUser(store, sessionToken, clock);
      const fingerprint = fingerprintInviteMember(familyId);
      const key = idempotencyStoreKey(userId, 'inviteMember', idempotencyKey);
      const cached = readIdempotent<InvitationView>(store, key, fingerprint);
      if (cached) return replayInviteMember(store, cached, userId, familyId, clock.now());
      requireActiveFamily(store, familyId);
      requireActiveCreator(store, familyId, userId, 'Only the family creator can invite members.');
      const now = clock.now();
      const invitation = {
        invitationId: ids.invitationId(),
        familyId,
        code: ids.invitationCode(),
        status: 'pending' as const,
        createdAt: iso(now),
        expiresAt: iso(new Date(now.getTime() + inviteTtlMs)),
      };
      store.invitations.push(invitation);
      return writeIdempotent(store, key, fingerprint, toInvitationView(invitation));
    },

    revokeInvitation(sessionToken, invitationId) {
      const userId = requireUser(store, sessionToken, clock);
      const invitation = findInvitationById(store, invitationId);
      if (!invitation) {
        throw new FamilyError(FAMILY_ERROR.INVITE_NOT_FOUND, 'Invitation was not found.');
      }
      requireActiveFamily(store, invitation.familyId);
      requireActiveCreator(store, invitation.familyId, userId, 'Only the family creator can revoke an invitation.');
      if (invitation.status === 'pending') {
        invitation.status = 'revoked';
      }
      return toInvitationView(invitation);
    },

    acceptInvitation(sessionToken, code, idempotencyKey) {
      const userId = requireUser(store, sessionToken, clock);
      const fingerprint = fingerprintAcceptInvitation(code);
      const key = idempotencyStoreKey(userId, 'acceptInvitation', idempotencyKey);
      const cached = readIdempotent<FamilyView>(store, key, fingerprint);
      if (cached) {
        requireActiveFamily(store, cached.familyId);
        return toFamilyView(store, cached.familyId, userId);
      }
      const invitation = findInvitationByCode(store, code);
      if (!invitation) {
        throw new FamilyError(FAMILY_ERROR.INVITE_NOT_FOUND, 'Invitation was not found.');
      }
      expireInvitationIfNeeded(invitation, clock.now());
      if (invitation.status === 'revoked') {
        throw new FamilyError(FAMILY_ERROR.INVITE_REVOKED, 'This invitation was revoked.');
      }
      if (invitation.status === 'expired') {
        throw new FamilyError(FAMILY_ERROR.INVITE_EXPIRED, 'This invitation has expired.');
      }
      if (invitation.status === 'accepted') {
        if (invitation.acceptedByUserId === userId) {
          const family = requireActiveFamily(store, invitation.familyId);
          return writeIdempotent(store, key, fingerprint, toFamilyView(store, family.familyId, userId));
        }
        throw new FamilyError(FAMILY_ERROR.INVITE_ALREADY_USED, 'This invitation was already used.');
      }
      const family = requireActiveFamily(store, invitation.familyId);
      const existing = findActiveMembershipForUser(store, userId);
      if (existing) {
        throw new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.');
      }
      const now = iso(clock.now());
      invitation.status = 'accepted';
      invitation.acceptedByUserId = userId;
      store.memberships.push({
        membershipId: ids.membershipId(),
        familyId: family.familyId,
        userId,
        role: 'member',
        status: 'active',
        joinedAt: now,
      });
      return writeIdempotent(store, key, fingerprint, toFamilyView(store, family.familyId, userId));
    },

    listMembership(sessionToken) {
      const userId = requireUser(store, sessionToken, clock);
      const membership = findActiveMembershipForUser(store, userId);
      if (!membership) return { family: null };
      return { family: toFamilyView(store, membership.familyId, userId) };
    },

    leaveFamily(sessionToken) {
      const userId = requireUser(store, sessionToken, clock);
      const membership = findActiveMembershipForUser(store, userId);
      if (!membership) {
        const prior = store.memberships.find((row) => row.userId === userId && row.status === 'left');
        if (prior) return { left: true as const };
        throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of a family.');
      }
      if (membership.role === 'creator') {
        throw new FamilyError(
          FAMILY_ERROR.FORBIDDEN,
          'The creator must transfer the creator role or dissolve the family before leaving.',
        );
      }
      membership.status = 'left';
      return { left: true as const };
    },

    removeMember(sessionToken, familyId, targetUserId) {
      const userId = requireUser(store, sessionToken, clock);
      requireActiveFamily(store, familyId);
      requireActiveCreator(store, familyId, userId, 'Only the family creator can remove a member.');
      if (targetUserId === userId) {
        throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'The creator cannot remove themselves.');
      }
      const target = findActiveMembership(store, familyId, targetUserId);
      if (!target) {
        const prior = store.memberships.find(
          (row) => row.familyId === familyId && row.userId === targetUserId && row.status === 'removed',
        );
        if (prior) return { removed: true as const };
        throw new FamilyError(FAMILY_ERROR.MEMBER_NOT_FOUND, 'That member is not in this family.');
      }
      target.status = 'removed';
      return { removed: true as const };
    },

    dissolveFamily(sessionToken, familyId) {
      const userId = requireUser(store, sessionToken, clock);
      const family = findFamily(store, familyId);
      if (!family) {
        throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Family was not found.');
      }
      if (family.status === 'dissolved') {
        const wasCreator = store.memberships.some(
          (row) => row.familyId === familyId && row.userId === userId && row.role === 'creator',
        );
        if (!wasCreator) {
          throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can dissolve the family.');
        }
        return { dissolved: true as const };
      }
      requireActiveCreator(store, familyId, userId, 'Only the family creator can dissolve the family.');
      family.status = 'dissolved';
      for (const row of store.memberships) {
        if (row.familyId === familyId && row.status === 'active') {
          row.status = 'removed';
        }
      }
      return { dissolved: true as const };
    },
  };
}
