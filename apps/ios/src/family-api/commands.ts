import { FAMILY_ERROR, FamilyError } from './errors';
import {
  fingerprintAcceptInvitation,
  fingerprintCreateFamily,
  fingerprintInviteMember,
} from './idempotency';
import { DEFAULT_INVITE_TTL_MS, DEFAULT_SESSION_TTL_MS, createFamilyClock, createFamilyIds } from './ids';
import { createMemoryFamilyRepository, FamilyStoreConstraintError, type FamilyRepository, type FamilyTx } from './repository';
import { createFamilyStore, type FamilyStore, type IdempotentRecord } from './store';
import type {
  AppleVerifier,
  FamilyClock,
  FamilyIds,
  FamilyView,
  Invitation,
  InvitationView,
  MembershipListView,
  SignInResult,
} from './types';

export type FamilyCommands = {
  signInWithApple(identityToken: string): Promise<SignInResult>;
  createFamily(sessionToken: string, idempotencyKey?: string): Promise<FamilyView>;
  inviteMember(sessionToken: string, familyId: string, idempotencyKey?: string): Promise<InvitationView>;
  revokeInvitation(sessionToken: string, invitationId: string): Promise<InvitationView>;
  acceptInvitation(sessionToken: string, code: string, idempotencyKey?: string): Promise<FamilyView>;
  listMembership(sessionToken: string): Promise<MembershipListView>;
  listPendingInvitations(sessionToken: string, familyId: string): Promise<InvitationView[]>;
  leaveFamily(sessionToken: string): Promise<{ left: true }>;
  removeMember(sessionToken: string, familyId: string, userId: string): Promise<{ removed: true }>;
  dissolveFamily(sessionToken: string, familyId: string): Promise<{ dissolved: true }>;
  signOut(sessionToken: string): Promise<{ signedOut: true }>;
};

function iso(date: Date) {
  return date.toISOString();
}

function asConstraint(error: unknown): FamilyStoreConstraintError | null {
  return error instanceof FamilyStoreConstraintError ? error : null;
}

async function requireUser(tx: FamilyTx, sessionToken: string | undefined, clock: FamilyClock) {
  if (!sessionToken) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Sign in is required.');
  }
  const session = await tx.findSession(sessionToken);
  if (!session || new Date(session.expiresAt).getTime() <= clock.now().getTime()) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.');
  }
  return session.userId;
}

async function requireActiveFamily(tx: FamilyTx, familyId: string) {
  const family = await tx.findFamily(familyId);
  if (!family) {
    throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Family was not found.');
  }
  if (family.status === 'dissolved') {
    throw new FamilyError(FAMILY_ERROR.FAMILY_DISSOLVED, 'This family has been dissolved.');
  }
  return family;
}

async function toFamilyView(tx: FamilyTx, familyId: string, userId: string): Promise<FamilyView> {
  const membership = await tx.findActiveMembership(familyId, userId);
  if (!membership) {
    throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.');
  }
  const members = await tx.listActiveMembers(familyId);
  return {
    familyId,
    role: membership.role,
    members: members
      .slice()
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .map((row) => ({
        userId: row.userId,
        role: row.role,
        joinedAt: row.joinedAt,
      })),
  };
}

function toInvitationView(invitation: Invitation): InvitationView {
  return {
    invitationId: invitation.invitationId,
    familyId: invitation.familyId,
    code: invitation.code,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
  };
}

async function expireInvitationIfNeeded(tx: FamilyTx, invitation: Invitation, now: Date) {
  if (invitation.status === 'pending' && new Date(invitation.expiresAt).getTime() <= now.getTime()) {
    invitation.status = 'expired';
    await tx.saveInvitation(invitation);
  }
  return invitation;
}

async function requireActiveCreator(tx: FamilyTx, familyId: string, userId: string, message: string) {
  const membership = await tx.findActiveMembership(familyId, userId);
  if (membership?.role !== 'creator') {
    throw new FamilyError(FAMILY_ERROR.FORBIDDEN, message);
  }
}

async function readIdempotent<T>(
  tx: FamilyTx,
  userId: string,
  command: string,
  idempotencyKey: string | undefined,
  requestFingerprint: string,
): Promise<T | undefined> {
  if (!idempotencyKey) return undefined;
  const hit = await tx.findIdempotent(userId, command, idempotencyKey);
  if (!hit) return undefined;
  if (hit.requestFingerprint !== requestFingerprint) {
    throw new FamilyError(FAMILY_ERROR.CONFLICT, 'Idempotency key was reused with a different request.');
  }
  return hit.body as T;
}

async function writeIdempotent<T>(
  tx: FamilyTx,
  userId: string,
  command: string,
  idempotencyKey: string | undefined,
  requestFingerprint: string,
  body: T,
): Promise<T> {
  if (!idempotencyKey) return body;
  const record: IdempotentRecord = { requestFingerprint, status: 200, body };
  try {
    await tx.saveIdempotent(userId, command, idempotencyKey, record);
    return body;
  } catch (error) {
    if (asConstraint(error)?.constraint !== 'idempotency') throw error;
    const existing = await readIdempotent<T>(tx, userId, command, idempotencyKey, requestFingerprint);
    if (existing) return existing;
    throw error;
  }
}

async function replayCreateFamily(tx: FamilyTx, cached: FamilyView, userId: string): Promise<FamilyView> {
  const family = await tx.findFamily(cached.familyId);
  if (!family || family.status === 'dissolved') {
    throw new FamilyError(FAMILY_ERROR.FAMILY_DISSOLVED, 'This family has been dissolved.');
  }
  return toFamilyView(tx, cached.familyId, userId);
}

async function replayInviteMember(
  tx: FamilyTx,
  cached: InvitationView,
  userId: string,
  familyId: string,
  now: Date,
): Promise<InvitationView> {
  await requireActiveFamily(tx, familyId);
  await requireActiveCreator(tx, familyId, userId, 'Only the family creator can invite members.');
  const invitation = await tx.findInvitationById(cached.invitationId);
  if (!invitation || invitation.familyId !== familyId) {
    throw new FamilyError(FAMILY_ERROR.CONFLICT, 'Idempotency key was reused with a different request.');
  }
  await expireInvitationIfNeeded(tx, invitation, now);
  return toInvitationView(invitation);
}

export function createFamilyCommands(deps: {
  store?: FamilyStore;
  repository?: FamilyRepository;
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
  const store = deps.store ?? createFamilyStore();
  const repository = deps.repository ?? createMemoryFamilyRepository(store);

  return {
    async signInWithApple(identityToken: string) {
      if (!identityToken.trim()) {
        throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token is invalid.');
      }
      const identity = await deps.apple.verifyIdentityToken(identityToken);
      if (!identity.appleSubject) {
        throw new FamilyError(FAMILY_ERROR.APPLE_TOKEN_INVALID, 'Apple identity token subject is missing.');
      }
      return repository.withTransaction(async (tx) => {
        let account = await tx.findAccountByAppleSubject(identity.appleSubject);
        if (!account) {
          account = {
            userId: ids.userId(),
            appleSubject: identity.appleSubject,
            email: identity.email,
            createdAt: iso(clock.now()),
          };
          await tx.saveAccount(account);
        }
        const session = {
          token: ids.sessionToken(),
          userId: account.userId,
          expiresAt: iso(new Date(clock.now().getTime() + sessionTtlMs)),
        };
        await tx.saveSession(session);
        await tx.deleteOtherSessions(account.userId, session.token);
        return {
          userId: account.userId,
          sessionToken: session.token,
          expiresAt: session.expiresAt,
        };
      });
    },

    createFamily(sessionToken, idempotencyKey) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        const fingerprint = fingerprintCreateFamily();
        const cached = await readIdempotent<FamilyView>(tx, userId, 'createFamily', idempotencyKey, fingerprint);
        if (cached) return replayCreateFamily(tx, cached, userId);
        const existing = await tx.findActiveMembershipForUser(userId);
        if (existing) {
          throw new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.');
        }
        const now = iso(clock.now());
        const familyId = ids.familyId();
        await tx.saveFamily({ familyId, createdAt: now, status: 'active' });
        try {
          await tx.saveMembership({
            membershipId: ids.membershipId(),
            familyId,
            userId,
            role: 'creator',
            status: 'active',
            joinedAt: now,
          });
        } catch (error) {
          if (asConstraint(error)?.constraint === 'active_membership') {
            throw new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.');
          }
          throw error;
        }
        return writeIdempotent(tx, userId, 'createFamily', idempotencyKey, fingerprint, await toFamilyView(tx, familyId, userId));
      });
    },

    inviteMember(sessionToken, familyId, idempotencyKey) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        const fingerprint = fingerprintInviteMember(familyId);
        const cached = await readIdempotent<InvitationView>(tx, userId, 'inviteMember', idempotencyKey, fingerprint);
        if (cached) return replayInviteMember(tx, cached, userId, familyId, clock.now());
        await requireActiveFamily(tx, familyId);
        await requireActiveCreator(tx, familyId, userId, 'Only the family creator can invite members.');
        const now = clock.now();
        const invitation = {
          invitationId: ids.invitationId(),
          familyId,
          code: ids.invitationCode(),
          status: 'pending' as const,
          createdAt: iso(now),
          expiresAt: iso(new Date(now.getTime() + inviteTtlMs)),
        };
        await tx.saveInvitation(invitation);
        return writeIdempotent(tx, userId, 'inviteMember', idempotencyKey, fingerprint, toInvitationView(invitation));
      });
    },

    revokeInvitation(sessionToken, invitationId) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        const invitation = await tx.findInvitationById(invitationId);
        if (!invitation) {
          throw new FamilyError(FAMILY_ERROR.INVITE_NOT_FOUND, 'Invitation was not found.');
        }
        await requireActiveFamily(tx, invitation.familyId);
        await requireActiveCreator(tx, invitation.familyId, userId, 'Only the family creator can revoke an invitation.');
        if (invitation.status === 'pending') {
          invitation.status = 'revoked';
          await tx.saveInvitation(invitation);
        }
        return toInvitationView(invitation);
      });
    },

    acceptInvitation(sessionToken, code, idempotencyKey) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        const fingerprint = fingerprintAcceptInvitation(code);
        const cached = await readIdempotent<FamilyView>(tx, userId, 'acceptInvitation', idempotencyKey, fingerprint);
        if (cached) {
          await requireActiveFamily(tx, cached.familyId);
          return toFamilyView(tx, cached.familyId, userId);
        }
        const invitation = await tx.findInvitationByCode(code);
        if (!invitation) {
          throw new FamilyError(FAMILY_ERROR.INVITE_NOT_FOUND, 'Invitation was not found.');
        }
        await expireInvitationIfNeeded(tx, invitation, clock.now());
        if (invitation.status === 'revoked') {
          throw new FamilyError(FAMILY_ERROR.INVITE_REVOKED, 'This invitation was revoked.');
        }
        if (invitation.status === 'expired') {
          throw new FamilyError(FAMILY_ERROR.INVITE_EXPIRED, 'This invitation has expired.');
        }
        if (invitation.status === 'accepted') {
          if (invitation.acceptedByUserId === userId) {
            const family = await requireActiveFamily(tx, invitation.familyId);
            return writeIdempotent(
              tx,
              userId,
              'acceptInvitation',
              idempotencyKey,
              fingerprint,
              await toFamilyView(tx, family.familyId, userId),
            );
          }
          throw new FamilyError(FAMILY_ERROR.INVITE_ALREADY_USED, 'This invitation was already used.');
        }
        const family = await requireActiveFamily(tx, invitation.familyId);
        const existing = await tx.findActiveMembershipForUser(userId);
        if (existing) {
          throw new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.');
        }
        const claimed = await tx.claimPendingInvitation(invitation.invitationId, userId);
        if (!claimed) {
          throw new FamilyError(FAMILY_ERROR.INVITE_ALREADY_USED, 'This invitation was already used.');
        }
        const now = iso(clock.now());
        try {
          await tx.saveMembership({
            membershipId: ids.membershipId(),
            familyId: family.familyId,
            userId,
            role: 'member',
            status: 'active',
            joinedAt: now,
          });
        } catch (error) {
          if (asConstraint(error)?.constraint === 'active_membership') {
            throw new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.');
          }
          throw error;
        }
        return writeIdempotent(
          tx,
          userId,
          'acceptInvitation',
          idempotencyKey,
          fingerprint,
          await toFamilyView(tx, family.familyId, userId),
        );
      });
    },

    listMembership(sessionToken) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        const membership = await tx.findActiveMembershipForUser(userId);
        if (!membership) return { family: null };
        return { family: await toFamilyView(tx, membership.familyId, userId) };
      });
    },

    listPendingInvitations(sessionToken, familyId) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        await requireActiveFamily(tx, familyId);
        await requireActiveCreator(tx, familyId, userId, 'Only the family creator can list invitations.');
        const now = clock.now();
        const pending = await tx.listPendingInvitations(familyId);
        const views: InvitationView[] = [];
        for (const invitation of pending) {
          await expireInvitationIfNeeded(tx, invitation, now);
          if (invitation.status === 'pending') views.push(toInvitationView(invitation));
        }
        return views;
      });
    },

    leaveFamily(sessionToken) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        const membership = await tx.findActiveMembershipForUser(userId);
        if (!membership) {
          const prior = (await tx.findMembershipsForUser(userId)).find((row) => row.status === 'left');
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
        await tx.saveMembership(membership);
        return { left: true as const };
      });
    },

    removeMember(sessionToken, familyId, targetUserId) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        await requireActiveFamily(tx, familyId);
        await requireActiveCreator(tx, familyId, userId, 'Only the family creator can remove a member.');
        if (targetUserId === userId) {
          throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'The creator cannot remove themselves.');
        }
        const target = await tx.findActiveMembership(familyId, targetUserId);
        if (!target) {
          const prior = await tx.findMembershipsInFamily(familyId, targetUserId);
          if (prior.some((row) => row.status === 'removed')) return { removed: true as const };
          throw new FamilyError(FAMILY_ERROR.MEMBER_NOT_FOUND, 'That member is not in this family.');
        }
        target.status = 'removed';
        await tx.saveMembership(target);
        return { removed: true as const };
      });
    },

    dissolveFamily(sessionToken, familyId) {
      return repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock);
        const family = await tx.findFamily(familyId);
        if (!family) {
          throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Family was not found.');
        }
        if (family.status === 'dissolved') {
          const wasCreator = (await tx.findMembership(familyId, userId))?.role === 'creator';
          if (!wasCreator) {
            throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can dissolve the family.');
          }
          return { dissolved: true as const };
        }
        await requireActiveCreator(tx, familyId, userId, 'Only the family creator can dissolve the family.');
        family.status = 'dissolved';
        await tx.saveFamily(family);
        for (const row of await tx.listActiveMembers(familyId)) {
          row.status = 'removed';
          await tx.saveMembership(row);
        }
        return { dissolved: true as const };
      });
    },

    signOut(sessionToken) {
      return repository.withTransaction(async (tx) => {
        if (!sessionToken) {
          throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Sign in is required.');
        }
        await tx.deleteSession(sessionToken);
        return { signedOut: true as const };
      });
    },
  };
}
