import { createAsset } from '../domain-adapters/asset-commands';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import {
  activateMoment,
  attachAsset,
  createDraftMoment,
  type MomentRecord,
} from '../domain-adapters/moment-commands';
import {
  classifyCopyError,
  createMemoryAudioCapture,
  createMemoryMediaStore,
  createQueuedImageSource,
} from '../infrastructure/media';
import { createMemoryRepositories } from '../infrastructure/repositories';
import {
  AUDIO_MISSING_LABEL,
  AUDIO_UNPLAYABLE_LABEL,
  CAMERA_DENIED_MESSAGE,
  IMAGE_MISSING_LABEL,
  IMAGE_UNDECODABLE_LABEL,
  LIBRARY_DENIED_MESSAGE,
  MIC_DENIED_MESSAGE,
  createUseCases,
} from './use-cases';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

function photo(id: string) {
  return { sourceUri: `memory://source/${id}.jpg`, mimeType: 'image/jpeg', width: 800, height: 600 };
}

function clip(id: string, durationMs = 3500) {
  return {
    sourceUri: `memory://recordings/${id}.m4a`,
    durationMs,
    mimeType: 'audio/mp4',
  };
}

function createRecoveryApp(options?: {
  library?: ReturnType<typeof createQueuedImageSource>;
  camera?: ReturnType<typeof createQueuedImageSource>;
  capture?: ReturnType<typeof createMemoryAudioCapture>;
  media?: ReturnType<typeof createMemoryMediaStore>;
  assetIds?: string[];
  momentSave?: (original: (moment: never) => Promise<void>) => (moment: never) => Promise<void>;
  assetSave?: (original: (asset: never) => Promise<void>) => (asset: never) => Promise<void>;
  draftSave?: (original: (draft: MomentRecord) => Promise<void>) => (draft: MomentRecord) => Promise<void>;
}) {
  const repos = createMemoryRepositories();
  const media = options?.media ?? createMemoryMediaStore();
  const library = options?.library ?? createQueuedImageSource();
  const camera = options?.camera ?? createQueuedImageSource();
  const capture = options?.capture ?? createMemoryAudioCapture();
  const assetIds = options?.assetIds ?? ['asset_a', 'asset_b', 'asset_c', 'asset_d'];
  let next = 0;
  if (options?.momentSave) {
    const original = repos.moments.save.bind(repos.moments);
    repos.moments.save = options.momentSave(original as never) as typeof repos.moments.save;
  }
  if (options?.assetSave) {
    const original = repos.assets.save.bind(repos.assets);
    repos.assets.save = options.assetSave(original as never) as typeof repos.assets.save;
  }
  if (options?.draftSave) {
    const original = repos.drafts.save.bind(repos.drafts);
    repos.drafts.save = options.draftSave(original) as typeof repos.drafts.save;
  }
  const app = createUseCases({
    ...repos,
    media,
    library,
    camera,
    capture,
    clock: clockAt('2026-09-24T12:00:00.000Z'),
    assetId: () => assetIds[next++] || `asset_extra_${next}`,
  });
  return { app, repos, media, library, camera, capture };
}

describe('media failure and permission recovery', () => {
  it('classifies disk-full separately from a generic copy failure', () => {
    expect(classifyCopyError({ code: 'ENOSPC', message: 'write' }).code).toBe('DISK_FULL');
    expect(classifyCopyError({ code: 'SQLITE_FULL', message: 'db' }).code).toBe('DISK_FULL');
    expect(classifyCopyError(new Error('copy failed')).code).toBe('COPY_FAILED');
  });

  it('retries library access after settings restore without discarding the draft', async () => {
    const library = createQueuedImageSource({
      permission: 'denied',
      picks: [[photo('after-settings')]],
    });
    const { app } = createRecoveryApp({ library, assetIds: ['asset_after'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '还想写下去');
    await expect(app.addLibraryImages(draft.draftId)).rejects.toMatchObject({
      code: 'LIBRARY_DENIED',
      message: LIBRARY_DENIED_MESSAGE,
    });
    library.permission = 'granted';
    const restored = await app.addLibraryImages(draft.draftId);
    expect(restored.draftId).toBe(draft.draftId);
    expect(restored.note).toBe('还想写下去');
    expect(restored.images.map((item) => item.id)).toEqual(['asset_after']);
    expect(library.requests).toBe(2);
  });

  it('retries camera access after settings restore without discarding the draft', async () => {
    const camera = createQueuedImageSource({
      permission: 'denied',
      picks: [[photo('camera-after')]],
    });
    const { app } = createRecoveryApp({ camera, assetIds: ['asset_camera'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '相机稍后打开');
    await expect(app.addCameraImage(draft.draftId)).rejects.toMatchObject({
      code: 'CAMERA_DENIED',
      message: CAMERA_DENIED_MESSAGE,
    });
    camera.permission = 'granted';
    const restored = await app.addCameraImage(draft.draftId);
    expect(restored.note).toBe('相机稍后打开');
    expect(restored.images[0].id).toBe('asset_camera');
  });

  it('retries the microphone after settings restore without discarding photos', async () => {
    const capture = createMemoryAudioCapture({ permission: 'denied' });
    const { app } = createRecoveryApp({
      capture,
      library: createQueuedImageSource({ picks: [[photo('kept')]] }),
      assetIds: ['asset_photo', 'asset_voice'],
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字和照片先留下');
    await app.addLibraryImages(draft.draftId);
    await expect(app.beginDraftRecording(draft.draftId)).rejects.toMatchObject({
      code: 'MIC_DENIED',
      message: MIC_DENIED_MESSAGE,
    });
    capture.permission = 'granted';
    await app.beginDraftRecording(draft.draftId);
    const stopped = await app.finishDraftRecording(draft.draftId);
    expect(stopped.note).toBe('字和照片先留下');
    expect(stopped.images).toHaveLength(1);
    expect(stopped.audio?.id).toBe('asset_voice');
  });

  it('keeps earlier photos and the note when a later persist hits disk full', async () => {
    const media = createMemoryMediaStore();
    const { app, repos } = createRecoveryApp({ media, assetIds: ['asset_kept', 'asset_full'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '先留下的字');
    await app.addPickedImages(draft.draftId, [photo('kept')]);
    media.failNextPersist('DISK_FULL');
    await expect(app.addPickedImages(draft.draftId, [photo('full')])).rejects.toMatchObject({
      code: 'DISK_FULL',
    });
    const restored = await app.restoreOrCreateDraft();
    expect(restored.note).toBe('先留下的字');
    expect(restored.images.map((item) => item.id)).toEqual(['asset_kept']);
    expect(media.persisted.size).toBe(1);
    expect(await repos.assets.findById('asset_full')).toEqual({ kind: 'missing' });
    expect((await app.getRecentLife()).items).toHaveLength(0);
  });

  it('does not write an asset or draft ref when the copied dest cannot be confirmed', async () => {
    const media = createMemoryMediaStore();
    const { app, repos } = createRecoveryApp({
      media,
      assetIds: ['asset_unconfirmed', 'asset_voice_unconfirmed'],
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '确认不了就不留下');
    media.failNextConfirm();
    await expect(app.addPickedImages(draft.draftId, [photo('unconfirmed')])).rejects.toMatchObject({
      code: 'COPY_FAILED',
    });
    media.failNextConfirm();
    await expect(app.addRecordedAudio(draft.draftId, clip('unconfirmed'))).rejects.toMatchObject({
      code: 'COPY_FAILED',
    });

    const restored = await app.restoreOrCreateDraft();
    expect(restored.draftId).toBe(draft.draftId);
    expect(restored.note).toBe('确认不了就不留下');
    expect(restored.images).toHaveLength(0);
    expect(restored.audio).toBeNull();
    expect(media.persisted.size).toBe(0);
    expect(await repos.assets.findById('asset_unconfirmed')).toEqual({ kind: 'missing' });
    expect(await repos.assets.findById('asset_voice_unconfirmed')).toEqual({ kind: 'missing' });
    const stored = await repos.drafts.loadActive();
    expect(stored?.id).toBe(draft.draftId);
    expect(stored?.content.note).toBe('确认不了就不留下');
    expect(stored?.assetIds).toEqual([]);
  });

  it('does not write a new asset when image copy fails', async () => {
    const media = createMemoryMediaStore();
    const { app, repos } = createRecoveryApp({ media, assetIds: ['asset_copy'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '复制失败');
    media.failNextPersist('COPY_FAILED');
    await expect(app.addPickedImages(draft.draftId, [photo('copy')])).rejects.toMatchObject({
      code: 'COPY_FAILED',
    });
    expect((await app.restoreOrCreateDraft()).images).toHaveLength(0);
    expect(media.persisted.size).toBe(0);
    expect(await repos.assets.findById('asset_copy')).toEqual({ kind: 'missing' });
  });

  it('rolls back an uncommitted asset when SQLite asset write fails, then retries once', async () => {
    let failAsset = true;
    const { app, repos, media } = createRecoveryApp({
      assetIds: ['asset_first', 'asset_retry'],
      assetSave: (original) => async (asset) => {
        if (failAsset) throw Object.assign(new Error('SQLITE_FULL'), { code: 'SQLITE_FULL' });
        return original(asset);
      },
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字还在');
    await expect(app.addPickedImages(draft.draftId, [photo('first')])).rejects.toMatchObject({
      code: 'DISK_FULL',
    });
    expect((await app.restoreOrCreateDraft()).images).toHaveLength(0);
    expect(await repos.assets.findById('asset_first')).toEqual({ kind: 'missing' });
    expect(media.removed).toEqual(['memory://assets/asset_first.jpg']);

    failAsset = false;
    const retried = await app.addPickedImages(draft.draftId, [photo('retry')]);
    expect(retried.images.map((item) => item.id)).toEqual(['asset_retry']);
    expect((await repos.assets.findById('asset_first')).kind).toBe('missing');
    expect((await repos.assets.findById('asset_retry')).kind).toBe('ready');
  });

  it('rolls back an uncommitted asset when draft write fails', async () => {
    let failDraft = false;
    const { app, repos, media } = createRecoveryApp({
      assetIds: ['asset_orphan'],
      draftSave: (original) => async (draft) => {
        if (failDraft && draft.assetIds.includes('asset_orphan')) {
          throw new Error('draft write failed');
        }
        return original(draft);
      },
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '草稿还在');
    failDraft = true;
    await expect(app.addPickedImages(draft.draftId, [photo('orphan')])).rejects.toMatchObject({
      code: 'REPOSITORY_WRITE_FAILED',
    });
    failDraft = false;
    const restored = await app.restoreOrCreateDraft();
    expect(restored.note).toBe('草稿还在');
    expect(restored.images).toHaveLength(0);
    expect(await repos.assets.findById('asset_orphan')).toEqual({ kind: 'missing' });
    expect(media.removed).toEqual(['memory://assets/asset_orphan.jpg']);
  });

  it('keeps a recorded clip off the draft when audio persist hits disk full', async () => {
    const media = createMemoryMediaStore();
    const { app, repos } = createRecoveryApp({ media, assetIds: ['asset_voice'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '声音没留下');
    media.failNextPersist('DISK_FULL');
    await expect(app.addRecordedAudio(draft.draftId, clip('voice'))).rejects.toMatchObject({
      code: 'DISK_FULL',
    });
    expect((await app.restoreOrCreateDraft()).audio).toBeNull();
    expect(await repos.assets.findById('asset_voice')).toEqual({ kind: 'missing' });
    expect(media.persisted.size).toBe(0);
  });

  it('keeps an existing moment unchanged when a later save cannot write', async () => {
    let failNext = false;
    const { app } = createRecoveryApp({
      assetIds: ['asset_old'],
      momentSave: (original) => async (moment) => {
        if (failNext) throw Object.assign(new Error('SQLITE_FULL'), { code: 'SQLITE_FULL' });
        return original(moment);
      },
    });
    const first = await app.restoreOrCreateDraft();
    await app.updateDraftNote(first.draftId, '已经留下');
    const saved = await app.saveTextMoment(first.draftId);

    failNext = true;
    const second = await app.restoreOrCreateDraft();
    await app.updateDraftNote(second.draftId, '这次失败');
    await expect(app.saveTextMoment(second.draftId)).rejects.toMatchObject({
      code: 'DISK_FULL',
    });
    expect((await app.getRecentLife()).items.map((item) => item.id)).toEqual([saved.id]);
    expect((await app.getRecentLife()).items[0].note).toBe('已经留下');
    expect((await app.restoreOrCreateDraft()).note).toBe('这次失败');

    failNext = false;
    const retried = await app.saveTextMoment(second.draftId);
    const again = await app.saveTextMoment(second.draftId);
    expect(again.id).toBe(retried.id);
    expect((await app.getRecentLife()).items.map((item) => item.note).sort()).toEqual([
      '已经留下',
      '这次失败',
    ]);
  });

  it('keeps a saved moment when one photo is missing and the other cannot decode', async () => {
    const media = createMemoryMediaStore();
    const { app } = createRecoveryApp({ media, assetIds: ['asset_gone', 'asset_broken'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字还在');
    await app.addPickedImages(draft.draftId, [photo('gone'), photo('broken')]);
    const saved = await app.saveTextMoment(draft.draftId);
    media.markMissing('memory://assets/asset_gone.jpg');
    media.markUndecodable('memory://assets/asset_broken.jpg');

    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind !== 'ready') return;
    expect(detail.note).toBe('字还在');
    expect(detail.images[0]).toMatchObject({
      reason: 'missing',
      unavailableLabel: IMAGE_MISSING_LABEL,
    });
    expect(detail.images[1]).toMatchObject({
      reason: 'undecodable',
      unavailableLabel: IMAGE_UNDECODABLE_LABEL,
    });
    expect(await app.getMomentDetail('moment_does_not_exist')).toEqual({
      kind: 'missing',
      requestedId: 'moment_does_not_exist',
    });
  });

  it('keeps other media when audio is missing or unplayable', async () => {
    const media = createMemoryMediaStore();
    const { app } = createRecoveryApp({
      media,
      library: createQueuedImageSource({ picks: [[photo('kept')]] }),
      assetIds: ['asset_photo', 'asset_voice'],
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字和照片还在');
    await app.addLibraryImages(draft.draftId);
    await app.addRecordedAudio(draft.draftId, clip('voice'));
    const saved = await app.saveTextMoment(draft.draftId);

    media.markUnplayable('memory://assets/asset_voice.m4a');
    const unplayable = await app.getMomentDetail(saved.id);
    expect(unplayable.kind).toBe('ready');
    if (unplayable.kind === 'ready') {
      expect(unplayable.images[0].status).toBe('available');
      expect(unplayable.audio?.reason).toBe('unplayable');
      expect(unplayable.audio?.unavailableLabel).toBe(AUDIO_UNPLAYABLE_LABEL);
    }

    media.markMissing('memory://assets/asset_voice.m4a');
    const missing = await app.getMomentDetail(saved.id);
    expect(missing.kind).toBe('ready');
    if (missing.kind === 'ready') {
      expect(missing.note).toBe('字和照片还在');
      expect(missing.images[0].status).toBe('available');
      expect(missing.audio?.reason).toBe('missing');
      expect(missing.audio?.unavailableLabel).toBe(AUDIO_MISSING_LABEL);
    }
  });

  it('restores a draft after a persist failure and a new use-case instance', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const first = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T16:00:00.000Z'),
      assetId: () => 'asset_kept',
    });
    const draft = await first.restoreOrCreateDraft();
    await first.updateDraftNote(draft.draftId, '重启还在');
    await first.addPickedImages(draft.draftId, [photo('kept')]);
    media.failNextPersist('COPY_FAILED');
    await expect(first.addPickedImages(draft.draftId, [photo('lost')])).rejects.toMatchObject({
      code: 'COPY_FAILED',
    });

    const restarted = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T16:01:00.000Z'),
    });
    const restored = await restarted.restoreOrCreateDraft();
    expect(restored.draftId).toBe(draft.draftId);
    expect(restored.isRestored).toBe(true);
    expect(restored.note).toBe('重启还在');
    expect(restored.images.map((item) => item.id)).toEqual(['asset_kept']);
    expect((await restarted.getRecentLife()).items).toHaveLength(0);
  });

  it('keeps a referenced file when lookup cannot confirm it is unused', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const persisted = await media.persistAudio({
      assetId: 'asset_unknown',
      sourceUri: 'memory://recordings/unknown.m4a',
      mimeType: 'audio/mp4',
    });
    await repos.assets.save(
      createAsset(
        {
          id: 'asset_unknown',
          ownerId: LOCAL_OWNER_ID,
          type: 'audio',
          captureTimeSource: 'system',
          localUri: persisted.localUri,
          storage: { status: 'local' },
          metadata: { mimeType: 'audio/mp4', durationMs: 1000 },
        },
        { now: () => new Date('2026-09-24T12:00:00.000Z'), ownerId: LOCAL_OWNER_ID },
      ),
    );
    const now = new Date('2026-09-24T12:00:00.000Z');
    let moment = createDraftMoment(
      {
        ownerId: LOCAL_OWNER_ID,
        content: { note: 'old' },
        time: { recordedAt: now.toISOString(), occurredAtPrecision: 'unknown' },
        origin: { type: 'created' },
      },
      { now: () => now, ownerId: LOCAL_OWNER_ID, id: () => 'moment_unknown' },
    );
    moment = attachAsset(moment, 'asset_unknown', LOCAL_OWNER_ID, now);
    moment = activateMoment(moment, LOCAL_OWNER_ID, now);
    await repos.moments.save(moment);
    repos.moments.lookupAssetReferences = async () => 'unknown';

    const app = createUseCases({
      ...repos,
      media,
      capture: createMemoryAudioCapture(),
      clock: clockAt('2026-09-24T12:00:00.000Z'),
      assetId: () => 'asset_new',
    });
    const draft = await app.restoreOrCreateDraft();
    const stored = await repos.drafts.loadActive();
    if (!stored) throw new Error('expected draft');
    await repos.drafts.save(attachAsset(stored, 'asset_unknown', LOCAL_OWNER_ID, now));
    await app.removeDraftAudio(draft.draftId);
    expect(media.removed).toEqual([]);
    expect(await media.exists(persisted.localUri)).toBe(true);
  });
});
