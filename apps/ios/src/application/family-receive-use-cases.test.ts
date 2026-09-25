import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createUseCases } from './use-cases';
import { createFamilyUseCases, createMemoryFamilySessionStore } from './family-use-cases';
import { createMapAppleVerifier } from '../family-api/apple';
import { createFamilyCommands } from '../family-api/commands';
import { dispatchFamilyApi } from '../family-api/http';
import { sampleJpegBytes, samplePngBytes } from '../family-api/media-validate';
import { createFamilyStore } from '../family-api/store';
import { createDispatchTransport, createFamilyApiClient } from '../infrastructure/family-http-client';
import {
  createMemoryFamilyReceiveCache,
  createSqliteFamilyReceiveCache,
} from '../infrastructure/family-receive-cache';
import { createNodeFamilyReceiveFiles } from '../infrastructure/family-receive-files';
import { createPendingFamilyOperationDisk, createPendingFamilyOperationStore } from '../infrastructure/pending-family-operations';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { openPreparedNodeSqliteDatabase } from '../infrastructure/node-sqlite';

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
      apple_cara: { appleSubject: 'apple.cara' },
    }),
    clock: clockAt('2026-09-25T06:00:00.000Z'),
    inviteTtlMs: 60_000,
  });
}

function actor(commands: ReturnType<typeof createCommands>, receiveCache = createMemoryFamilyReceiveCache()) {
  const personalRepos = createMemoryRepositories();
  const transport = createDispatchTransport((request) => dispatchFamilyApi(commands, request));
  return {
    receiveCache,
    personal: createUseCases({
      ...personalRepos,
      clock: clockAt('2026-09-25T06:00:00.000Z'),
    }),
    family: createFamilyUseCases({
      client: createFamilyApiClient(transport),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      personal: personalRepos,
      receiveCache,
    }),
  };
}

describe('family receive cache use cases', () => {
  it('lets an audience member receive through the share path and keeps personal history isolated', async () => {
    const commands = createCommands();
    const alice = actor(commands);
    const bob = actor(commands);
    await alice.family.signInWithApple('apple_alice');
    const family = await alice.family.createFamily();
    const invite = await alice.family.inviteMember(family.familyId);
    await bob.family.signInWithApple('apple_bob');
    await bob.family.acceptInvitation(invite.code);
    const draft = await alice.personal.restoreOrCreateDraft();
    await alice.personal.updateDraftNote(draft.draftId, '门口的风');
    const saved = await alice.personal.saveTextMoment(draft.draftId);
    const preview = await alice.family.prepareSharePreview(saved.id);
    expect(
      (await alice.family.confirmShareMoment({ momentId: saved.id, sourceRevision: preview.sourceRevision })).status,
    ).toBe('stored');

    const inbox = await bob.family.refreshFamilyInbox();
    expect(inbox.kind).toBe('ready');
    if (inbox.kind !== 'ready') throw new Error('expected ready');
    expect(inbox.items[0]?.receiveStatus).toBe('listed');
    const received = await bob.family.receiveShare(inbox.items[0]!.shareId);
    expect(received.status).toBe('received');
    expect(received.item.note).toBe('门口的风');
    expect(JSON.stringify(received)).not.toMatch(/家人已收到|localUri/);

    const personal = await bob.personal.getRecentLife();
    expect(personal.items.map((item) => item.id)).not.toContain(saved.id);
    const lookback = await bob.personal.getHistoryUnknown();
    expect(lookback.items.map((item) => item.id)).not.toContain(saved.id);
  });

  it('hides later joiners, leftover cache after leave, and offline membership', async () => {
    const commands = createCommands();
    const alice = actor(commands);
    const bob = actor(commands);
    const cara = actor(commands);
    await alice.family.signInWithApple('apple_alice');
    const family = await alice.family.createFamily();
    const firstInvite = await alice.family.inviteMember(family.familyId);
    await bob.family.signInWithApple('apple_bob');
    await bob.family.acceptInvitation(firstInvite.code);
    const draft = await alice.personal.restoreOrCreateDraft();
    await alice.personal.updateDraftNote(draft.draftId, '门口的风');
    const saved = await alice.personal.saveTextMoment(draft.draftId);
    const preview = await alice.family.prepareSharePreview(saved.id);
    expect(
      (await alice.family.confirmShareMoment({ momentId: saved.id, sourceRevision: preview.sourceRevision })).status,
    ).toBe('stored');

    const laterInvite = await alice.family.inviteMember(family.familyId);
    await cara.family.signInWithApple('apple_cara');
    await cara.family.acceptInvitation(laterInvite.code);
    expect(await cara.family.refreshFamilyInbox()).toEqual({
      kind: 'ready',
      familyId: family.familyId,
      items: [],
    });

    await bob.family.refreshFamilyInbox();
    expect((await bob.family.listFamilyInbox()).kind).toBe('ready');
    await bob.family.leaveFamily();
    expect(await bob.family.listFamilyInbox()).toMatchObject({ kind: 'hidden' });
    expect(bob.receiveCache.shares).toEqual([]);

    const session = createMemoryFamilySessionStore();
    await session.setSession({ userId: 'usr_stale', sessionToken: 'ses_stale' });
    const leftover = createMemoryFamilyReceiveCache();
    leftover.shares.push({
      userId: 'usr_stale',
      familyId: family.familyId,
      shareId: 'shr_cached',
      snapshotRevision: 1,
      authorUserId: 'usr_alice',
      snapshot: {
        note: '旧缓存',
        emotion: '',
        occurredAtPrecision: 'day',
        media: [],
        origin: { type: 'received', transmissionId: 'shr_cached', originalMomentId: 'm1', snapshotRevision: 1 },
      },
      sharedAt: '2026-09-25T06:00:00.000Z',
      receiveStatus: 'received',
      expectedMediaCount: 0,
    });
    const offline = createFamilyUseCases({
      client: createFamilyApiClient({
        async request() {
          throw new Error('family service down');
        },
      }),
      session,
      pending: testPending(),
      receiveCache: leftover,
    });
    expect(await offline.listFamilyInbox()).toEqual({ kind: 'hidden', reason: 'unreachable' });
    expect(leftover.shares).toHaveLength(1);
  });

  it('does not mark a share received after a partial download, and retries skip verified files', async () => {
    const commands = createCommands();
    const aliceCmd = await commands.signInWithApple('apple_alice');
    const family = await commands.createFamily(aliceCmd.sessionToken, 'fam-1');
    const invite = await commands.inviteMember(aliceCmd.sessionToken, family.familyId, 'inv-1');
    const bobCmd = await commands.signInWithApple('apple_bob');
    await commands.acceptInvitation(bobCmd.sessionToken, invite.code, 'accept-1');
    const first = await commands.uploadMedia(aliceCmd.sessionToken, {
      bytes: sampleJpegBytes(),
      mimeType: 'image/jpeg',
    });
    const second = await commands.uploadMedia(aliceCmd.sessionToken, {
      bytes: samplePngBytes(),
      mimeType: 'image/png',
    });
    const shared = await commands.shareMoment(aliceCmd.sessionToken, family.familyId, {
      sourceMomentId: 'moment_two',
      sourceRevision: 1,
      note: '两张照片',
      emotion: '',
      occurredAtPrecision: 'day',
      mediaObjectIds: [first.objectId, second.objectId],
      expectedMediaCount: 2,
    });

    let failRemaining = 1;
    const receiveCache = createMemoryFamilyReceiveCache();
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(
        createDispatchTransport(async (request) => {
          if (
            failRemaining > 0 &&
            request.method === 'GET' &&
            request.path.includes(`/shares/${shared.shareId}/media/`) &&
            request.path.endsWith('/content')
          ) {
            const objectId = request.path.split('/media/')[1]?.replace(/\/content$/, '');
            if (objectId === second.objectId) {
              failRemaining -= 1;
              throw new Error('download interrupted');
            }
          }
          return dispatchFamilyApi(commands, request);
        }),
      ),
      session: createMemoryFamilySessionStore(),
      pending: testPending(),
      receiveCache,
    });
    await bob.signInWithApple('apple_bob');
    await expect(bob.receiveShare(shared.shareId)).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    const rows = receiveCache.shares.filter((row) => row.shareId === shared.shareId);
    expect(rows[0]?.receiveStatus).toBe('failed');
    expect(rows[0]?.receiveStatus).not.toBe('received');
    expect(receiveCache.media.filter((row) => row.status === 'stored')).toHaveLength(1);

    failRemaining = 0;
    const retried = await bob.receiveShare(shared.shareId);
    expect(retried.status).toBe('received');
    expect(retried.item.storedMediaCount).toBe(2);
    expect(receiveCache.media.filter((row) => row.storageKey.endsWith('.part'))).toHaveLength(0);
  });

  it('persists media files across database rebuild and demotes received rows when files are gone', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-f4-cache-'));
    try {
      const file = path.join(dir, 'lampy.db');
      const cacheDir = path.join(dir, 'family-cache');
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
      const firstDb = await openPreparedNodeSqliteDatabase(file);
      const firstCache = createSqliteFamilyReceiveCache(firstDb, createNodeFamilyReceiveFiles(cacheDir));
      const bobSession = createMemoryFamilySessionStore();
      const bob = createFamilyUseCases({
        client: createFamilyApiClient(createDispatchTransport((request) => dispatchFamilyApi(commands, request))),
        session: bobSession,
        pending: testPending(),
        receiveCache: firstCache,
      });
      await bob.signInWithApple('apple_bob');
      await bob.receiveShare(shared.shareId);
      const bobId = await bobSession.getUserId();
      expect(bobId).toBeTruthy();
      await firstDb.close();

      const secondDb = await openPreparedNodeSqliteDatabase(file);
      const restored = createSqliteFamilyReceiveCache(secondDb, createNodeFamilyReceiveFiles(cacheDir));
      const kept = await restored.list(bobId as string, family.familyId);
      expect(kept[0]?.receiveStatus).toBe('received');
      const stored = (await restored.listMedia(bobId as string, family.familyId, shared.shareId))[0];
      expect(stored).toBeTruthy();
      expect(await restored.readMediaBytes(stored!.storageKey)).toEqual(sampleJpegBytes());
      await secondDb.close();

      await rm(cacheDir, { recursive: true, force: true });
      const thirdDb = await openPreparedNodeSqliteDatabase(file);
      const demoted = createSqliteFamilyReceiveCache(thirdDb, createNodeFamilyReceiveFiles(cacheDir));
      const afterLoss = await demoted.list(bobId as string, family.familyId);
      expect(afterLoss[0]?.receiveStatus).toBe('listed');
      expect(afterLoss[0]?.receiveStatus).not.toBe('received');
      await thirdDb.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shows only the latest authorized list and hides when the list request fails', async () => {
    const commands = createCommands();
    const receiveCache = createMemoryFamilyReceiveCache();
    let failList = false;
    const bob = createFamilyUseCases({
      client: createFamilyApiClient(
        createDispatchTransport(async (request) => {
          if (failList && request.method === 'GET' && /\/shares$/.test(request.path)) {
            throw new Error('family service down');
          }
          return dispatchFamilyApi(commands, request);
        }),
      ),
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
    const draft = await alice.personal.restoreOrCreateDraft();
    await alice.personal.updateDraftNote(draft.draftId, '门口的风');
    const saved = await alice.personal.saveTextMoment(draft.draftId);
    const preview = await alice.family.prepareSharePreview(saved.id);
    expect(
      (await alice.family.confirmShareMoment({ momentId: saved.id, sourceRevision: preview.sourceRevision })).status,
    ).toBe('stored');
    const first = await bob.refreshFamilyInbox();
    if (first.kind !== 'ready') throw new Error('expected ready');
    const userId = receiveCache.shares[0]?.userId;
    expect(userId).toBeTruthy();
    receiveCache.shares.push({
      userId: userId as string,
      familyId: family.familyId,
      shareId: 'shr_stale',
      snapshotRevision: 1,
      authorUserId: 'usr_alice',
      snapshot: {
        note: '旧的不可见分享',
        emotion: '',
        occurredAtPrecision: 'day',
        media: [],
        origin: { type: 'received', transmissionId: 'shr_stale', originalMomentId: 'm0', snapshotRevision: 1 },
      },
      sharedAt: '2026-09-25T01:00:00.000Z',
      receiveStatus: 'received',
      expectedMediaCount: 0,
    });
    const inbox = await bob.refreshFamilyInbox();
    if (inbox.kind !== 'ready') throw new Error('expected ready');
    expect(inbox.items.map((item) => item.shareId)).not.toContain('shr_stale');
    expect(receiveCache.shares.map((row) => row.shareId)).not.toContain('shr_stale');

    failList = true;
    expect(await bob.refreshFamilyInbox()).toEqual({ kind: 'hidden', reason: 'unreachable' });
    expect(receiveCache.shares.map((row) => row.shareId)).not.toContain('shr_stale');
  });

  it('does not show a share after the member is removed and joins again', async () => {
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
    const draft = await alice.personal.restoreOrCreateDraft();
    await alice.personal.updateDraftNote(draft.draftId, '门口的风');
    const saved = await alice.personal.saveTextMoment(draft.draftId);
    const preview = await alice.family.prepareSharePreview(saved.id);
    expect(
      (await alice.family.confirmShareMoment({ momentId: saved.id, sourceRevision: preview.sourceRevision })).status,
    ).toBe('stored');
    const first = await bob.refreshFamilyInbox();
    if (first.kind !== 'ready') throw new Error('expected ready');
    expect(first.items).toHaveLength(1);
    const bobUserId = receiveCache.shares[0]?.userId;
    expect(bobUserId).toBeTruthy();
    now += 60_000;
    await alice.family.removeMember(family.familyId, bobUserId as string);
    now += 60_000;
    const secondInvite = await alice.family.inviteMember(family.familyId);
    await bob.acceptInvitation(secondInvite.code);
    const again = await bob.refreshFamilyInbox();
    expect(again).toEqual({ kind: 'ready', familyId: family.familyId, items: [] });
    expect(receiveCache.shares).toEqual([]);
  });
});
