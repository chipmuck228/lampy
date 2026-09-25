import { createMapAppleVerifier } from './apple';
import { createFamilyCommands } from './commands';
import { dispatchFamilyApi } from './http';
import { createFamilyStore } from './store';

function api() {
  return createFamilyCommands({
    store: createFamilyStore(),
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice' },
      apple_bob: { appleSubject: 'apple.bob' },
    }),
    clock: { now: () => new Date('2026-09-25T02:00:00.000Z') },
  });
}

describe('family HTTP contract', () => {
  it('maps unauthenticated and invalid token to 401 and does not invent a family', async () => {
    const commands = api();
    const missing = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/families',
      headers: {},
    });
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' },
    });

    const invalid = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/auth/apple',
      headers: {},
      body: { identityToken: 'nope' },
    });
    expect(invalid.status).toBe(401);
    expect((invalid.body as { error: { code: string } }).error.code).toBe('APPLE_TOKEN_INVALID');
  });

  it('creates, invites, accepts, and lists only after real success', async () => {
    const commands = api();
    const alice = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/auth/apple',
      headers: {},
      body: { identityToken: 'apple_alice' },
    });
    expect(alice.status).toBe(200);
    const aliceToken = (alice.body as { sessionToken: string }).sessionToken;

    const created = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/families',
      headers: { authorization: `Bearer ${aliceToken}`, 'idempotency-key': 'fam-1' },
    });
    expect(created.status).toBe(200);
    const familyId = (created.body as { familyId: string }).familyId;

    const replay = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/families',
      headers: { authorization: `Bearer ${aliceToken}`, 'idempotency-key': 'fam-1' },
    });
    expect((replay.body as { familyId: string }).familyId).toBe(familyId);

    const invite = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: `/v1/families/${familyId}/invitations`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    const code = (invite.body as { code: string }).code;

    const bob = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/auth/apple',
      headers: {},
      body: { identityToken: 'apple_bob' },
    });
    const bobToken = (bob.body as { sessionToken: string }).sessionToken;
    const accepted = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/invitations/accept',
      headers: { authorization: `Bearer ${bobToken}` },
      body: { code },
    });
    expect(accepted.status).toBe(200);
    expect((accepted.body as { members: unknown[] }).members).toHaveLength(2);

    const listed = await dispatchFamilyApi(commands, {
      method: 'GET',
      path: '/v1/me/membership',
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect((listed.body as { family: { familyId: string } | null }).family?.familyId).toBe(familyId);

    const aliceAgain = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/auth/apple',
      headers: {},
      body: { identityToken: 'apple_alice' },
    });
    const aliceToken2 = (aliceAgain.body as { sessionToken: string }).sessionToken;
    const stale = await dispatchFamilyApi(commands, {
      method: 'GET',
      path: '/v1/me/membership',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(stale.status).toBe(401);
    const listedAgain = await dispatchFamilyApi(commands, {
      method: 'GET',
      path: '/v1/me/membership',
      headers: { authorization: `Bearer ${aliceToken2}` },
    });
    expect((listedAgain.body as { family: { familyId: string } | null }).family?.familyId).toBe(familyId);
  });

  it('revokes the bearer session on sign-out', async () => {
    const commands = api();
    const alice = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/auth/apple',
      headers: {},
      body: { identityToken: 'apple_alice' },
    });
    const aliceToken = (alice.body as { sessionToken: string }).sessionToken;
    const signedOut = await dispatchFamilyApi(commands, {
      method: 'POST',
      path: '/v1/auth/sign-out',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(signedOut).toEqual({ status: 200, body: { signedOut: true } });
    const listed = await dispatchFamilyApi(commands, {
      method: 'GET',
      path: '/v1/me/membership',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(listed.status).toBe(401);
  });
});
