import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createMapAppleVerifier } from './apple';
import { createFamilyCommands } from './commands';
import { FAMILY_ERROR } from './errors';
import { createDirectoryMediaBlobStore, createMemoryMediaBlobStore } from './media-blobs';
import { sampleJpegBytes } from './media-validate';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createFamilyStore } from './store';
import type { ShareMomentInput } from './types';

function setup() {
  const store = createFamilyStore();
  const blobs = createMemoryMediaBlobStore();
  const commands = createFamilyCommands({
    store,
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice' },
      apple_bob: { appleSubject: 'apple.bob' },
      apple_cara: { appleSubject: 'apple.cara' },
    }),
    clock: { now: () => new Date('2026-09-25T04:00:00.000Z') },
    mediaBlobs: blobs,
  });
  return { commands, store, blobs };
}

function textShare(overrides: Partial<ShareMomentInput> = {}): ShareMomentInput {
  return {
    sourceMomentId: 'moment_gate',
    sourceRevision: 1,
    note: '门口的风',
    emotion: '平静',
    occurredAt: '2026-09-25T03:00:00.000Z',
    occurredAtPrecision: 'exact',
    mediaObjectIds: [],
    expectedMediaCount: 0,
    ...overrides,
  };
}

describe('family share snapshot commands', () => {
  it('saves an immutable whitelist snapshot and hides it from later joiners', async () => {
    const { commands } = setup();
    const alice = await commands.signInWithApple('apple_alice');
    const family = await commands.createFamily(alice.sessionToken, 'fam-1');
    const media = await commands.uploadMedia(alice.sessionToken, { bytes: sampleJpegBytes(), mimeType: 'image/jpeg' });
    const shared = await commands.shareMoment(alice.sessionToken, family.familyId, {
      ...textShare(),
      mediaObjectIds: [media.objectId],
      expectedMediaCount: 1,
      idempotencyKey: 'share-1',
    });

    expect(shared.stored).toBe('server');
    expect(shared.sourceRevision).toBe(1);
    expect(shared.snapshot.note).toBe('门口的风');
    expect(shared.snapshot.emotion).toBe('平静');
    expect(shared.snapshot.media).toEqual([
      { objectId: media.objectId, mimeType: 'image/jpeg', byteLength: sampleJpegBytes().length },
    ]);
    expect(shared.snapshot.origin).toEqual({
      type: 'received',
      transmissionId: shared.shareId,
      originalMomentId: 'moment_gate',
      snapshotRevision: 1,
    });
    expect(JSON.stringify(shared)).not.toMatch(/localUri|people|家人已收到/);
    expect(shared.audienceUserIds).toEqual([alice.userId]);

    const invite = await commands.inviteMember(alice.sessionToken, family.familyId, 'inv-1');
    const bob = await commands.signInWithApple('apple_bob');
    await commands.acceptInvitation(bob.sessionToken, invite.code, 'accept-1');
    await expect(commands.getShare(bob.sessionToken, family.familyId, shared.shareId)).rejects.toMatchObject({
      code: FAMILY_ERROR.FORBIDDEN,
    });
    expect((await commands.getShare(alice.sessionToken, family.familyId, shared.shareId)).shareId).toBe(shared.shareId);
  });

  it('refuses unauthenticated, non-members, others media, incomplete media, and membership loss before confirm', async () => {
    const { commands } = setup();
    const alice = await commands.signInWithApple('apple_alice');
    const family = await commands.createFamily(alice.sessionToken, 'fam-1');
    const invite = await commands.inviteMember(alice.sessionToken, family.familyId, 'inv-1');
    const bob = await commands.signInWithApple('apple_bob');
    const cara = await commands.signInWithApple('apple_cara');
    await expect(commands.shareMoment('', family.familyId, textShare())).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
    await expect(commands.shareMoment(cara.sessionToken, family.familyId, textShare())).rejects.toMatchObject({
      code: FAMILY_ERROR.NOT_IN_FAMILY,
    });

    const aliceMedia = await commands.uploadMedia(alice.sessionToken, {
      bytes: sampleJpegBytes(),
      mimeType: 'image/jpeg',
    });
    await expect(
      commands.shareMoment(bob.sessionToken, family.familyId, {
        ...textShare(),
        mediaObjectIds: [aliceMedia.objectId],
        expectedMediaCount: 1,
      }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.NOT_IN_FAMILY });

    await commands.acceptInvitation(bob.sessionToken, invite.code, 'accept-1');
    await expect(
      commands.shareMoment(bob.sessionToken, family.familyId, {
        ...textShare({ sourceMomentId: 'moment_bob' }),
        mediaObjectIds: [aliceMedia.objectId],
        expectedMediaCount: 1,
      }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.FORBIDDEN });

    await expect(
      commands.shareMoment(alice.sessionToken, family.familyId, {
        ...textShare(),
        mediaObjectIds: [aliceMedia.objectId],
        expectedMediaCount: 2,
      }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.SHARE_MEDIA_INCOMPLETE });

    await commands.removeMember(alice.sessionToken, family.familyId, bob.userId);
    await expect(commands.shareMoment(bob.sessionToken, family.familyId, textShare())).rejects.toMatchObject({
      code: FAMILY_ERROR.NOT_IN_FAMILY,
    });
  });

  it('replays duplicate and concurrent confirms as one share, and keeps the snapshot after a later edit payload', async () => {
    const { commands } = setup();
    const alice = await commands.signInWithApple('apple_alice');
    const family = await commands.createFamily(alice.sessionToken, 'fam-1');
    const payload = { ...textShare(), idempotencyKey: 'share-dup' };
    const [first, second, concurrent] = await Promise.all([
      commands.shareMoment(alice.sessionToken, family.familyId, payload),
      commands.shareMoment(alice.sessionToken, family.familyId, payload),
      commands.shareMoment(alice.sessionToken, family.familyId, { ...textShare(), idempotencyKey: 'share-other-key' }),
    ]);
    expect(second.shareId).toBe(first.shareId);
    expect(concurrent.shareId).toBe(first.shareId);

    await expect(
      commands.shareMoment(alice.sessionToken, family.familyId, {
        ...textShare({ note: '改过的门口' }),
        idempotencyKey: 'share-dup',
      }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.CONFLICT });

    const edited = await commands.shareMoment(alice.sessionToken, family.familyId, {
      ...textShare({ note: '改过的门口', sourceRevision: 2 }),
      idempotencyKey: 'share-rev2',
    });
    expect(edited.shareId).not.toBe(first.shareId);
    expect((await commands.getShare(alice.sessionToken, family.familyId, first.shareId)).snapshot.note).toBe(
      '门口的风',
    );
    expect(edited.snapshot.note).toBe('改过的门口');
  });

  it('does not save a share when selected media cannot be read', async () => {
    const { commands, blobs, store } = setup();
    const alice = await commands.signInWithApple('apple_alice');
    const family = await commands.createFamily(alice.sessionToken, 'fam-1');
    const media = await commands.uploadMedia(alice.sessionToken, { bytes: sampleJpegBytes(), mimeType: 'image/jpeg' });
    await blobs.remove(media.objectId);
    await expect(
      commands.shareMoment(alice.sessionToken, family.familyId, {
        ...textShare(),
        mediaObjectIds: [media.objectId],
        expectedMediaCount: 1,
      }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.SHARE_MEDIA_UNAVAILABLE });
    expect(store.shares).toEqual([]);
  });

  it('keeps shares after reopening SQLite', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-f3-share-'));
    try {
      const file = path.join(dir, 'family.db');
      const mediaRoot = path.join(dir, 'media');
      const firstDb = openFamilySqliteDatabase(file);
      await applyFamilyApiSchema(firstDb);
      const first = createFamilyCommands({
        repository: createSqliteFamilyRepository(firstDb),
        apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
        clock: { now: () => new Date('2026-09-25T04:00:00.000Z') },
        mediaBlobs: createDirectoryMediaBlobStore(mediaRoot),
      });
      const alice = await first.signInWithApple('apple_alice');
      const family = await first.createFamily(alice.sessionToken, 'fam-1');
      const shared = await first.shareMoment(alice.sessionToken, family.familyId, textShare({ idempotencyKey: 's1' }));
      await firstDb.close();

      const secondDb = openFamilySqliteDatabase(file);
      const second = createFamilyCommands({
        repository: createSqliteFamilyRepository(secondDb),
        apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
        clock: { now: () => new Date('2026-09-25T04:00:00.000Z') },
        mediaBlobs: createDirectoryMediaBlobStore(mediaRoot),
      });
      const again = await second.shareMoment(alice.sessionToken, family.familyId, textShare({ idempotencyKey: 's1' }));
      expect(again.shareId).toBe(shared.shareId);
      expect((await second.getShare(alice.sessionToken, family.familyId, shared.shareId)).snapshot.note).toBe(
        '门口的风',
      );
      await secondDb.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
