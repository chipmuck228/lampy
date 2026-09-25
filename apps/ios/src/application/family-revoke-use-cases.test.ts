import { createUseCases } from './use-cases';
import { createFamilyUseCases, createMemoryFamilySessionStore } from './family-use-cases';
import { createMapAppleVerifier } from '../family-api/apple';
import { createFamilyCommands } from '../family-api/commands';
import { dispatchFamilyApi } from '../family-api/http';
import { sampleJpegBytes } from '../family-api/media-validate';
import { createFamilyStore } from '../family-api/store';
import { createDispatchTransport, createFamilyApiClient } from '../infrastructure/family-http-client';
import { createMemoryFamilyReceiveCache } from '../infrastructure/family-receive-cache';
import type { FamilyReceiveFileStore } from '../infrastructure/family-receive-files';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createMemoryRepositories } from '../infrastructure/repositories';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

function testPending() {
  return createPendingFamilyOperationStore(createPendingFamilyOperationDisk());
}

function createCommands() {
  return createFamilyCommands({
    store: createFamilyStore(),
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice' },
      apple_bob: { appleSubject: 'apple.bob' },
    }),
    clock: clockAt('2026-09-25T06:00:00.000Z'),
  });
}

function actor(commands: ReturnType<typeof createCommands>, receiveCache = createMemoryFamilyReceiveCache()) {
  const personalRepos = createMemoryRepositories();
  return {
    receiveCache,
    personal: createUseCases({
      ...personalRepos,
      clock: clockAt('2026-09-25T06:00:00.000Z'),
    }),
    family: createFamilyUseCases({
      client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      personal: personalRepos,
      receiveCache,
    }),
  };
}

async function shareNote(alice: ReturnType<typeof actor>, note = '门口的风') {
  const draft = await alice.personal.restoreOrCreateDraft();
  await alice.personal.updateDraftNote(draft.draftId, note);
  const saved = await alice.personal.saveTextMoment(draft.draftId);
  const preview = await alice.family.prepareSharePreview(saved.id);
  const confirmed = await alice.family.confirmShareMoment({
    momentId: saved.id,
    sourceRevision: preview.sourceRevision,
  });
  expect(confirmed.status).toBe('stored');
  return { saved, shareId: confirmed.status === 'stored' ? confirmed.share.shareId : '' };
}

describe('family revoke and membership cleanup', () => {
  it('revokes on the author device, stops serving, and keeps personal moments', async () => {
    const commands = createCommands();
    const alice = actor(commands);
    const bob = actor(commands);
    await alice.family.signInWithApple('apple_alice');
    const family = await alice.family.createFamily();
    const invite = await alice.family.inviteMember(family.familyId);
    await bob.family.signInWithApple('apple_bob');
    await bob.family.acceptInvitation(invite.code);
    const { saved, shareId } = await shareNote(alice);

    await bob.family.refreshFamilyInbox();
    await bob.family.receiveShare(shareId);
    expect(bob.receiveCache.shares).toHaveLength(1);

    const forbidden = await bob.family.revokeShare(shareId);
    expect(forbidden).toMatchObject({ status: 'failed', code: 'FORBIDDEN' });
    expect(JSON.stringify(forbidden)).not.toMatch(/已撤回/);

    const revoked = await alice.family.revokeShare(shareId);
    expect(revoked.status).toBe('revoked');
    expect((await alice.family.revokeShare(shareId)).status).toBe('revoked');
    expect(alice.receiveCache.shares.map((row) => row.shareId)).not.toContain(shareId);

    expect(await alice.family.refreshFamilyInbox()).toEqual({ kind: 'ready', familyId: family.familyId, items: [] });
    expect(await bob.family.refreshFamilyInbox()).toEqual({ kind: 'ready', familyId: family.familyId, items: [] });
    expect(bob.receiveCache.shares).toEqual([]);
    await expect(alice.family.getOwnedShare(family.familyId, shareId)).rejects.toMatchObject({
      code: 'SHARE_NOT_FOUND',
    });
    expect((await alice.personal.getRecentLife()).items.map((item) => item.id)).toContain(saved.id);
  });

  it('keeps a retry state when revoke cannot reach the server', async () => {
    const commands = createCommands();
    const alice = actor(commands);
    await alice.family.signInWithApple('apple_alice');
    await alice.family.createFamily();
    const { shareId } = await shareNote(alice);
    const session = createMemoryFamilySessionStore();
    const offline = createFamilyUseCases({
      client: createFamilyApiClient(
        createDispatchTransport(async (request) => {
          if (request.method === 'POST' && /\/revoke$/.test(request.path)) {
            throw new Error('family service down');
          }
          return dispatchFamilyApi(commands, request);
        }),
      ),
      session,
      pending: testPending(),
      receiveCache: createMemoryFamilyReceiveCache(),
    });
    await offline.signInWithApple('apple_alice');
    const failed = await offline.revokeShare(shareId);
    expect(failed).toMatchObject({ status: 'failed', shareId });
    expect(JSON.stringify(failed)).not.toMatch(/已撤回/);
    expect(offline.getShareRevokeStatus().status).toBe('failed');
    const inbox = await offline.refreshFamilyInbox();
    if (inbox.kind !== 'ready') throw new Error('expected ready');
    expect(inbox.items.map((item) => item.shareId)).toContain(shareId);
  });

  it('does not mark receive complete when the share is revoked mid-download', async () => {
    const commands = createCommands();
    const aliceCmd = await commands.signInWithApple('apple_alice');
    const family = await commands.createFamily(aliceCmd.sessionToken, 'fam-1');
    const invite = await commands.inviteMember(aliceCmd.sessionToken, family.familyId, 'inv-1');
    const bobCmd = await commands.signInWithApple('apple_bob');
    await commands.acceptInvitation(bobCmd.sessionToken, invite.code, 'accept-1');
    const media = await commands.uploadMedia(aliceCmd.sessionToken, {
      bytes: sampleJpegBytes(),
      mimeType: 'image/jpeg',
    });
    const shared = await commands.shareMoment(aliceCmd.sessionToken, family.familyId, {
      sourceMomentId: 'moment_gate',
      sourceRevision: 1,
      note: '门口的风',
      emotion: '',
      occurredAtPrecision: 'day',
      mediaObjectIds: [media.objectId],
      expectedMediaCount: 1,
    });
    const bobCache = createMemoryFamilyReceiveCache();
    let revokeOnMedia = false;
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(
        createDispatchTransport(async (request) => {
          if (revokeOnMedia && request.method === 'GET' && /\/shares\/[^/]+\/media\//.test(request.path)) {
            await commands.revokeShare(aliceCmd.sessionToken, family.familyId, shared.shareId);
          }
          return dispatchFamilyApi(commands, request);
        }),
      ),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      receiveCache: bobCache,
    });
    await bob.signInWithApple('apple_bob');
    revokeOnMedia = true;
    await expect(bob.receiveShare(shared.shareId)).rejects.toMatchObject({ code: 'SHARE_NOT_FOUND' });
    expect(bobCache.shares.find((row) => row.shareId === shared.shareId)?.receiveStatus).not.toBe('received');
    expect(bobCache.shares.map((row) => row.shareId)).not.toContain(shared.shareId);
  });

  it('hides after leave even when file delete fails', async () => {
    const commands = createCommands();
    const files: FamilyReceiveFileStore = {
      async write() {
        return undefined;
      },
      async read() {
        return new Uint8Array();
      },
      async remove() {
        throw new Error('cannot delete file');
      },
      async removePrefix() {
        throw new Error('cannot delete file');
      },
    };
    const receiveCache = createMemoryFamilyReceiveCache();
    const originalIsolate = receiveCache.isolateAccount.bind(receiveCache);
    receiveCache.isolateAccount = async (userId) => {
      await originalIsolate(userId);
      await files.removePrefix(userId);
    };
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      receiveCache,
    });
    const alice = actor(commands);
    await alice.family.signInWithApple('apple_alice');
    const family = await alice.family.createFamily();
    const invite = await alice.family.inviteMember(family.familyId);
    await bob.signInWithApple('apple_bob');
    await bob.acceptInvitation(invite.code);
    await shareNote(alice);
    await bob.refreshFamilyInbox();
    expect(receiveCache.shares).toHaveLength(1);
    await bob.leaveFamily();
    const hidden = await bob.refreshFamilyInbox();
    expect(hidden).toMatchObject({ kind: 'hidden' });
    expect(JSON.stringify(hidden)).not.toMatch(/仍可访问/);
    expect(receiveCache.shares).toEqual([]);
  });

  it('rebuilds without showing a revoked share and isolates another account', async () => {
    const commands = createCommands();
    const alice = actor(commands);
    const bobCache = createMemoryFamilyReceiveCache();
    const bobSession = createMemoryFamilySessionStore();
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
      session: bobSession,
      pending: testPending(),
      receiveCache: bobCache,
    });
    await alice.family.signInWithApple('apple_alice');
    const family = await alice.family.createFamily();
    const invite = await alice.family.inviteMember(family.familyId);
    await bob.signInWithApple('apple_bob');
    await bob.acceptInvitation(invite.code);
    const { shareId } = await shareNote(alice);
    await bob.refreshFamilyInbox();
    await bob.receiveShare(shareId);
    await alice.family.revokeShare(shareId);

    const rebuilt = createFamilyUseCases({
      client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
      session: bobSession,
      pending: testPending(),
      receiveCache: bobCache,
    });
    expect(rebuilt.getShareRevokeStatus()).toEqual({ status: 'idle' });
    expect(await rebuilt.refreshFamilyInbox()).toEqual({ kind: 'ready', familyId: family.familyId, items: [] });
    expect(bobCache.shares).toEqual([]);
    expect(await bobCache.list('usr_other', family.familyId)).toEqual([]);
  });

  it('does not show an old share after remove and rejoin', async () => {
    let now = Date.parse('2026-09-25T04:00:00.000Z');
    const commands = createFamilyCommands({
      store: createFamilyStore(),
      apple: createMapAppleVerifier({
        apple_alice: { appleSubject: 'apple.alice' },
        apple_bob: { appleSubject: 'apple.bob' },
      }),
      clock: { now: () => new Date(now) },
    });
    const receiveCache = createMemoryFamilyReceiveCache();
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      receiveCache,
    });
    const alice = actor(commands);
    await alice.family.signInWithApple('apple_alice');
    const family = await alice.family.createFamily();
    const invite = await alice.family.inviteMember(family.familyId);
    await bob.signInWithApple('apple_bob');
    await bob.acceptInvitation(invite.code);
    now += 60_000;
    const { shareId } = await shareNote(alice);
    await bob.refreshFamilyInbox();
    await bob.receiveShare(shareId);
    const bobUserId = receiveCache.shares[0]?.userId as string;
    now += 60_000;
    await alice.family.removeMember(family.familyId, bobUserId);
    expect(await bob.refreshFamilyInbox()).toMatchObject({ kind: 'hidden' });
    expect(receiveCache.shares).toEqual([]);
    now += 60_000;
    const secondInvite = await alice.family.inviteMember(family.familyId);
    await bob.acceptInvitation(secondInvite.code);
    expect(await bob.refreshFamilyInbox()).toEqual({ kind: 'ready', familyId: family.familyId, items: [] });
    await expect(bob.receiveShare(shareId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
