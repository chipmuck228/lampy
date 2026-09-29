import { createUseCases } from './use-cases';
import { createFamilyUseCases, createMemoryFamilySessionStore } from './family-use-cases';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createMapAppleVerifier } from '../family-api/apple';
import { createFamilyCommands } from '../family-api/commands';
import { dispatchFamilyApi } from '../family-api/http';
import { createMemoryMailer } from '../family-api/mailer';
import { ARGON2ID_TEST, createArgon2idPasswordHasher } from '../family-api/password';
import { createFamilyStore } from '../family-api/store';
import { createDispatchTransport, createFamilyApiClient } from '../infrastructure/family-http-client';
import { createMemoryFamilyReceiveCache } from '../infrastructure/family-receive-cache';
import { createMemoryRepositories } from '../infrastructure/repositories';

function tokenFrom(mailer: ReturnType<typeof createMemoryMailer>) {
  const match = mailer.sent.at(-1)?.text.match(/\n\n([0-9a-f]{64})\n\n/);
  if (!match) throw new Error('missing mail token');
  return match[1];
}

function setup() {
  const store = createFamilyStore();
  const mailer = createMemoryMailer();
  const commands = createFamilyCommands({
    store,
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice', email: 'alice@example.com' },
    }),
    mailer,
    emailRegisterEnabled: true,
    passwordHasher: createArgon2idPasswordHasher(ARGON2ID_TEST),
  });
  const receiveCache = createMemoryFamilyReceiveCache();
  const aliceSession = createMemoryFamilySessionStore();
  const bobSession = createMemoryFamilySessionStore();
  const pending = createPendingFamilyOperationStore(createPendingFamilyOperationDisk());
  const personalRepos = createMemoryRepositories();
  const personal = createUseCases({ ...personalRepos, clock: { now: () => new Date('2026-09-29T10:00:00.000Z') } });
  const client = createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request)));
  const alice = createFamilyUseCases({
    client,
    session: aliceSession,
    pending,
    receiveCache,
    personal: personalRepos,
  });
  const bob = createFamilyUseCases({
    client,
    session: bobSession,
    pending,
    receiveCache,
    personal: personalRepos,
  });
  return { commands, mailer, alice, bob, aliceSession, bobSession, personal, store, receiveCache };
}

describe('email auth use cases', () => {
  it('issues the same session store as Apple after verify and does not merge by email', async () => {
    const { alice, mailer, commands } = setup();
    const apple = await commands.signInWithApple('apple_alice');
    await alice.registerWithEmail('alice@example.com', 'correct-horse');
    await alice.verifyEmail(tokenFrom(mailer));
    const signed = await alice.signInWithEmail('alice@example.com', 'correct-horse');
    expect(signed.userId).not.toBe(apple.userId);
    expect(await alice.getMembership()).toEqual({ kind: 'none' });
  });

  it('does not leak pending ops or receive cache after A signs out and B signs in', async () => {
    const { alice, bob, mailer, aliceSession } = setup();
    await alice.registerWithEmail('a@example.com', 'correct-horse');
    await alice.verifyEmail(tokenFrom(mailer));
    await alice.signInWithEmail('a@example.com', 'correct-horse');
    await alice.createFamily();
    expect((await alice.getMembership()).kind).toBe('ready');
    await alice.signOut();
    expect(await aliceSession.getSessionToken()).toBeNull();

    await bob.registerWithEmail('b@example.com', 'correct-horse');
    await bob.verifyEmail(tokenFrom(mailer));
    await bob.signInWithEmail('b@example.com', 'correct-horse');
    expect(await bob.getMembership()).toEqual({ kind: 'none' });
    expect(await bob.listFamilyInbox()).toEqual({ kind: 'hidden', reason: 'none' });
  });

  it('deletes the family account without touching personal moments', async () => {
    const { alice, mailer, personal } = setup();
    const draft = await personal.restoreOrCreateDraft();
    await personal.updateDraftNote(draft.draftId, '门口的风');
    const saved = await personal.saveTextMoment(draft.draftId);
    await alice.registerWithEmail('solo@example.com', 'correct-horse');
    await alice.verifyEmail(tokenFrom(mailer));
    await alice.signInWithEmail('solo@example.com', 'correct-horse');
    expect(await alice.deleteAccount()).toEqual({ deleted: true });
    expect(await alice.getMembership()).toEqual({ kind: 'unauthenticated' });
    const detail = await personal.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
  });
});
