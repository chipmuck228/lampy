import { createUseCases } from './use-cases';
import {
  createFamilyUseCases,
  createMemoryFamilyCache,
  createMemoryFamilySessionStore,
  familyMembersOrEmpty,
  type FamilySessionStore,
} from './family-use-cases';
import {
  createPendingFamilyOperationDisk,
  createPendingFamilyOperationStore,
} from '../infrastructure/pending-family-operations';
import { createMapAppleVerifier } from '../family-api/apple';
import { createFamilyCommands } from '../family-api/commands';
import { dispatchFamilyApi } from '../family-api/http';
import { createFamilyStore } from '../family-api/store';
import { createDispatchTransport, createFamilyApiClient } from '../infrastructure/family-http-client';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { createMemoryMediaStore, createQueuedImageSource } from '../infrastructure/media';
import { sampleJpegBytes, samplePngBytes } from '../family-api/media-validate';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

function testPending() {
  return createPendingFamilyOperationStore(createPendingFamilyOperationDisk());
}

function createHarness(
  nowIso = '2026-09-25T02:00:00.000Z',
  options?: { readAssetBytes?: (localUri: string) => Promise<Uint8Array> },
) {
  const store = createFamilyStore();
  const clock = clockAt(nowIso);
  const commands = createFamilyCommands({
    store,
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice' },
      apple_bob: { appleSubject: 'apple.bob' },
      apple_cara: { appleSubject: 'apple.cara' },
    }),
    clock,
    inviteTtlMs: 60_000,
  });
  const personalRepos = createMemoryRepositories();
  const personal = createUseCases({
    ...personalRepos,
    clock,
  });
  const keys = { n: 0 };
  const family = createFamilyUseCases({
    client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
    session: createMemoryFamilySessionStore(),
    pending: testPending(),
    personal: options?.readAssetBytes
      ? { ...personalRepos, readAssetBytes: options.readAssetBytes }
      : personalRepos,
    idempotencyKey: (prefix) => {
      keys.n += 1;
      return `${prefix}-${keys.n}`;
    },
  });
  return { family, personal, personalRepos, clock, commands };
}

async function savePersonalNote(personal: ReturnType<typeof createUseCases>, note: string) {
  const draft = await personal.restoreOrCreateDraft();
  await personal.updateDraftNote(draft.draftId, note);
  return personal.saveTextMoment(draft.draftId);
}

describe('family use cases against a real in-process API', () => {
  it('does not show members when logged out, invalid, or unreachable, and leaves personal Moments unchanged', async () => {
    const { family, personal } = createHarness();
    const saved = await savePersonalNote(personal, '门口的风');

    expect(await family.getMembership()).toEqual({ kind: 'unauthenticated' });
    expect(familyMembersOrEmpty(await family.getMembership())).toEqual([]);
    await expect(family.createFamily()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    await expect(family.signInWithApple('nope')).rejects.toMatchObject({ code: 'APPLE_TOKEN_INVALID' });
    expect(await family.getMembership()).toEqual({ kind: 'unauthenticated' });

    const unreachableSession = createMemoryFamilySessionStore();
    const unreachable = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          throw new Error('network down');
        },
      }),
      session: unreachableSession,
      pending: testPending(),
    });
    await expect(unreachable.signInWithApple('unused')).rejects.toMatchObject({
      code: 'SERVER_UNREACHABLE',
    });
    await unreachableSession.setSession({ userId: 'usr_x', sessionToken: 'ses_x' });
    expect(await unreachable.getMembership()).toEqual({ kind: 'unconfirmed', reason: 'unreachable' });
    expect(familyMembersOrEmpty(await unreachable.getMembership())).toEqual([]);

    const recent = await personal.getRecentLife();
    expect(recent.items).toHaveLength(1);
    expect(recent.items[0].id).toBe(saved.id);
    expect(recent.items[0].note).toBe('门口的风');
  });

  it('clears the session on signOut without changing personal moments', async () => {
    const { family, personal } = createHarness();
    const saved = await savePersonalNote(personal, '退出登录也不改个人');
    await family.signInWithApple('apple_alice');
    await family.createFamily();
    expect(await family.signOut()).toEqual({ local: 'signed-out', server: 'revoked' });
    expect(await family.getMembership()).toEqual({ kind: 'unauthenticated' });
    expect(await family.hasUnconfirmedSessionRevoke()).toBe(false);
    expect((await personal.getMomentDetail(saved.id)).kind).toBe('ready');
  });

  it('revokes the server session on signOut even if a later local retry happens', async () => {
    const store = createFamilyStore();
    const commands = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
      clock: clockAt('2026-09-25T02:00:00.000Z'),
    });
    const session = createMemoryFamilySessionStore();
    const family = createFamilyUseCases({
      client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
      session,
      pending: testPending(),
    });
    await family.signInWithApple('apple_alice');
    const token = await session.getSessionToken();
    expect(token).toBeTruthy();
    await family.createFamily();
    expect(await family.signOut()).toEqual({ local: 'signed-out', server: 'revoked' });
    expect(await session.getSessionToken()).toBeNull();
    expect(await session.getPendingRevoke()).toBeNull();
    await expect(commands.listMembership(token || '')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('treats a lost sign-out response as local signed-out and retries the server revoke', async () => {
    const store = createFamilyStore();
    const commands = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
      clock: clockAt('2026-09-25T02:00:00.000Z'),
    });
    const session = createMemoryFamilySessionStore();
    let failNextSignOut = true;
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request(input) {
          if (input.path === '/v1/auth/sign-out') {
            await commands.signOut(input.sessionToken || '');
            if (failNextSignOut) {
              failNextSignOut = false;
              throw new Error('lost response');
            }
            return { status: 200, body: { signedOut: true } };
          }
          return dispatchFamilyApi(commands, {
            method: input.method,
            path: input.path,
            headers: {
              authorization: input.sessionToken ? `Bearer ${input.sessionToken}` : undefined,
              'idempotency-key': input.idempotencyKey,
            },
            body: input.body,
          });
        },
      }),
      session,
      pending: testPending(),
    });
    await family.signInWithApple('apple_alice');
    const token = await session.getSessionToken();
    expect(await family.signOut()).toEqual({ local: 'signed-out', server: 'unconfirmed' });
    expect(await session.getSessionToken()).toBeNull();
    expect(await family.hasUnconfirmedSessionRevoke()).toBe(true);
    await expect(commands.listMembership(token || '')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await family.getMembership()).toEqual({ kind: 'unauthenticated' });
    expect(await family.hasUnconfirmedSessionRevoke()).toBe(false);
  });

  it('clears the local session on unreachable sign-out and retries after rebuild', async () => {
    const session = createMemoryFamilySessionStore();
    await session.setSession({ userId: 'usr_x', sessionToken: 'ses_x' });
    const unreachable = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          throw new Error('network down');
        },
      }),
      session,
      pending: testPending(),
      clock: clockAt('2026-09-25T02:00:00.000Z'),
    });
    expect(await unreachable.signOut()).toEqual({ local: 'signed-out', server: 'unconfirmed' });
    expect(await session.getSessionToken()).toBeNull();
    expect(await unreachable.getMembership()).toEqual({ kind: 'unauthenticated' });
    expect(await unreachable.hasUnconfirmedSessionRevoke()).toBe(true);
    expect(await session.getPendingRevoke()).toMatchObject({ userId: 'usr_x', sessionToken: 'ses_x' });

    const rebuilt = createFamilyUseCases({
      client: createFamilyApiClient({
        async request(input) {
          if (input.path === '/v1/auth/sign-out' && input.sessionToken === 'ses_x') {
            return { status: 200, body: { signedOut: true } };
          }
          throw new Error(`unexpected ${input.path}`);
        },
      }),
      session,
      pending: testPending(),
      clock: clockAt('2026-09-25T02:01:00.000Z'),
    });
    expect(await rebuilt.getMembership()).toEqual({ kind: 'unauthenticated' });
    expect(await rebuilt.hasUnconfirmedSessionRevoke()).toBe(false);
    expect(await session.getPendingRevoke()).toBeNull();
  });

  it('does not let a later account reuse an earlier pending revoke token', async () => {
    const session = createMemoryFamilySessionStore();
    await session.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });
    const revoked: string[] = [];
    let appleOnline = false;
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request(input) {
          if (input.path === '/v1/auth/apple') {
            appleOnline = true;
            return { status: 200, body: { userId: 'usr_bob', sessionToken: 'ses_bob', expiresAt: '2026-10-01T00:00:00.000Z' } };
          }
          if (input.path === '/v1/auth/sign-out') {
            if (!appleOnline) throw new Error('network down');
            revoked.push(input.sessionToken || '');
            return { status: 200, body: { signedOut: true } };
          }
          throw new Error('network down');
        },
      }),
      session,
      pending: testPending(),
    });
    expect(await family.signOut()).toEqual({ local: 'signed-out', server: 'unconfirmed' });
    expect(await session.getPendingRevoke()).toMatchObject({ userId: 'usr_alice', sessionToken: 'ses_alice' });
    await family.signInWithApple('apple_bob');
    expect(revoked).toEqual(['ses_alice']);
    expect(await session.getPendingRevoke()).toBeNull();
    expect(await session.getUserId()).toBe('usr_bob');
    expect(await session.getSessionToken()).toBe('ses_bob');
  });

  it('clears an expired pending revoke without presenting it as a live session', async () => {
    const session = createMemoryFamilySessionStore();
    await session.savePendingRevoke({
      userId: 'usr_x',
      sessionToken: 'ses_old',
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          throw new Error('should not send an expired revoke');
        },
      }),
      session,
      pending: testPending(),
      clock: clockAt('2026-09-25T02:00:00.000Z'),
      sessionRevokeTtlMs: 60_000,
    });
    expect(await family.hasUnconfirmedSessionRevoke()).toBe(false);
    expect(await family.getMembership()).toEqual({ kind: 'unauthenticated' });
    expect(await session.getPendingRevoke()).toBeNull();
  });

  it('keeps a pending revoke when the server returns a non-network error', async () => {
    const session = createMemoryFamilySessionStore();
    await session.savePendingRevoke({
      userId: 'usr_x',
      sessionToken: 'ses_x',
      createdAt: '2026-09-25T02:00:00.000Z',
    });
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          return { status: 500, body: { error: { code: 'INTERNAL', message: 'Family API failed.' } } };
        },
      }),
      session,
      pending: testPending(),
      clock: clockAt('2026-09-25T02:00:00.000Z'),
    });
    expect(await family.getMembership()).toEqual({ kind: 'unauthenticated' });
    expect(await family.hasUnconfirmedSessionRevoke()).toBe(true);
    expect(await session.getPendingRevoke()).toMatchObject({ userId: 'usr_x', sessionToken: 'ses_x' });
  });

  it('keeps the live session when pending revoke cannot be written to secure storage', async () => {
    const inner = createMemoryFamilySessionStore();
    await inner.setSession({ userId: 'usr_x', sessionToken: 'ses_x' });
    const session: FamilySessionStore = {
      getSessionToken: () => inner.getSessionToken(),
      getUserId: () => inner.getUserId(),
      setSession: (row) => inner.setSession(row),
      clearSession: () => inner.clearSession(),
      getPendingRevoke: () => inner.getPendingRevoke(),
      async savePendingRevoke() {
        throw new Error('secure store write failed');
      },
      clearPendingRevoke: () => inner.clearPendingRevoke(),
    };
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          throw new Error('network down');
        },
      }),
      session,
      pending: testPending(),
      clock: clockAt('2026-09-25T02:00:00.000Z'),
    });
    expect(await family.signOut()).toEqual({ local: 'still-signed-in', server: 'unconfirmed' });
    expect(await session.getSessionToken()).toBe('ses_x');
    expect(await session.getUserId()).toBe('usr_x');
    expect(await session.getPendingRevoke()).toBeNull();
    expect(await family.hasUnconfirmedSessionRevoke()).toBe(false);
  });

  it('does not drop a pending revoke when a later Apple sign-in fails', async () => {
    const session = createMemoryFamilySessionStore();
    await session.savePendingRevoke({
      userId: 'usr_alice',
      sessionToken: 'ses_alice',
      createdAt: '2026-09-25T02:00:00.000Z',
    });
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          throw new Error('network down');
        },
      }),
      session,
      pending: testPending(),
      clock: clockAt('2026-09-25T02:00:00.000Z'),
    });
    await expect(family.signInWithApple('apple_alice')).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    expect(await session.getPendingRevoke()).toMatchObject({ userId: 'usr_alice', sessionToken: 'ses_alice' });
    expect(await session.getSessionToken()).toBeNull();
  });

  it('shows members only after a successful create/accept and treats retry as the same family', async () => {
    const { family, personal } = createHarness();
    const saved = await savePersonalNote(personal, '个人还在');
    const alice = await family.signInWithApple('apple_alice');
    expect((await family.getMembership()).kind).toBe('none');

    const first = await family.createFamily('create-retry');
    const second = await family.createFamily('create-retry');
    expect(second.familyId).toBe(first.familyId);
    await expect(family.createFamily('create-other')).rejects.toMatchObject({
      code: 'ALREADY_IN_FAMILY',
    });
    const ready = await family.getMembership();
    expect(ready).toMatchObject({
      kind: 'ready',
      familyId: first.familyId,
      role: 'creator',
    });
    if (ready.kind === 'ready') {
      expect(ready.members).toEqual([
        expect.objectContaining({ userId: alice.userId, role: 'creator' }),
      ]);
    }

    const detail = await personal.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') expect(detail.note).toBe('个人还在');
  });

  it('covers expired, revoked, duplicate accept, already-in-family, and non-creator writes', async () => {
    const bobSession = createMemoryFamilySessionStore();
    const caraSession = createMemoryFamilySessionStore();
    const store = createFamilyStore();
    const clock = clockAt('2026-09-25T02:00:00.000Z');
    const commands = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({
        apple_alice: { appleSubject: 'apple.alice' },
        apple_bob: { appleSubject: 'apple.bob' },
        apple_cara: { appleSubject: 'apple.cara' },
      }),
      clock,
      inviteTtlMs: 60_000,
    });
    const transport = createDispatchTransport((request) => dispatchFamilyApi(commands, request));
    const keys = { n: 0 };
    const nextKey = (prefix: string) => {
      keys.n += 1;
      return `${prefix}-${keys.n}`;
    };
    const alice = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      idempotencyKey: nextKey,
    });
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: bobSession,
      pending: testPending(),
      idempotencyKey: nextKey,
    });
    const cara = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: caraSession,
      pending: testPending(),
      idempotencyKey: nextKey,
    });
    const personal = createUseCases({
      ...createMemoryRepositories(),
      clock,
    });
    const saved = await savePersonalNote(personal, '失败也不改个人');

    await alice.signInWithApple('apple_alice');
    await bob.signInWithApple('apple_bob');
    await cara.signInWithApple('apple_cara');
    const family = await alice.createFamily();
    const invite = await alice.inviteMember(family.familyId);
    await bob.acceptInvitation(invite.code);
    await expect(cara.acceptInvitation(invite.code)).rejects.toMatchObject({ code: 'INVITE_ALREADY_USED' });
    expect((await cara.getMembership()).kind).toBe('none');

    const revoked = await alice.inviteMember(family.familyId);
    await alice.revokeInvitation(revoked.invitationId);
    await expect(cara.acceptInvitation(revoked.code)).rejects.toMatchObject({ code: 'INVITE_REVOKED' });

    const expiring = await alice.inviteMember(family.familyId);
    clock.now = () => new Date('2026-09-25T02:02:00.000Z');
    await expect(cara.acceptInvitation(expiring.code)).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });

    await expect(bob.inviteMember(family.familyId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(bob.removeMember(family.familyId, 'someone')).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await cara.createFamily();
    clock.now = () => new Date('2026-09-25T02:00:30.000Z');
    const laterInvite = await alice.inviteMember(family.familyId);
    await expect(cara.acceptInvitation(laterInvite.code)).rejects.toMatchObject({
      code: 'ALREADY_IN_FAMILY',
    });
    expect(familyMembersOrEmpty(await bob.getMembership())).toHaveLength(2);
    const detail = await personal.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') expect(detail.note).toBe('失败也不改个人');
  });

  it('lets a member leave and does not keep showing family after leave', async () => {
    const store = createFamilyStore();
    const commands = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({
        apple_alice: { appleSubject: 'apple.alice' },
        apple_bob: { appleSubject: 'apple.bob' },
      }),
      clock: clockAt('2026-09-25T03:00:00.000Z'),
    });
    const transport = createDispatchTransport((request) => dispatchFamilyApi(commands, request));
    const alice = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      idempotencyKey: () => 'alice-create',
    });
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      idempotencyKey: (prefix) => `bob-${prefix}`,
    });
    await alice.signInWithApple('apple_alice');
    await bob.signInWithApple('apple_bob');
    const family = await alice.createFamily();
    const invite = await alice.inviteMember(family.familyId);
    await bob.acceptInvitation(invite.code);
    await expect(alice.leaveFamily()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await bob.leaveFamily();
    expect(await bob.getMembership()).toEqual({ kind: 'none' });
    const after = await alice.getMembership();
    expect(after.kind).toBe('ready');
    if (after.kind === 'ready') expect(after.members).toHaveLength(1);
  });
});

describe('passive membership loss and family cache', () => {
  function sharedActors() {
    const store = createFamilyStore();
    const clock = clockAt('2026-09-25T04:00:00.000Z');
    const commands = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({
        apple_alice: { appleSubject: 'apple.alice' },
        apple_bob: { appleSubject: 'apple.bob' },
      }),
      clock,
    });
    const transport = createDispatchTransport((request) => dispatchFamilyApi(commands, request));
    const personalRepos = createMemoryRepositories();
    const personal = createUseCases({ ...personalRepos, clock });
    const aliceSession = createMemoryFamilySessionStore();
    const bobSession = createMemoryFamilySessionStore();
    const bobCache = createMemoryFamilyCache();
    const alice = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: aliceSession,
      pending: testPending(),
    });
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: bobSession,
      cache: bobCache,
      pending: testPending(),
    });
    return { commands, personal, personalRepos, alice, bob, bobSession, bobCache, transport };
  }

  async function personalFingerprint(personal: ReturnType<typeof createUseCases>) {
    const recent = await personal.getRecentLife();
    const draft = await personal.restoreOrCreateDraft();
    return {
      items: recent.items.map((item) => ({ id: item.id, note: item.note })),
      draftId: draft.draftId,
      draftNote: draft.note,
    };
  }

  it('clears family cache after a remote remove and leaves personal Moments unchanged', async () => {
    const { alice, bob, bobCache, personal } = sharedActors();
    const saved = await savePersonalNote(personal, '被动移除也不改个人');
    const before = await personalFingerprint(personal);

    await alice.signInWithApple('apple_alice');
    const bobAccount = await bob.signInWithApple('apple_bob');
    const family = await alice.createFamily();
    const invite = await alice.inviteMember(family.familyId);
    await bob.acceptInvitation(invite.code);
    expect((await bob.getMembership()).kind).toBe('ready');
    const clearedAfterJoin = bobCache.clearCount;

    await alice.removeMember(family.familyId, bobAccount.userId);
    const afterRemove = await bob.getMembership();
    expect(afterRemove).toEqual({ kind: 'none' });
    expect(familyMembersOrEmpty(afterRemove)).toEqual([]);
    expect(bobCache.clearCount).toBeGreaterThan(clearedAfterJoin);

    expect(await personalFingerprint(personal)).toEqual(before);
    const detail = await personal.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
  });

  it('clears family cache after a remote dissolve', async () => {
    const { alice, bob, bobCache, personal } = sharedActors();
    const saved = await savePersonalNote(personal, '解散也不改个人');
    const before = await personalFingerprint(personal);

    await alice.signInWithApple('apple_alice');
    await bob.signInWithApple('apple_bob');
    const family = await alice.createFamily();
    await bob.acceptInvitation((await alice.inviteMember(family.familyId)).code);
    expect((await bob.getMembership()).kind).toBe('ready');
    const clearedAfterJoin = bobCache.clearCount;

    await alice.dissolveFamily(family.familyId);
    expect(await bob.getMembership()).toEqual({ kind: 'none' });
    expect(bobCache.clearCount).toBeGreaterThan(clearedAfterJoin);
    expect(await personalFingerprint(personal)).toEqual(before);
    expect((await personal.getMomentDetail(saved.id)).kind).toBe('ready');
  });

  it('does not show members for an invalid session and clears family cache', async () => {
    const session = createMemoryFamilySessionStore();
    const cache = createMemoryFamilyCache();
    const personal = createUseCases({
      ...createMemoryRepositories(),
      clock: clockAt('2026-09-25T04:30:00.000Z'),
    });
    const saved = await savePersonalNote(personal, '无效会话也不改个人');
    const before = await personalFingerprint(personal);
    await session.setSession({ userId: 'usr_stale', sessionToken: 'ses_stale' });
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          return {
            status: 401,
            body: { error: { code: 'UNAUTHENTICATED', message: 'Session is missing or invalid.' } },
          };
        },
      }),
      session,
      cache,
      pending: testPending(),
    });

    const view = await family.getMembership();
    expect(view).toEqual({ kind: 'unconfirmed', reason: 'unauthenticated' });
    expect(familyMembersOrEmpty(view)).toEqual([]);
    expect(cache.clearCount).toBeGreaterThan(0);
    expect(await session.getSessionToken()).toBeNull();
    expect(await personalFingerprint(personal)).toEqual(before);
    expect((await personal.getMomentDetail(saved.id)).kind).toBe('ready');
  });

  it('returns unconfirmed on network failure and never shows a stale member list', async () => {
    const { alice, bob, bobSession, personal } = sharedActors();
    const saved = await savePersonalNote(personal, '网络不可用也不改个人');
    const before = await personalFingerprint(personal);
    const cache = createMemoryFamilyCache();

    await alice.signInWithApple('apple_alice');
    await bob.signInWithApple('apple_bob');
    const family = await alice.createFamily();
    await bob.acceptInvitation((await alice.inviteMember(family.familyId)).code);
    expect(familyMembersOrEmpty(await bob.getMembership()).length).toBeGreaterThan(0);

    const unreachable = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          throw new Error('network down');
        },
      }),
      session: bobSession,
      cache,
      pending: testPending(),
    });
    const view = await unreachable.getMembership();
    expect(view).toEqual({ kind: 'unconfirmed', reason: 'unreachable' });
    expect(familyMembersOrEmpty(view)).toEqual([]);
    expect(cache.clearCount).toBe(0);
    expect(await personalFingerprint(personal)).toEqual(before);
    expect((await personal.getMomentDetail(saved.id)).kind).toBe('ready');
  });
});

describe('client idempotency key retention', () => {
  function countingClient(paths: { create?: boolean; invite?: boolean }) {
    const keys: string[] = [];
    let failNetwork = true;
    return {
      keys,
      setFailNetwork(value: boolean) {
        failNetwork = value;
      },
      client: createFamilyApiClient({
        async request(input) {
          if (paths.create && input.path === '/v1/families') {
            keys.push(String(input.idempotencyKey));
            if (failNetwork) throw new Error('network down');
            return { status: 200, body: { familyId: 'fam_1', role: 'creator', members: [] } };
          }
          if (paths.invite && input.path.startsWith('/v1/families/') && input.path.endsWith('/invitations')) {
            keys.push(String(input.idempotencyKey));
            if (failNetwork) throw new Error('network down');
            return {
              status: 200,
              body: {
                invitationId: 'inv_1',
                familyId: 'fam_1',
                code: 'code_hidden_from_tests_as_result_only',
                status: 'pending',
                expiresAt: '2026-09-26T00:00:00.000Z',
              },
            };
          }
          throw new Error(`unexpected ${input.path}`);
        },
      }),
    };
  }

  it('reuses a persisted key after the use-case instance is rebuilt', async () => {
    const disk = createPendingFamilyOperationDisk();
    const session = createMemoryFamilySessionStore();
    await session.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });
    const transport = countingClient({ create: true });
    let next = 0;
    const deps = {
      client: transport.client,
      pending: createPendingFamilyOperationStore(disk),
      idempotencyKey: (prefix: string) => {
        next += 1;
        return `${prefix}-${next}`;
      },
    };
    const first = createFamilyUseCases({ ...deps, session });
    await expect(first.createFamily()).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });

    const rebuiltSession = createMemoryFamilySessionStore();
    await rebuiltSession.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });
    const rebuilt = createFamilyUseCases({
      ...deps,
      pending: createPendingFamilyOperationStore(disk),
      session: rebuiltSession,
    });
    await expect(rebuilt.createFamily()).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    expect(transport.keys).toEqual(['createFamily-1', 'createFamily-1']);
    expect(JSON.stringify(disk.read())).not.toContain('ses_alice');

    transport.setFailNetwork(false);
    await rebuilt.createFamily();
    await rebuilt.createFamily();
    expect(transport.keys[2]).toBe('createFamily-1');
    expect(transport.keys[3]).toBe('createFamily-2');
    expect(disk.read()).toEqual([]);
  });

  it('does not reuse another account pending key after switching users', async () => {
    const disk = createPendingFamilyOperationDisk();
    const transport = countingClient({ create: true });
    let next = 0;
    const make = async (userId: string) => {
      const session = createMemoryFamilySessionStore();
      await session.setSession({ userId, sessionToken: `ses_${userId}` });
      return createFamilyUseCases({
        client: transport.client,
        session,
        pending: createPendingFamilyOperationStore(disk),
        idempotencyKey: (prefix) => {
          next += 1;
          return `${prefix}-${next}`;
        },
      });
    };

    await expect((await make('usr_alice')).createFamily()).rejects.toMatchObject({
      code: 'SERVER_UNREACHABLE',
    });
    await expect((await make('usr_bob')).createFamily()).rejects.toMatchObject({
      code: 'SERVER_UNREACHABLE',
    });
    expect(transport.keys).toEqual(['createFamily-1', 'createFamily-2']);
    expect(disk.read().map((row) => row.userId).sort()).toEqual(['usr_alice', 'usr_bob']);
  });

  it('starts a new invite operation instead of occupying familyId forever', async () => {
    const disk = createPendingFamilyOperationDisk();
    const session = createMemoryFamilySessionStore();
    await session.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });
    const transport = countingClient({ invite: true });
    let next = 0;
    const family = createFamilyUseCases({
      client: transport.client,
      session,
      pending: createPendingFamilyOperationStore(disk),
      idempotencyKey: (prefix) => {
        next += 1;
        return `${prefix}-${next}`;
      },
    });

    await expect(family.inviteMember('fam_1', { operationId: 'op-old' })).rejects.toMatchObject({
      code: 'SERVER_UNREACHABLE',
    });
    await expect(family.inviteMember('fam_1', { operationId: 'op-new', intent: 'new' })).rejects.toMatchObject({
      code: 'SERVER_UNREACHABLE',
    });
    expect(transport.keys).toEqual(['inviteMember-1', 'inviteMember-2']);

    const rebuilt = createFamilyUseCases({
      client: transport.client,
      session,
      pending: createPendingFamilyOperationStore(disk),
      idempotencyKey: (prefix) => {
        next += 1;
        return `${prefix}-${next}`;
      },
    });
    await expect(rebuilt.retryInviteMember('op-old')).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    expect(transport.keys[2]).toBe('inviteMember-1');

    transport.setFailNetwork(false);
    await rebuilt.retryInviteMember('op-old');
    await rebuilt.inviteMember('fam_1', { operationId: 'op-after-success', intent: 'new' });
    expect(transport.keys[3]).toBe('inviteMember-1');
    expect(transport.keys[4]).toBe('inviteMember-3');
    expect(disk.read().some((row) => row.operationId === 'op-old')).toBe(false);
  });

  it('rejects the same operationId with different params and keeps the original pending row', async () => {
    const disk = createPendingFamilyOperationDisk();
    const session = createMemoryFamilySessionStore();
    await session.setSession({ userId: 'usr_alice', sessionToken: 'ses_alice' });
    const keys: string[] = [];
    const family = createFamilyUseCases({
      client: createFamilyApiClient({
        async request(input) {
          keys.push(`${input.path}:${input.idempotencyKey}`);
          throw new Error('network down');
        },
      }),
      session,
      pending: createPendingFamilyOperationStore(disk),
      idempotencyKey: () => 'invite-kept',
    });

    await expect(family.inviteMember('fam_1', { operationId: 'op-shared' })).rejects.toMatchObject({
      code: 'SERVER_UNREACHABLE',
    });
    await expect(family.inviteMember('fam_2', { operationId: 'op-shared', intent: 'new' })).rejects.toMatchObject({
      code: 'PENDING_CONFLICT',
    });
    expect(keys).toEqual(['/v1/families/fam_1/invitations:invite-kept']);
    expect(disk.read()).toEqual([
      expect.objectContaining({
        operationId: 'op-shared',
        familyId: 'fam_1',
        idempotencyKey: 'invite-kept',
        userId: 'usr_alice',
      }),
    ]);
  });
});

describe('family selected media upload', () => {
  it('uploads only caller-supplied bytes and reports stored or failed without touching personal Moments', async () => {
    const { family, personal } = createHarness();
    const saved = await savePersonalNote(personal, '门口的风还在');
    await family.signInWithApple('apple_alice');
    expect(family.getSelectedMediaUploadStatus()).toEqual({ status: 'idle' });

    const stored = await family.uploadSelectedMedia({
      bytes: sampleJpegBytes(),
      mimeType: 'image/jpeg',
      idempotencyKey: 'sel-1',
    });
    expect(stored.status).toBe('stored');
    if (stored.status !== 'stored') throw new Error('expected stored');
    expect(stored.object.objectId).toMatch(/^med_/);
    expect(JSON.stringify(stored)).not.toMatch(/localUri|已分享|家人已收到/);
    expect(family.getSelectedMediaUploadStatus().status).toBe('stored');

    const content = await family.getOwnedMediaContent(stored.object.objectId);
    expect(Array.from(content.bytes)).toEqual(Array.from(sampleJpegBytes()));

    const failed = await family.uploadSelectedMedia({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
    });
    expect(failed).toMatchObject({ status: 'failed', code: 'MEDIA_CORRUPT' });
    expect((await personal.getRecentLife()).items.map((item) => item.id)).toEqual([saved.id]);
    const detail = await personal.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
  });

  it('does not let another signed-in account read an owned object', async () => {
    const store = createFamilyStore();
    const commands = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({
        apple_alice: { appleSubject: 'apple.alice' },
        apple_bob: { appleSubject: 'apple.bob' },
      }),
      clock: clockAt('2026-09-25T02:00:00.000Z'),
    });
    const transport = createDispatchTransport((request) => dispatchFamilyApi(commands, request));
    const alice = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
    });
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
    });
    await alice.signInWithApple('apple_alice');
    await bob.signInWithApple('apple_bob');
    const stored = await alice.uploadSelectedMedia({ bytes: samplePngBytes(), mimeType: 'image/png' });
    expect(stored.status).toBe('stored');
    if (stored.status !== 'stored') throw new Error('expected stored');
    await expect(bob.getOwnedMedia(stored.object.objectId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('family share moment use cases', () => {
  it('confirms only a local personal moment and leaves the original unchanged', async () => {
    const { family, personal } = createHarness();
    const saved = await savePersonalNote(personal, '门口的风');
    await family.signInWithApple('apple_alice');
    const created = await family.createFamily();
    const preview = await family.prepareSharePreview(saved.id);
    expect(preview.note).toBe('门口的风');
    expect(preview.canConfirm).toBe(true);
    expect(preview.sourceRevision).toBeGreaterThanOrEqual(1);

    const confirmed = await family.confirmShareMoment({
      momentId: saved.id,
      sourceRevision: preview.sourceRevision,
    });
    expect(confirmed.status).toBe('stored');
    if (confirmed.status !== 'stored') throw new Error('expected stored');
    expect(confirmed.share.stored).toBe('server');
    expect(JSON.stringify(confirmed)).not.toMatch(/家人已收到|localUri/);

    const after = await personal.getMomentDetail(saved.id);
    expect(after.kind).toBe('ready');
    if (after.kind === 'ready') expect(after.note).toBe('门口的风');

    await expect(family.prepareSharePreview('moment_other')).resolves.toEqual(expect.anything()).catch(() => undefined);
    await expect(family.prepareSharePreview('moment_other')).rejects.toMatchObject({ code: 'MOMENT_NOT_FOUND' });
    void created;
  });

  it('does not confirm when media is missing or the moment revision changed', async () => {
    const { family, personal, personalRepos } = createHarness();
    const saved = await savePersonalNote(personal, '有一张照片');
    const found = await personalRepos.moments.findById(saved.id);
    if (found.kind !== 'ready') throw new Error('expected moment');
    found.moment.assetIds.push('asset_missing_photo');
    await personalRepos.moments.save(found.moment);
    await family.signInWithApple('apple_alice');
    await family.createFamily();
    const blocked = await family.prepareSharePreview(saved.id);
    expect(blocked.canConfirm).toBe(false);
    const failed = await family.confirmShareMoment({
      momentId: saved.id,
      sourceRevision: blocked.sourceRevision,
    });
    expect(failed).toMatchObject({ status: 'failed', code: 'SHARE_MEDIA_INCOMPLETE' });

    const text = await savePersonalNote(personal, '先确认再改');
    const preview = await family.prepareSharePreview(text.id);
    const again = await personalRepos.moments.findById(text.id);
    if (again.kind !== 'ready') throw new Error('expected moment');
    again.moment.revision += 1;
    await personalRepos.moments.save(again.moment);
    const stale = await family.confirmShareMoment({
      momentId: text.id,
      sourceRevision: preview.sourceRevision,
    });
    expect(stale).toMatchObject({ status: 'failed', code: 'CONFLICT' });
  });

  it('re-reads personal assets on confirm and refuses an empty caller media list', async () => {
    const { family, personal, personalRepos } = createHarness();
    const saved = await savePersonalNote(personal, '有一张照片');
    const found = await personalRepos.moments.findById(saved.id);
    if (found.kind !== 'ready') throw new Error('expected moment');
    found.moment.assetIds.push('asset_photo');
    await personalRepos.moments.save(found.moment);
    await family.signInWithApple('apple_alice');
    await family.createFamily();
    const omitted = await family.confirmShareMoment({
      momentId: saved.id,
      sourceRevision: found.moment.revision,
      mediaByAsset: {},
    });
    expect(omitted).toMatchObject({ status: 'failed', code: 'SHARE_MEDIA_INCOMPLETE' });
  });

  it('uploads every personal asset after re-reading the library on confirm', async () => {
    const personalRepos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const library = createQueuedImageSource({
      picks: [[{ sourceUri: 'memory://source/gate.jpg', mimeType: 'image/jpeg', width: 800, height: 600 }]],
    });
    const clock = clockAt('2026-09-25T02:00:00.000Z');
    const personal = createUseCases({
      ...personalRepos,
      media,
      library,
      clock,
      assetId: () => 'asset_photo',
    });
    const store = createFamilyStore();
    const commands = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
      clock,
      inviteTtlMs: 60_000,
    });
    const family = createFamilyUseCases({
      client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      personal: {
        ...personalRepos,
        readAssetBytes: async () => sampleJpegBytes(),
      },
    });
    const draft = await personal.restoreOrCreateDraft();
    await personal.updateDraftNote(draft.draftId, '门口的风');
    await personal.addLibraryImages(draft.draftId);
    const saved = await personal.saveTextMoment(draft.draftId);
    await family.signInWithApple('apple_alice');
    await family.createFamily();
    const preview = await family.prepareSharePreview(saved.id);
    expect(preview.media).toHaveLength(1);
    expect(preview.canConfirm).toBe(true);
    const confirmed = await family.confirmShareMoment({
      momentId: saved.id,
      sourceRevision: preview.sourceRevision,
    });
    expect(confirmed.status).toBe('stored');
    if (confirmed.status !== 'stored') throw new Error('expected stored');
    expect(confirmed.share.snapshot.media).toHaveLength(1);
    expect(confirmed.share.snapshot.media[0]?.mimeType).toBe('image/jpeg');
  });
});
