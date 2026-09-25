import { createMapAppleVerifier, createAppleJwksVerifier } from './apple';
import { createFamilyCommands } from './commands';
import { FAMILY_ERROR, FamilyError } from './errors';
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
    expect((await commands.listMembership(first.sessionToken)).family).toBeNull();
    expect((await commands.listMembership(second.sessionToken)).family).toBeNull();
  });

  it('rejects an invalid Apple token', async () => {
    const { commands } = setup();
    await expect(commands.signInWithApple('nope')).rejects.toMatchObject({
      code: FAMILY_ERROR.APPLE_TOKEN_INVALID,
    });
  });

  it('creates a family once and rejects a second family for the same account', async () => {
    const { commands } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const family = commands.createFamily(alice.sessionToken, 'create-1');
    expect(family.role).toBe('creator');
    expect(family.members).toHaveLength(1);
    expect(commands.createFamily(alice.sessionToken, 'create-1').familyId).toBe(family.familyId);
    expect(() => commands.createFamily(alice.sessionToken, 'create-2')).toThrow(
      new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.'),
    );
  });

  it('lets a logged-in member accept a pending invite and hides nothing as success on expired or revoked codes', async () => {
    const { commands, clock } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const cara = await signIn(commands, 'apple_cara');
    const family = commands.createFamily(alice.sessionToken);
    const invite = commands.inviteMember(alice.sessionToken, family.familyId, 'invite-1');
    expect(commands.inviteMember(alice.sessionToken, family.familyId, 'invite-1').code).toBe(invite.code);

    const joined = commands.acceptInvitation(bob.sessionToken, invite.code, 'accept-1');
    expect(joined.role).toBe('member');
    expect(joined.members.map((row) => row.userId).sort()).toEqual([alice.userId, bob.userId].sort());
    expect(commands.acceptInvitation(bob.sessionToken, invite.code, 'accept-1').familyId).toBe(family.familyId);

    expect(() => commands.acceptInvitation(cara.sessionToken, invite.code)).toThrow(
      new FamilyError(FAMILY_ERROR.INVITE_ALREADY_USED, 'This invitation was already used.'),
    );

    const revoked = commands.inviteMember(alice.sessionToken, family.familyId);
    commands.revokeInvitation(alice.sessionToken, revoked.invitationId);
    expect(() => commands.acceptInvitation(cara.sessionToken, revoked.code)).toThrow(
      new FamilyError(FAMILY_ERROR.INVITE_REVOKED, 'This invitation was revoked.'),
    );
    expect(commands.revokeInvitation(alice.sessionToken, revoked.invitationId).status).toBe('revoked');

    const expiring = commands.inviteMember(alice.sessionToken, family.familyId);
    clock.now = () => new Date('2026-09-25T02:02:00.000Z');
    expect(() => commands.acceptInvitation(cara.sessionToken, expiring.code)).toThrow(
      new FamilyError(FAMILY_ERROR.INVITE_EXPIRED, 'This invitation has expired.'),
    );
  });

  it('rejects unauthenticated, already-in-family, and non-creator invite or remove', async () => {
    const { commands } = setup();
    expect(() => commands.createFamily('')).toThrow(FamilyError);
    expect(() => commands.listMembership('missing')).toThrow(
      new FamilyError(FAMILY_ERROR.UNAUTHENTICATED, 'Session is missing or invalid.'),
    );

    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const cara = await signIn(commands, 'apple_cara');
    const family = commands.createFamily(alice.sessionToken);
    const invite = commands.inviteMember(alice.sessionToken, family.familyId);
    commands.acceptInvitation(bob.sessionToken, invite.code);

    expect(() => commands.inviteMember(bob.sessionToken, family.familyId)).toThrow(
      new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can invite members.'),
    );
    expect(() => commands.removeMember(bob.sessionToken, family.familyId, alice.userId)).toThrow(
      new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can remove a member.'),
    );
    expect(() => commands.dissolveFamily(bob.sessionToken, family.familyId)).toThrow(
      new FamilyError(FAMILY_ERROR.FORBIDDEN, 'Only the family creator can dissolve the family.'),
    );
    expect(() => commands.createFamily(bob.sessionToken)).toThrow(
      new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.'),
    );

    const other = commands.createFamily(cara.sessionToken);
    const laterInvite = commands.inviteMember(alice.sessionToken, family.familyId);
    expect(() => commands.acceptInvitation(cara.sessionToken, laterInvite.code)).toThrow(
      new FamilyError(FAMILY_ERROR.ALREADY_IN_FAMILY, 'This account already belongs to a family.'),
    );
    expect(other.familyId).not.toBe(family.familyId);
  });

  it('lets a member leave and a creator remove or dissolve without inventing leftover access', async () => {
    const { commands } = setup();
    const alice = await signIn(commands, 'apple_alice');
    const bob = await signIn(commands, 'apple_bob');
    const family = commands.createFamily(alice.sessionToken);
    const invite = commands.inviteMember(alice.sessionToken, family.familyId);
    commands.acceptInvitation(bob.sessionToken, invite.code);

    expect(() => commands.leaveFamily(alice.sessionToken)).toThrow(FamilyError);
    expect(commands.leaveFamily(bob.sessionToken)).toEqual({ left: true });
    expect(commands.leaveFamily(bob.sessionToken)).toEqual({ left: true });
    expect(commands.listMembership(bob.sessionToken).family).toBeNull();
    expect(commands.listMembership(alice.sessionToken).family?.members).toHaveLength(1);

    const rejoin = commands.inviteMember(alice.sessionToken, family.familyId);
    commands.acceptInvitation(bob.sessionToken, rejoin.code);
    expect(commands.removeMember(alice.sessionToken, family.familyId, bob.userId)).toEqual({ removed: true });
    expect(commands.removeMember(alice.sessionToken, family.familyId, bob.userId)).toEqual({ removed: true });
    expect(commands.listMembership(bob.sessionToken).family).toBeNull();

    expect(commands.dissolveFamily(alice.sessionToken, family.familyId)).toEqual({ dissolved: true });
    expect(commands.dissolveFamily(alice.sessionToken, family.familyId)).toEqual({ dissolved: true });
    expect(commands.listMembership(alice.sessionToken).family).toBeNull();
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
});
