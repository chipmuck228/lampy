import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createMapAppleVerifier } from './apple';
import { createFamilyCommands } from './commands';
import { FAMILY_ERROR, FamilyError } from './errors';
import { createDirectoryMediaBlobStore, createMemoryMediaBlobStore } from './media-blobs';
import { MEDIA_MAX_BYTES, sampleAudioBytes, sampleJpegBytes, samplePngBytes } from './media-validate';
import { openFamilySqliteDatabase } from './node-db';
import { applyFamilyApiSchema } from './schema';
import { createMemoryFamilyRepository } from './repository';
import { createSqliteFamilyRepository } from './sqlite-repository';
import { createFamilyStore } from './store';

function setup(options?: { now?: Date; sessionTtlMs?: number; blobs?: ReturnType<typeof createMemoryMediaBlobStore> }) {
  let now = options?.now ?? new Date('2026-09-25T02:00:00.000Z');
  const blobs = options?.blobs ?? createMemoryMediaBlobStore();
  const store = createFamilyStore();
  const commands = createFamilyCommands({
    store,
    apple: createMapAppleVerifier({
      apple_alice: { appleSubject: 'apple.alice' },
      apple_bob: { appleSubject: 'apple.bob' },
    }),
    clock: { now: () => now },
    sessionTtlMs: options?.sessionTtlMs ?? 60_000,
    mediaBlobs: blobs,
  });
  return {
    commands,
    store,
    blobs,
    setNow(next: Date) {
      now = next;
    },
  };
}

describe('family media object commands', () => {
  it('stores owner-bound objects without local paths and refuses other accounts', async () => {
    const { commands, store, blobs } = setup();
    const alice = await commands.signInWithApple('apple_alice');
    const bob = await commands.signInWithApple('apple_bob');
    const jpeg = sampleJpegBytes();
    const uploaded = await commands.uploadMedia(alice.sessionToken, {
      bytes: jpeg,
      mimeType: 'image/jpeg',
    });

    expect(uploaded.objectId).toMatch(/^med_[a-f0-9]+$/);
    expect(uploaded.ownerUserId).toBe(alice.userId);
    expect(uploaded.mimeType).toBe('image/jpeg');
    expect(uploaded.byteLength).toBe(jpeg.length);
    expect(JSON.stringify(uploaded)).not.toMatch(/localUri|\/Users\/|file:\/\//);
    expect(store.mediaObjects[0]?.storageKey).toBe(uploaded.objectId);
    expect(store.mediaObjects[0]?.storageKey).not.toMatch(/\/|\\/);

    const meta = await commands.getMediaObject(alice.sessionToken, uploaded.objectId);
    expect(meta.objectId).toBe(uploaded.objectId);
    const content = await commands.getMediaContent(alice.sessionToken, uploaded.objectId);
    expect(Array.from(content.bytes)).toEqual(Array.from(jpeg));

    await expect(commands.getMediaObject(bob.sessionToken, uploaded.objectId)).rejects.toMatchObject({
      code: FAMILY_ERROR.FORBIDDEN,
    });
    await expect(commands.getMediaContent(bob.sessionToken, uploaded.objectId)).rejects.toMatchObject({
      code: FAMILY_ERROR.FORBIDDEN,
    });
    expect(blobs.files.size).toBe(1);

    const family = await commands.createFamily(alice.sessionToken, 'fam-media');
    await commands.dissolveFamily(alice.sessionToken, family.familyId);
    expect((await commands.getMediaObject(alice.sessionToken, uploaded.objectId)).objectId).toBe(uploaded.objectId);
  });

  it('reuses the same object for duplicate hash or matching idempotency key', async () => {
    const { commands, blobs } = setup();
    const alice = await commands.signInWithApple('apple_alice');
    const jpeg = sampleJpegBytes();
    const first = await commands.uploadMedia(alice.sessionToken, {
      bytes: jpeg,
      mimeType: 'image/jpeg',
      idempotencyKey: 'photo-1',
    });
    const replay = await commands.uploadMedia(alice.sessionToken, {
      bytes: jpeg,
      mimeType: 'image/jpeg',
      idempotencyKey: 'photo-1',
    });
    const sameHash = await commands.uploadMedia(alice.sessionToken, {
      bytes: jpeg,
      mimeType: 'image/jpeg',
      idempotencyKey: 'photo-2',
    });
    expect(replay.objectId).toBe(first.objectId);
    expect(sameHash.objectId).toBe(first.objectId);
    expect(blobs.files.size).toBe(1);

    const bob = await commands.signInWithApple('apple_bob');
    const bobCopy = await commands.uploadMedia(bob.sessionToken, {
      bytes: jpeg,
      mimeType: 'image/jpeg',
    });
    expect(bobCopy.objectId).not.toBe(first.objectId);
    expect(blobs.files.size).toBe(2);

    await expect(
      commands.uploadMedia(alice.sessionToken, {
        bytes: samplePngBytes(),
        mimeType: 'image/png',
        idempotencyKey: 'photo-1',
      }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.CONFLICT });
    expect(blobs.files.size).toBe(2);
  });

  it('does not return saved when blob write or metadata commit fails, and removes the orphan', async () => {
    const failingWrite = createMemoryMediaBlobStore();
    failingWrite.write = async () => {
      throw new FamilyError(FAMILY_ERROR.MEDIA_WRITE_FAILED, 'Not enough disk space to store media.');
    };
    const writeFail = setup({ blobs: failingWrite });
    const alice = await writeFail.commands.signInWithApple('apple_alice');
    await expect(
      writeFail.commands.uploadMedia(alice.sessionToken, { bytes: sampleJpegBytes(), mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.MEDIA_WRITE_FAILED });
    expect(writeFail.store.mediaObjects).toEqual([]);
    expect(failingWrite.files.size).toBe(0);

    const blobs = createMemoryMediaBlobStore();
    const store = createFamilyStore();
    const base = createFamilyCommands({
      store,
      apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
      clock: { now: () => new Date('2026-09-25T02:00:00.000Z') },
      mediaBlobs: blobs,
    });
    const signed = await base.signInWithApple('apple_alice');
    const repository = createMemoryFamilyRepository(store);
    let commits = 0;
    const wrapped = {
      withTransaction<T>(work: Parameters<typeof repository.withTransaction>[0]): Promise<T> {
        commits += 1;
        if (commits >= 2) {
          return Promise.reject(new Error('disk full'));
        }
        return repository.withTransaction(work);
      },
    };
    const failingMeta = createFamilyCommands({
      store,
      repository: wrapped,
      apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
      clock: { now: () => new Date('2026-09-25T02:00:00.000Z') },
      mediaBlobs: blobs,
    });
    await expect(
      failingMeta.uploadMedia(signed.sessionToken, { bytes: sampleJpegBytes(), mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.MEDIA_WRITE_FAILED });
    expect(store.mediaObjects).toEqual([]);
    expect(blobs.files.size).toBe(0);
  });

  it('rejects oversized, unsupported, corrupt, missing, and expired-session reads', async () => {
    const { commands, blobs, setNow } = setup({ sessionTtlMs: 60_000 });
    const alice = await commands.signInWithApple('apple_alice');
    const tooLarge = new Uint8Array(MEDIA_MAX_BYTES + 1);
    tooLarge[0] = 0xff;
    tooLarge[1] = 0xd8;
    tooLarge[2] = 0xff;
    await expect(
      commands.uploadMedia(alice.sessionToken, { bytes: tooLarge, mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.MEDIA_TOO_LARGE });

    await expect(
      commands.uploadMedia(alice.sessionToken, { bytes: sampleJpegBytes(), mimeType: 'application/json' }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.MEDIA_UNSUPPORTED });

    await expect(
      commands.uploadMedia(alice.sessionToken, {
        bytes: new Uint8Array([0x00, 0x01, 0x02]),
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ code: FAMILY_ERROR.MEDIA_CORRUPT });

    await expect(commands.getMediaObject(alice.sessionToken, 'med_missing')).rejects.toMatchObject({
      code: FAMILY_ERROR.MEDIA_NOT_FOUND,
    });

    const stored = await commands.uploadMedia(alice.sessionToken, {
      bytes: sampleAudioBytes(),
      mimeType: 'audio/mp4',
    });
    await blobs.remove(stored.objectId);
    await expect(commands.getMediaContent(alice.sessionToken, stored.objectId)).rejects.toMatchObject({
      code: FAMILY_ERROR.MEDIA_NOT_FOUND,
    });

    blobs.files.set(stored.objectId, new Uint8Array([0x00]));
    await expect(commands.getMediaContent(alice.sessionToken, stored.objectId)).rejects.toMatchObject({
      code: FAMILY_ERROR.MEDIA_NOT_FOUND,
    });

    await expect(commands.getMediaObject('', stored.objectId)).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
    setNow(new Date('2026-09-25T02:02:00.000Z'));
    await expect(commands.getMediaObject(alice.sessionToken, stored.objectId)).rejects.toMatchObject({
      code: FAMILY_ERROR.UNAUTHENTICATED,
    });
  });

  it('keeps media after a SQLite reopen and does not treat leftover partial files as readable', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-f2-media-'));
    try {
      const databasePath = path.join(dir, 'family.db');
      const mediaRoot = path.join(dir, 'media');
      const firstDb = openFamilySqliteDatabase(databasePath);
      await applyFamilyApiSchema(firstDb);
      const first = createFamilyCommands({
        repository: createSqliteFamilyRepository(firstDb),
        apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
        clock: { now: () => new Date('2026-09-25T03:00:00.000Z') },
        mediaBlobs: createDirectoryMediaBlobStore(mediaRoot),
      });
      const alice = await first.signInWithApple('apple_alice');
      const jpeg = sampleJpegBytes();
      const uploaded = await first.uploadMedia(alice.sessionToken, { bytes: jpeg, mimeType: 'image/jpeg' });
      writeFileSync(path.join(mediaRoot, `${uploaded.objectId}.partial`), Buffer.from([0xff, 0xd8]));
      const names = readdirSync(mediaRoot);
      expect(names).toContain(uploaded.objectId);
      expect(names.every((name) => name === uploaded.objectId || name.endsWith('.partial'))).toBe(true);
      expect(names.join(',')).not.toMatch(/localUri|\/Users\//);
      await firstDb.close();

      const secondDb = openFamilySqliteDatabase(databasePath);
      const second = createFamilyCommands({
        repository: createSqliteFamilyRepository(secondDb),
        apple: createMapAppleVerifier({ apple_alice: { appleSubject: 'apple.alice' } }),
        clock: { now: () => new Date('2026-09-25T03:00:00.000Z') },
        mediaBlobs: createDirectoryMediaBlobStore(mediaRoot),
      });
      const content = await second.getMediaContent(alice.sessionToken, uploaded.objectId);
      expect(Array.from(content.bytes)).toEqual(Array.from(jpeg));
      expect(JSON.stringify(await second.getMediaObject(alice.sessionToken, uploaded.objectId))).not.toMatch(
        mediaRoot,
      );
      expect(existsSync(path.join(mediaRoot, uploaded.objectId))).toBe(true);
      await secondDb.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects storage keys that could escape the media directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lampy-f2-blob-'));
    try {
      const store = createDirectoryMediaBlobStore(dir);
      await expect(store.write('../escape', sampleJpegBytes())).rejects.toMatchObject({
        code: FAMILY_ERROR.MEDIA_NOT_FOUND,
      });
      await expect(store.read('med_not_here')).rejects.toMatchObject({ code: FAMILY_ERROR.MEDIA_NOT_FOUND });
      expect(existsSync(path.join(dir, '..', 'escape'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
