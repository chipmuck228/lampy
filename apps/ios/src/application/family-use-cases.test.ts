import { createUseCases } from './use-cases';
import {
  createFamilyUseCases,
  createMemoryFamilySessionStore,
  familyMembersOrEmpty,
} from './family-use-cases';
import { createMapAppleVerifier } from '../family-api/apple';
import { createFamilyCommands } from '../family-api/commands';
import { dispatchFamilyApi } from '../family-api/http';
import { createFamilyStore } from '../family-api/store';
import { createDispatchTransport, createFamilyApiClient } from '../infrastructure/family-http-client';
import { createMemoryRepositories } from '../infrastructure/repositories';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

function createHarness(nowIso = '2026-09-25T02:00:00.000Z') {
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
    idempotencyKey: (prefix) => {
      keys.n += 1;
      return `${prefix}-${keys.n}`;
    },
  });
  return { family, personal, personalRepos, clock };
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
      idempotencyKey: nextKey,
    });
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: bobSession,
      idempotencyKey: nextKey,
    });
    const cara = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: caraSession,
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
      idempotencyKey: () => 'alice-create',
    });
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: createMemoryFamilySessionStore(),
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
