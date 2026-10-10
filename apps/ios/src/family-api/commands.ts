import { createFamilyTransferCommands } from './transfer-commands';
import { createInviteLinkCommands, type InviteLinkCommands } from './invite-link-commands';
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
  FamilyListView,
  FamilySummary,
  FamilyHealth,
  FamilyIds,
  FamilyView,
  FamilyRoster,
  Invitation,
  InvitationView,
  MediaObjectView,
  MembershipListView,
  RevokeShareResult,
  ShareMediaView,
  ShareMomentInput,
  ShareView,
  SignInResult,
} from './types';
import type { PasswordHasher } from './password';
import { ARGON2ID_PRODUCTION } from './password';
import {
  assertTestAccountSessionAllowed,
  createTestAccountCommands,
  rejectDisallowedTestAccountSession,
} from './test-account-commands';
import type { MediaBlobStore } from './media-blobs';
import { createMemoryMediaBlobStore } from './media-blobs';
import { createMediaCommands } from './media-commands';
import { createShareCommands, type ShareCommands } from './share-commands';
import { assertHistoryEnabled, HISTORY_CONFIRMATION } from './history-policy';
import { assertMediaPayload } from './media-validate';

export type FamilyCommands = InviteLinkCommands & {
  transfers: ReturnType<typeof createFamilyTransferCommands>;
  historyShares: ShareCommands;
  getFamilyHistoryPolicy(session: string, familyId: string): Promise<{ policy: 'legacy' | 'family-history-v2' }>;
  confirmFamilyHistory(session: string, familyId: string, confirmation: string): Promise<{ policy: 'family-history-v2' }>;
  health(): FamilyHealth;
  signInWithApple(identityToken: string): Promise<SignInResult>;
  signInWithTestAccount(input: { login: string; password: string }): Promise<SignInResult>;
  createTestAccount(login: string, password: string): Promise<{ userId: string; created: true }>;
  disableTestAccount(login: string): Promise<{ disabled: true; userId: string }>;
  listFamilies(sessionToken: string): Promise<FamilyListView>;
  createNamedFamily(sessionToken: string, name: string, idempotencyKey: string): Promise<FamilySummary>;
  createFamily(sessionToken: string, idempotencyKey?: string): Promise<FamilyView>;
  inviteMember(sessionToken: string, familyId: string, idempotencyKey?: string): Promise<InvitationView>;
  revokeInvitation(sessionToken: string, invitationId: string): Promise<InvitationView>;
  acceptInvitation(sessionToken: string, code: string, idempotencyKey?: string): Promise<FamilyView>;
  listMembership(sessionToken: string): Promise<MembershipListView>;
  listPendingInvitations(sessionToken: string, familyId: string): Promise<InvitationView[]>;
  getFamilyRoster(sessionToken: string, familyId: string): Promise<FamilyRoster>;
  leaveSelectedFamily(sessionToken: string, familyId: string, membershipId: string): Promise<{ left: true }>;
  removeSelectedMember(sessionToken: string, familyId: string, userId: string, membershipId: string): Promise<{ removed: true }>;
  leaveFamily(sessionToken: string): Promise<{ left: true }>;
  removeMember(sessionToken: string, familyId: string, userId: string): Promise<{ removed: true }>;
  dissolveFamily(sessionToken: string, familyId: string, membershipId?: string): Promise<{ dissolved: true }>;
  signOut(sessionToken: string): Promise<{ signedOut: true }>;
  uploadMedia(
    sessionToken: string,
    input: { bytes: Uint8Array; mimeType: string; idempotencyKey?: string },
  ): Promise<MediaObjectView>;
  getMediaObject(sessionToken: string, objectId: string): Promise<MediaObjectView>;
  getMediaContent(sessionToken: string, objectId: string): Promise<{ mimeType: string; bytes: Uint8Array }>;
  shareMoment(sessionToken: string, familyId: string, input: ShareMomentInput): Promise<ShareView>;
  revokeShare(sessionToken: string, familyId: string, shareId: string): Promise<RevokeShareResult>;
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

function iso(date: Date) {
  return date.toISOString();
}

function asConstraint(error: unknown): FamilyStoreConstraintError | null {
  return error instanceof FamilyStoreConstraintError ? error : null;
}

async function requireUser(
  tx: FamilyTx,
  sessionToken: string | undefined,
  clock: FamilyClock,
  testAccountLoginEnabled: boolean,
) {
  if (!sessionToken) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Sign in is required.');
  }
  const session = await tx.findSession(sessionToken);
  if (!session || new Date(session.expiresAt).getTime() <= clock.now().getTime()) {
    throw new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.');
  }
  await assertTestAccountSessionAllowed(tx, session.userId, testAccountLoginEnabled);
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

async function requireActiveMembership(tx: FamilyTx, familyId: string, userId: string) {
  await requireActiveFamily(tx, familyId);
  const membership = await tx.findActiveMembership(familyId, userId);
  if (!membership) throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.');
  return membership;
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
  if (hit.body && typeof hit.body === 'object' && 'retired' in hit.body && hit.body.retired === 'family-dissolved') {
    throw new FamilyError(FAMILY_ERROR.FAMILY_DISSOLVED, 'This family has been dissolved.');
  }
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
  mediaBlobs?: MediaBlobStore;
  passwordHasher?: PasswordHasher;
  testAccountLoginEnabled?: boolean;
  inviteLinksEnabled?: boolean;
  historySharingEnabled?: boolean;
}): FamilyCommands {
  const clock = deps.clock ?? createFamilyClock();
  const ids = deps.ids ?? createFamilyIds();
  const inviteTtlMs = deps.inviteTtlMs ?? DEFAULT_INVITE_TTL_MS;
  const sessionTtlMs = deps.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const store = deps.store ?? createFamilyStore();
  const repository = deps.repository ?? createMemoryFamilyRepository(store);
  const blobs = deps.mediaBlobs ?? createMemoryMediaBlobStore();
  const testAccountLoginEnabled = deps.testAccountLoginEnabled === true;
  const media = createMediaCommands({
    repository,
    blobs,
    clock,
    assertPayload: assertMediaPayload,
    testAccountLoginEnabled,
  });
  const shares = createShareCommands({
    repository,
    blobs,
    clock,
    testAccountLoginEnabled,
  });
  const testAccounts = createTestAccountCommands({
    repository,
    clock,
    ids,
    sessionTtlMs,
    passwordHasher: deps.passwordHasher,
    testAccountLoginEnabled,
  });

  function withAuthedUser<T>(
    sessionToken: string | undefined,
    work: (tx: FamilyTx, userId: string) => Promise<T>,
  ) {
    return rejectDisallowedTestAccountSession(
      repository,
      sessionToken,
      clock.now(),
      testAccountLoginEnabled,
    ).then(() =>
      repository.withTransaction(async (tx) => {
        const userId = await requireUser(tx, sessionToken, clock, testAccountLoginEnabled);
        return work(tx, userId);
      }),
    );
  }

  return {
    transfers: createFamilyTransferCommands({authed:withAuthedUser,clock,id:()=>`transfer_${ids.invitationId()}`}),
    historyShares: createShareCommands({ repository, blobs, clock, testAccountLoginEnabled,
      historyPolicy: 'family-history-v2', historyEnabled: deps.historySharingEnabled === true }),
    async getFamilyHistoryPolicy(session, familyId) {
      assertHistoryEnabled(deps.historySharingEnabled === true);
      return withAuthedUser(session, async (tx, userId) => {
        await requireActiveMembership(tx, familyId, userId);
        return { policy: (await tx.findFamily(familyId))?.historyPolicy ?? 'legacy' };
      });
    },
    async confirmFamilyHistory(session, familyId, confirmation) {
      assertHistoryEnabled(deps.historySharingEnabled === true);
      if (confirmation !== HISTORY_CONFIRMATION) throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'Explicit history access confirmation is required.');
      return withAuthedUser(session, async (tx, userId) => {
        const membership = await requireActiveMembership(tx, familyId, userId);
        if (membership.role !== 'creator') throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the creator can confirm history access.');
        const family = (await tx.findFamily(familyId))!;
        if (family.historyPolicy !== 'family-history-v2') {
          await tx.saveFamily({ ...family, historyPolicy: 'family-history-v2', historyConfirmedAt: clock.now().toISOString(), historyConfirmedBy: userId });
          for (const invitation of await tx.listPendingInvitations(familyId)) await tx.saveInvitation({ ...invitation, status: 'revoked' });
          for (const invitation of await tx.listInviteLinks(familyId)) if (invitation.status === 'pending') await tx.saveInviteLink({ ...invitation, status: 'revoked' });
        }
        return { policy: 'family-history-v2' as const };
      });
    },
    ...createInviteLinkCommands({ repository, clock, ids, enabled:deps.inviteLinksEnabled === true, withAuthedUser }),
    health() {
      const testHealth = testAccounts.health();
      return {
        ok: true as const,
        slice: 'identity-membership' as const,
        media: true as const,
        shares: true as const,
        inbox: true as const,
        testAccountLogin: testHealth.testAccountLogin,
        testAccountLoginReason: testHealth.testAccountLoginReason,
        familyHistoryV2: deps.historySharingEnabled === true,
        argon2id: ARGON2ID_PRODUCTION,
      };
    },
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
        return {
          userId: account.userId,
          sessionToken: session.token,
          expiresAt: session.expiresAt,
        };
      });
    },

    listFamilies(sessionToken) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
        const families: FamilySummary[] = [];
        for (const membership of await tx.findMembershipsForUser(userId)) {
          if (membership.status !== 'active') continue;
          const family = await tx.findFamily(membership.familyId);
          if (!family || family.status !== 'active') continue;
          families.push({ familyId: family.familyId, name: family.name || '', role: membership.role,
            memberCount: (await tx.listActiveMembers(family.familyId)).length });
        }
        families.sort((a, b) => a.familyId.localeCompare(b.familyId));
        return { families, limit: 10 as const };
      });
    },
    createNamedFamily(sessionToken, rawName, idempotencyKey) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
        const name = rawName.trim();
        if (!name || Array.from(name).length > 40 || /[\u0000-\u001f\u007f]/.test(name) || !idempotencyKey || idempotencyKey.length > 128) {
          throw new FamilyError(FAMILY_ERROR.BAD_REQUEST, 'A family name (1–40 characters) and operation key are required.');
        }
        const fingerprint = JSON.stringify({ version: 2, name });
        const cached = await readIdempotent<FamilySummary>(tx, userId, 'createNamedFamily', idempotencyKey, fingerprint);
        if (cached) {
          const family = await requireActiveFamily(tx, cached.familyId);
          const member = await tx.findActiveMembership(family.familyId, userId);
          if (!member) throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Membership has ended.');
          return { familyId: family.familyId, name: family.name || '', role: member.role,
            memberCount: (await tx.listActiveMembers(family.familyId)).length };
        }
        let count = 0;
        for (const membership of await tx.findMembershipsForUser(userId)) {
          if (membership.status === 'active' && (await tx.findFamily(membership.familyId))?.status === 'active') count++;
        }
        if (count >= 10) throw new FamilyError(FAMILY_ERROR.FAMILY_LIMIT_REACHED, 'You can belong to at most 10 active families.');
        const now = iso(clock.now());
        const familyId = ids.familyId();
        await tx.saveFamily({ familyId, name, createdAt: now, status: 'active', historyPolicy: deps.historySharingEnabled ? 'family-history-v2' : 'legacy' });
        await tx.saveMembership({ membershipId: ids.membershipId(), familyId, userId, role: 'creator', status: 'active', joinedAt: now });
        return writeIdempotent(tx, userId, 'createNamedFamily', idempotencyKey, fingerprint,
          { familyId, name, role: 'creator' as const, memberCount: 1 });
      });
    },

    createFamily(sessionToken, idempotencyKey) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
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
      return withAuthedUser(sessionToken, async (tx, userId) => {
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
      return withAuthedUser(sessionToken, async (tx, userId) => {
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
      return withAuthedUser(sessionToken, async (tx, userId) => {
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
      return withAuthedUser(sessionToken, async (tx, userId) => {
        const membership = await tx.findActiveMembershipForUser(userId);
        if (!membership) return { family: null };
        return { family: await toFamilyView(tx, membership.familyId, userId) };
      });
    },

    listPendingInvitations(sessionToken, familyId) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
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

    getFamilyRoster(sessionToken, familyId) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
        await requireActiveFamily(tx, familyId);
        const membership = await tx.findActiveMembership(familyId, userId);
        if (!membership) throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.');
        const rows = await tx.listActiveMembers(familyId);
        return { familyId, role: membership.role, membershipId: membership.membershipId,
          members: rows.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.membershipId.localeCompare(b.membershipId))
            .map(row => ({ membershipId: row.membershipId, userId: row.userId, role: row.role, joinedAt: row.joinedAt })) };
      });
    },
    leaveSelectedFamily(sessionToken, familyId, membershipId) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
        await requireActiveFamily(tx, familyId);
        const active = await tx.findActiveMembership(familyId, userId);
        if (active && active.membershipId !== membershipId) throw new FamilyError(FAMILY_ERROR.CONFLICT, 'Membership changed.');
        if (!active) {
          const prior = (await tx.findMembershipsInFamily(familyId, userId)).find(row => row.membershipId === membershipId);
          if (prior?.status === 'left' || prior?.status === 'removed') return { left: true as const };
          throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.');
        }
        if (active.role === 'creator') throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'The creator cannot leave.');
        active.status = 'left'; await tx.saveMembership(active);
        return { left: true as const };
      });
    },
    removeSelectedMember(sessionToken, familyId, targetUserId, membershipId) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
        await requireActiveFamily(tx, familyId);
        await requireActiveCreator(tx, familyId, userId, 'Only the creator can remove a member.');
        if (targetUserId === userId) throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Cannot remove yourself.');
        const active = await tx.findActiveMembership(familyId, targetUserId);
        if (active && active.membershipId !== membershipId) throw new FamilyError(FAMILY_ERROR.CONFLICT, 'Membership changed.');
        if (!active) {
          const prior = (await tx.findMembershipsInFamily(familyId, targetUserId)).find(row => row.membershipId === membershipId);
          if (prior?.status === 'removed' || prior?.status === 'left') return { removed: true as const };
          throw new FamilyError(FAMILY_ERROR.MEMBER_NOT_FOUND, 'Member not found.');
        }
        if (active.role === 'creator') throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Cannot remove the creator.');
        active.status = 'removed'; await tx.saveMembership(active);
        return { removed: true as const };
      });
    },

    leaveFamily(sessionToken) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
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
      return withAuthedUser(sessionToken, async (tx, userId) => {
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

    dissolveFamily(sessionToken, familyId, membershipId) {
      return withAuthedUser(sessionToken, async (tx, userId) => {
        const family = await tx.findFamily(familyId);
        if (!family) {
          throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Family was not found.');
        }
        if (family.status === 'dissolved') {
          const wasCreator = family.dissolvedBy === userId || (!family.dissolvedBy && (await tx.findMembership(familyId, userId))?.role === 'creator');
          if (!wasCreator) {
            throw new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can dissolve the family.');
          }
          return { dissolved: true as const };
        }
        await requireActiveCreator(tx, familyId, userId, 'Only the family creator can dissolve the family.');
        const creator = await tx.findActiveMembership(familyId, userId);
        if (membershipId && creator?.membershipId !== membershipId) throw new FamilyError(FAMILY_ERROR.CONFLICT, 'Membership changed.');
        const dissolvedAt = clock.now().toISOString();
        family.status = 'dissolved';
        family.dissolvedAt = dissolvedAt;
        family.cleanupDeadline = new Date(Date.parse(dissolvedAt) + 30 * 24 * 60 * 60 * 1000).toISOString();
        family.dissolvedBy = userId;
        await tx.saveFamily(family);
        for (const invite of await tx.listInviteLinks(familyId)) {
          if (invite.status === 'pending') await tx.saveInviteLink({ ...invite, status: 'revoked' });
        }
        for (const invite of await tx.listPendingInvitations(familyId)) {
          await tx.saveInvitation({ ...invite, status: 'revoked' });
        }
        for (const transfer of await tx.listTransfers(familyId)) {
          if (transfer.status === 'pending') await tx.saveTransfer({ ...transfer, status: 'invalid', revision: transfer.revision + 1, updatedAt: dissolvedAt });
        }
        for (const row of await tx.listActiveMembers(familyId)) {
          row.status = 'removed';
          await tx.saveMembership(row);
        }
        return { dissolved: true as const };
      });
    },

    signInWithTestAccount(input) {
      return testAccounts.signInWithTestAccount(input);
    },
    createTestAccount(login, password) {
      return testAccounts.createTestAccount(login, password);
    },
    disableTestAccount(login) {
      return testAccounts.disableTestAccount(login);
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

    uploadMedia(sessionToken, input) {
      return media.uploadMedia(sessionToken, input);
    },
    getMediaObject(sessionToken, objectId) {
      return media.getMediaObject(sessionToken, objectId);
    },
    getMediaContent(sessionToken, objectId) {
      return media.getMediaContent(sessionToken, objectId);
    },
    shareMoment(sessionToken, familyId, input) {
      return shares.shareMoment(sessionToken, familyId, input);
    },
    revokeShare(sessionToken, familyId, shareId) {
      return shares.revokeShare(sessionToken, familyId, shareId);
    },
    listVisibleShares(sessionToken, familyId) {
      return shares.listVisibleShares(sessionToken, familyId);
    },
    getShare(sessionToken, familyId, shareId) {
      return shares.getShare(sessionToken, familyId, shareId);
    },
    getShareMedia(sessionToken, familyId, shareId, objectId) {
      return shares.getShareMedia(sessionToken, familyId, shareId, objectId);
    },
    getShareMediaContent(sessionToken, familyId, shareId, objectId) {
      return shares.getShareMediaContent(sessionToken, familyId, shareId, objectId);
    },
  };
}
