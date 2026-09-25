import { createMapAppleVerifier, createAppleJwksVerifier } from './apple';
import { createFamilyCommands } from './commands';
import { FAMILY_ERROR, FamilyError } from './errors';
import {
  fingerprintAcceptInvitation,
  fingerprintCreateFamily,
  fingerprintInviteMember,
} from './idempotency';
import { createFamilyStore } from './store';
import type { FamilyIds } from './types';

function encodeJson(value: unknown) {
  const json = JSON.stringify(value);
  let binary = '';
  for (let i = 0; i < json.length; i += 1) {
    binary += String.fromCharCode(json.charCodeAt(i));
  }
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function idsWith(seq: { n: number }): FamilyIds {
  const next = (prefix: string) => {
    seq.n += 1;
    return `${prefix}_${seq.n}`;
  };
  return {
    userId: () => next('usr'),
    familyId: () => next('fam'),
    membershipId: () => next('mem'),
    invitationId: () => next('inv'),
    invitationCode: () => next('code'),
    sessionToken: () => next('ses'),
  };
}

function setup(nowIso = '2026-09-25T02:00:00.000Z') {
  const seq = { n: 0 };
  const store = createFamilyStore();
  const clock = { now: () => new Date(nowIso) };
  const commands = createFamilyCommands({
    store,
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice', email: 'alice@example.com' },
      apple_bob: { appleSubject: 'apple.bob' },
      apple_cara: { appleSubject: 'apple.cara' },
    }),
    clock,
    ids: idsWith(seq),
    inviteTtlMs: 60_000,
  });
  return { commands, store, clock, seq };
}

async function signIn(commands: ReturnType<typeof createFamilyCommands>, token: string) {
  return commands.signInWithApple(token);
}

describe('family identity and membership commands', () => {
  it('assigns a stable userId from Apple subject and does not create membership', async () => {
    const { commands } = setup();
    const first = await signIn(commands, 'apple_alice');
    const second = await signIn(commands, 'apple_alice');
    expect(first.userId).toBe(second.userId);
    expect(first.sessionToken).not.toBe(second.sessionToken);
    await expect(commands.listMembership(first.sessionToken)).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
    expect((await commands.listMembership(second.sessionToken)).family).toBeNull();
  });

  it('revokes only that account\'s previous sessions after a successful sign-in', async () => {
    const { commands } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    await commands.createFamily(alice.sessionToken);
    const aliceAgain = await signIn(commands, 'apple_alice');
    await expect(commands.listMembership(alice.sessionToken)).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
    expect((await commands.listMembership(aliceAgain.sessionToken)).family?.role).toBe('creator');
    expect((await commands.listMembership(bob.sessionToken)).family).toBeNull();
  });

  it('does not revoke an existing session when Apple verification fails', async () => {
    const { commands } = setup();
    const alice = await signIn(commands, 'apple_alice');
    await commands.createFamily(alice.sessionToken);
    await expect(commands.signInWithApple('nope')).rejects.toMatchObject({
      code: FAMILY_ERROR.APPLE_TOKEN_INVALID,
    });
    expect((await commands.listMembership(alice.sessionToken)).family?.role).toBe('creator');
  });

  it('rejects an invalid Apple token', async () => {
    const { commands } = setup();
    await expect(commands.signInWithApple('nope')).rejects.toMatchObject({
      code: FAMILY_ERROR.APPLE_TOKEN_INVALID,
    });
  });

  it('revokes the session token on sign-out', async () => {
    const { commands } = setup();
    const alice = await signIn(commands, 'apple_alice');
    await commands.createFamily(alice.sessionToken);
    expect(await commands.signOut(alice.sessionToken)).toEqual({ signedOut: true });
    await expect(commands.listMembership(alice.sessionToken)).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
    expect(await commands.signOut(alice.sessionToken)).toEqual({ signedOut: true });
  });

  it('creates a family once and rejects a second family for the same account', async () => {
    const { commands } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const family = await commands.createFamily(alice.sessionToken, 'create-1');
    expect(family.role).toBe('creator');
    expect(family.members).toHaveLength(1);
    expect((await commands.createFamily(alice.sessionToken, 'create-1')).familyId).toBe(family.familyId);
    await expect(commands.createFamily(alice.sessionToken, 'create-2')).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.'),
    );
  });

  it('lets a logged-in member accept a pending invite and hides nothing as success on expired or revoked codes', async () => {
    const { commands, clock } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const cara = await signIn(commands, 'apple_cara');
    const family = await commands.createFamily(alice.sessionToken);
    const invite = await commands.inviteMember(alice.sessionToken, family.familyId, 'invite-1');
    expect((await commands.inviteMember(alice.sessionToken, family.familyId, 'invite-1')).code).toBe(invite.code);

    const joined = await commands.acceptInvitation(bob.sessionToken, invite.code, 'accept-1');
    expect(joined.role).toBe('member');
    expect(joined.members.map((row) => row.userId).sort()).toEqual([alice.userId, bob.userId].sort());
    expect((await commands.acceptInvitation(bob.sessionToken, invite.code, 'accept-1')).familyId).toBe(family.familyId);

    await expect(commands.acceptInvitation(cara.sessionToken, invite.code)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.INVITE_ALREADY_USED, 'This invitation was already used.'),
    );

    const revoked = await commands.inviteMember(alice.sessionToken, family.familyId);
    await commands.revokeInvitation(alice.sessionToken, revoked.invitationId);
    await expect(commands.acceptInvitation(cara.sessionToken, revoked.code)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.INVITE_REVOKED, 'This invitation was revoked.'),
    );
    expect((await commands.revokeInvitation(alice.sessionToken, revoked.invitationId)).status).toBe('revoked');

    const expiring = await commands.inviteMember(alice.sessionToken, family.familyId);
    clock.now = () => new Date('2026-09-25T02:02:00.000Z');
    await expect(commands.acceptInvitation(cara.sessionToken, expiring.code)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.INVITE_EXPIRED, 'This invitation has expired.'),
    );
  });

  it('rejects unauthenticated, already-in-family, and non-creator invite or remove', async () => {
    const { commands } = setup();
    await expect(commands.createFamily('')).rejects.toThrow(FamilyError);
    await expect(commands.listMembership('missing')).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.'),
    );

    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const cara = await signIn(commands, 'apple_cara');
    const family = await commands.createFamily(alice.sessionToken);
    const invite = await commands.inviteMember(alice.sessionToken, family.familyId);
    await commands.acceptInvitation(bob.sessionToken, invite.code);

    await expect(commands.inviteMember(bob.sessionToken, family.familyId)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can invite members.'),
    );
    await expect(commands.removeMember(bob.sessionToken, family.familyId, alice.userId)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can remove a member.'),
    );
    await expect(commands.dissolveFamily(bob.sessionToken, family.familyId)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can dissolve the family.'),
    );
    await expect(commands.createFamily(bob.sessionToken)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.'),
    );

    const other = await commands.createFamily(cara.sessionToken);
    const laterInvite = await commands.inviteMember(alice.sessionToken, family.familyId);
    await expect(commands.acceptInvitation(cara.sessionToken, laterInvite.code)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.'),
    );
    expect(other.familyId).not.toBe(family.familyId);
  });

  it('lets a member leave and a creator remove or dissolve without inventing leftover access', async () => {
    const { commands } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const family = await commands.createFamily(alice.sessionToken);
    const invite = await commands.inviteMember(alice.sessionToken, family.familyId);
    await commands.acceptInvitation(bob.sessionToken, invite.code);

    await expect(commands.leaveFamily(alice.sessionToken)).rejects.toThrow(FamilyError);
    expect(await commands.leaveFamily(bob.sessionToken)).toEqual({ left: true });
    expect(await commands.leaveFamily(bob.sessionToken)).toEqual({ left: true });
    expect((await commands.listMembership(bob.sessionToken)).family).toBeNull();
    expect((await commands.listMembership(alice.sessionToken)).family?.members).toHaveLength(1);

    const rejoin = await commands.inviteMember(alice.sessionToken, family.familyId);
    await commands.acceptInvitation(bob.sessionToken, rejoin.code);
    expect(await commands.removeMember(alice.sessionToken, family.familyId, bob.userId)).toEqual({ removed: true });
    expect(await commands.removeMember(alice.sessionToken, family.familyId, bob.userId)).toEqual({ removed: true });
    expect((await commands.listMembership(bob.sessionToken)).family).toBeNull();

    expect(await commands.dissolveFamily(alice.sessionToken, family.familyId)).toEqual({ dissolved: true });
    expect(await commands.dissolveFamily(alice.sessionToken, family.familyId)).toEqual({ dissolved: true });
    expect((await commands.listMembership(alice.sessionToken)).family).toBeNull();
  });

  it('does not treat email as the account key', async () => {
    const store = createFamilyStore();
    const commands = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({
        one: { appleSubject: 'sub-1', email: 'same@example.com' },
        two: { appleSubject: 'sub-2', email: 'same@example.com' },
      }),
      clock: { now: () => new Date('2026-09-25T02:00:00.000Z') },
      ids: idsWith({ n: 10 }),
    });
    const first = await commands.signInWithApple('one');
    const second = await commands.signInWithApple('two');
    expect(first.userId).not.toBe(second.userId);
  });

  it('rejects Apple JWKS tokens that fail claim or signature checks', async () => {
    const verifier = createAppleJwksVerifier({
      audience: 'com.lampy.ios',
      clock: { now: () => new Date('2026-09-25T02:00:00.000Z') },
      fetchJwks: async () => [{ kid: 'kid-1', kty: 'RSA', n: 'n', e: 'AQAB' }],
      verifySignature: async () => true,
    });

    const header = encodeJson({ alg: 'RS256', kid: 'kid-1' });
    const payload = encodeJson({
      iss: 'https://appleid.apple.com',
      aud: 'com.lampy.ios',
      sub: 'apple.real',
      exp: Math.floor(new Date('2026-09-26T00:00:00.000Z').getTime() / 1000),
    });
    const token = `${header}.${payload}.c2ln`;
    await expect(verifier.verifyIdentityToken(token)).resolves.toEqual({ appleSubject: 'apple.real' });

    const expired = `${header}.${encodeJson({
      iss: 'https://appleid.apple.com',
      aud: 'com.lampy.ios',
      sub: 'apple.real',
      exp: Math.floor(new Date('2026-09-25T01:00:00.000Z').getTime() / 1000),
    })}.c2ln`;
    await expect(verifier.verifyIdentityToken(expired)).rejects.toMatchObject({
      code: FAMILY_ERROR.APPLE_TOKEN_INVALID,
    });
  });

  it('binds idempotency keys to a deterministic request fingerprint', async () => {
    const { commands, store } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const cara = await signIn(commands, 'apple_cara');
    const familyA = await commands.createFamily(alice.sessionToken, 'create-shared');
    expect((await commands.createFamily(alice.sessionToken, 'create-shared')).familyId).toBe(familyA.familyId);
    expect(fingerprintCreateFamily()).toBe(fingerprintCreateFamily());
    expect(fingerprintInviteMember(familyA.familyId)).toBe(fingerprintInviteMember(familyA.familyId));
    expect(fingerprintInviteMember('fam_other')).not.toBe(fingerprintInviteMember(familyA.familyId));

    const inviteA = await commands.inviteMember(alice.sessionToken, familyA.familyId, 'invite-shared');
    expect((await commands.inviteMember(alice.sessionToken, familyA.familyId, 'invite-shared')).code).toBe(inviteA.code);

    const familyB = await commands.createFamily(cara.sessionToken, 'create-shared');
    expect(familyB.familyId).not.toBe(familyA.familyId);
    const inviteB = await commands.inviteMember(cara.sessionToken, familyB.familyId, 'invite-shared');
    expect(inviteB.code).not.toBe(inviteA.code);

    await expect(commands.inviteMember(alice.sessionToken, familyB.familyId, 'invite-shared')).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.CONFLICT, 'Idempotency key was reused with a different request.'),
    );

    const joined = await commands.acceptInvitation(bob.sessionToken, inviteA.code, 'accept-shared');
    expect((await commands.acceptInvitation(bob.sessionToken, inviteA.code, 'accept-shared')).familyId).toBe(
      joined.familyId,
    );
    expect(fingerprintAcceptInvitation(inviteA.code)).toBe(fingerprintAcceptInvitation(inviteA.code));
    expect(fingerprintAcceptInvitation(inviteA.code)).not.toBe(fingerprintAcceptInvitation(inviteB.code));

    await commands.leaveFamily(bob.sessionToken);
    const nextInvite = await commands.inviteMember(alice.sessionToken, familyA.familyId);
    await expect(commands.acceptInvitation(bob.sessionToken, nextInvite.code, 'accept-shared')).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.CONFLICT, 'Idempotency key was reused with a different request.'),
    );
    expect((await commands.listMembership(bob.sessionToken)).family).toBeNull();

    for (const record of store.idempotency.values()) {
      expect(record.requestFingerprint).toBeTruthy();
      expect(record.requestFingerprint).not.toContain(alice.sessionToken);
      expect(record.requestFingerprint).not.toContain('apple_alice');
      expect(record.requestFingerprint).not.toContain(inviteA.code);
    }
  });

  it('revalidates current membership and invitation state before replaying an idempotent result', async () => {
    const { commands } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const family = await commands.createFamily(alice.sessionToken, 'create-replay');
    const invite = await commands.inviteMember(alice.sessionToken, family.familyId, 'invite-replay');
    await commands.revokeInvitation(alice.sessionToken, invite.invitationId);
    const replayedInvite = await commands.inviteMember(alice.sessionToken, family.familyId, 'invite-replay');
    expect(replayedInvite.invitationId).toBe(invite.invitationId);
    expect(replayedInvite.status).toBe('revoked');
    expect(replayedInvite.status).not.toBe('pending');

    const liveInvite = await commands.inviteMember(alice.sessionToken, family.familyId, 'invite-live');
    await commands.acceptInvitation(bob.sessionToken, liveInvite.code, 'accept-replay');
    expect((await commands.acceptInvitation(bob.sessionToken, liveInvite.code, 'accept-replay')).members).toHaveLength(2);
    await commands.leaveFamily(bob.sessionToken);
    await expect(commands.acceptInvitation(bob.sessionToken, liveInvite.code, 'accept-replay')).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.'),
    );
    expect((await commands.listMembership(bob.sessionToken)).family).toBeNull();

    const rejoin = await commands.inviteMember(alice.sessionToken, family.familyId);
    await commands.acceptInvitation(bob.sessionToken, rejoin.code, 'accept-removed');
    await commands.removeMember(alice.sessionToken, family.familyId, bob.userId);
    await expect(commands.acceptInvitation(bob.sessionToken, rejoin.code, 'accept-removed')).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'Not a member of this family.'),
    );

    await commands.dissolveFamily(alice.sessionToken, family.familyId);
    await expect(commands.createFamily(alice.sessionToken, 'create-replay')).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.FAMILY_DISSOLVED, 'This family has been dissolved.'),
    );
    await expect(commands.inviteMember(alice.sessionToken, family.familyId, 'invite-replay')).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.FAMILY_DISSOLVED, 'This family has been dissolved.'),
    );
  });

  it('lets only the current active creator dissolve a family', async () => {
    const { commands, store } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const family = await commands.createFamily(alice.sessionToken);
    const invite = await commands.inviteMember(alice.sessionToken, family.familyId);
    await commands.acceptInvitation(bob.sessionToken, invite.code);

    const aliceRow = store.memberships.find((row) => row.userId === alice.userId && row.familyId === family.familyId);
    const bobRow = store.memberships.find((row) => row.userId === bob.userId && row.familyId === family.familyId);
    expect(aliceRow && bobRow).toBeTruthy();
    if (aliceRow && bobRow) {
      aliceRow.role = 'member';
      bobRow.role = 'creator';
    }

    await expect(commands.dissolveFamily(alice.sessionToken, family.familyId)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can dissolve the family.'),
    );
    expect((await commands.listMembership(alice.sessionToken)).family?.role).toBe('member');
    expect(await commands.dissolveFamily(bob.sessionToken, family.familyId)).toEqual({ dissolved: true });
    expect(await commands.dissolveFamily(bob.sessionToken, family.familyId)).toEqual({ dissolved: true });
    await expect(commands.dissolveFamily(alice.sessionToken, family.familyId)).rejects.toThrow(
      new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can dissolve the family.'),
    );
  });
});
