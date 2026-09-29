import { createUseCases } from './use-cases';
import { createFamilyUseCases, createMemoryFamilySessionStore } from './family-use-cases';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createMapAppleVerifier } from '../family-api/apple';
import { createFamilyCommands } from '../family-api/commands';
import { dispatchFamilyApi } from '../family-api/http';
import { ARGON2ID_TEST, createArgon2idPasswordHasher } from '../family-api/password';
import { createFamilyStore } from '../family-api/store';
import { createDispatchTransport, createFamilyApiClient } from '../infrastructure/family-http-client';
import { createMemoryFamilyReceiveCache } from '../infrastructure/family-receive-cache';
import { createMemoryRepositories } from '../infrastructure/repositories';

function setup() {
  const store = createFamilyStore();
  const commands = createFamilyCommands({
    store,
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice', email: 'alice@example.com' },
    }),
    testAccountLoginEnabled: true,
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
  return { commands, alice, bob, aliceSession, personal, receiveCache };
}

describe('controlled test-account use cases', () => {
  it('issues the same session store as Apple and does not merge by login string', async () => {
    const { alice, commands } = setup();
    const apple = await commands.signInWithApple('apple_alice');
    await commands.createTestAccount('alice@example.com', 'correct-horse');
    const signed = await alice.signInWithTestAccount('alice@example.com', 'correct-horse');
    expect(signed.userId).not.toBe(apple.userId);
    expect(await alice.getMembership()).toEqual({ kind: 'none' });
  });

  it('does not leak members, pending ops, or receive cache after A signs out and B signs in', async () => {
    const { alice, bob, aliceSession, commands } = setup();
    await commands.createTestAccount('a@example.com', 'correct-horse');
    await alice.signInWithTestAccount('a@example.com', 'correct-horse');
    await alice.createFamily();
    expect((await alice.getMembership()).kind).toBe('ready');
    await alice.signOut();
    expect(await aliceSession.getSessionToken()).toBeNull();

    await commands.createTestAccount('b@example.com', 'correct-horse');
    await bob.signInWithTestAccount('b@example.com', 'correct-horse');
    expect(await bob.getMembership()).toEqual({ kind: 'none' });
    expect(await bob.listFamilyInbox()).toEqual({ kind: 'hidden', reason: 'none' });
  });

  it('keeps personal moments when family auth fails', async () => {
    const { alice, personal, commands } = setup();
    const draft = await personal.restoreOrCreateDraft();
    await personal.updateDraftNote(draft.draftId, '门口的风');
    const saved = await personal.saveTextMoment(draft.draftId);
    await commands.createTestAccount('solo@example.com', 'correct-horse');
    await alice.signInWithTestAccount('solo@example.com', 'correct-horse');
    await expect(alice.signInWithTestAccount('solo@example.com', 'wrong-password')).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
    const detail = await personal.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
  });
});
