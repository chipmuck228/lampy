import { createAsset } from '../domain-adapters/asset-commands';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import {
  activateMoment,
  attachAsset,
  createDraftMoment,
} from '../domain-adapters/moment-commands';
import {
  createMemoryAudioCapture,
  createMemoryMediaStore,
  createQueuedImageSource,
} from '../infrastructure/media';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { ApplicationError } from './errors';
import { AUDIO_UNAVAILABLE_LABEL, UNKNOWN_UNAVAILABLE_LABEL, createUseCases } from './use-cases';

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

function createAudioApp(options?: {
  capture?: ReturnType<typeof createMemoryAudioCapture>;
  media?: ReturnType<typeof createMemoryMediaStore>;
  library?: ReturnType<typeof createQueuedImageSource>;
  assetIds?: string[];
  momentSave?: (original: (moment: never) => Promise<void>) => (moment: never) => Promise<void>;
}) {
  const repos = createMemoryRepositories();
  const media = options?.media ?? createMemoryMediaStore();
  const capture = options?.capture ?? createMemoryAudioCapture();
  const library = options?.library ?? createQueuedImageSource();
  const assetIds = options?.assetIds ?? ['asset_sound', 'asset_extra'];
  let next = 0;
  if (options?.momentSave) {
    const original = repos.moments.save.bind(repos.moments);
    repos.moments.save = options.momentSave(original as never) as typeof repos.moments.save;
  }
  const app = createUseCases({
    ...repos,
    media,
    capture,
    library,
    clock: clockAt('2026-09-24T12:00:00.000Z'),
    assetId: () => assetIds[next++] || `asset_extra_${next}`,
  });
  return { app, repos, media, capture, library };
}

describe('audio personal moment use cases', () => {
  it('saves an audio-only moment', async () => {
    const { app } = createAudioApp({ assetIds: ['asset_voice'] });
    const draft = await app.restoreOrCreateDraft();
    await app.beginDraftRecording(draft.draftId);
    const stopped = await app.finishDraftRecording(draft.draftId);
    expect(stopped.audio?.status).toBe('available');
    expect(stopped.audio?.durationLabel).toBe('4秒');

    const saved = await app.saveTextMoment(draft.draftId);
    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind !== 'ready') return;
    expect(detail.note).toBe('');
    expect(detail.audio?.id).toBe('asset_voice');
    expect(detail.audio?.uri).toBe('memory://assets/asset_voice.m4a');
    expect(detail.images).toHaveLength(0);
  });

  it('saves text plus audio', async () => {
    const { app } = createAudioApp({ assetIds: ['asset_mixed'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '门口的风');
    await app.addRecordedAudio(draft.draftId, clip('mixed'));
    const saved = await app.saveTextMoment(draft.draftId);
    const recent = await app.getRecentLife();
    expect(recent.items[0].note).toBe('门口的风');
    expect(recent.items[0].audio?.status).toBe('available');
    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.note).toBe('门口的风');
      expect(detail.audio?.durationMs).toBe(3500);
    }
  });

  it('saves a photo plus audio without counting the sound as a photo', async () => {
    const { app } = createAudioApp({ assetIds: ['asset_photo', 'asset_voice'] });
    const draft = await app.restoreOrCreateDraft();
    await app.addPickedImages(draft.draftId, [photo('one')]);
    await app.addRecordedAudio(draft.draftId, clip('with-photo'));
    const composer = await app.restoreOrCreateDraft();
    expect(composer.images).toHaveLength(1);
    expect(composer.images[0].label).toBe('照片 1/1');
    expect(composer.audio?.id).toBe('asset_voice');

    const saved = await app.saveTextMoment(draft.draftId);
    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.images).toHaveLength(1);
      expect(detail.audio?.status).toBe('available');
    }
  });

  it('blocks a second audio clip without writing another asset', async () => {
    const { app, media, repos } = createAudioApp({
      assetIds: ['asset_first', 'asset_second'],
    });
    const draft = await app.restoreOrCreateDraft();
    await app.addRecordedAudio(draft.draftId, clip('first'));
    await expect(app.addRecordedAudio(draft.draftId, clip('second'))).rejects.toMatchObject({
      code: 'AUDIO_LIMIT',
      message: '每条最多一段声音',
    });
    await expect(app.beginDraftRecording(draft.draftId)).rejects.toBeInstanceOf(ApplicationError);
    expect((await app.restoreOrCreateDraft()).audio?.id).toBe('asset_first');
    expect(media.persisted.size).toBe(1);
    expect(await repos.assets.findById('asset_second')).toEqual({ kind: 'missing' });
  });

  it('does not request the microphone until the user starts a recording', async () => {
    const capture = createMemoryAudioCapture();
    const { app } = createAudioApp({ capture });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '只写字');
    expect(capture.requests).toBe(0);
    expect(capture.starts).toBe(0);
  });

  it('keeps text and photos after the microphone is refused', async () => {
    const capture = createMemoryAudioCapture({ permission: 'denied' });
    const { app, media } = createAudioApp({
      capture,
      library: createQueuedImageSource({ picks: [[photo('kept')]] }),
      assetIds: ['asset_photo'],
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '还想写下去');
    await app.addLibraryImages(draft.draftId);
    await expect(app.beginDraftRecording(draft.draftId)).rejects.toMatchObject({
      code: 'MIC_DENIED',
    });
    expect(capture.starts).toBe(0);
    const restored = await app.restoreOrCreateDraft();
    expect(restored.note).toBe('还想写下去');
    expect(restored.images).toHaveLength(1);
    expect(restored.audio).toBeNull();
    expect(media.persisted.size).toBe(1);
  });

  it('restores a draft recording after a new use-case instance is created', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const first = createUseCases({
      ...repos,
      media,
      capture: createMemoryAudioCapture(),
      clock: clockAt('2026-09-24T13:00:00.000Z'),
      assetId: () => 'asset_restore',
    });
    const draft = await first.restoreOrCreateDraft();
    await first.updateDraftNote(draft.draftId, '还没留下');
    await first.addRecordedAudio(draft.draftId, clip('keep'));

    const restarted = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T13:01:00.000Z'),
    });
    const restored = await restarted.restoreOrCreateDraft();
    expect(restored.draftId).toBe(draft.draftId);
    expect(restored.isRestored).toBe(true);
    expect(restored.audio?.id).toBe('asset_restore');
    expect((await restarted.getRecentLife()).items).toHaveLength(0);
  });

  it('keeps the draft after save fails and does not create another moment or audio asset on retry', async () => {
    let failNext = false;
    const { app, repos, media } = createAudioApp({
      assetIds: ['asset_once'],
      momentSave: (original) => async (moment) => {
        if (failNext) throw new Error('disk full');
        return original(moment);
      },
    });
    const draft = await app.restoreOrCreateDraft();
    await app.addRecordedAudio(draft.draftId, clip('once'));
    failNext = true;
    await expect(app.saveTextMoment(draft.draftId)).rejects.toThrow('disk full');
    expect((await app.getRecentLife()).items).toHaveLength(0);
    expect((await app.restoreOrCreateDraft()).audio?.id).toBe('asset_once');
    expect(media.persisted.size).toBe(1);

    failNext = false;
    const first = await app.saveTextMoment(draft.draftId);
    const second = await app.saveTextMoment(draft.draftId);
    expect(second.id).toBe(first.id);
    expect((await app.getRecentLife()).items).toHaveLength(1);
    expect(media.persisted.size).toBe(1);
    expect((await repos.assets.findById('asset_once')).kind).toBe('ready');
  });

  it('keeps a partial recording when the session is interrupted', async () => {
    const capture = createMemoryAudioCapture({
      interruptClip: clip('kept-interrupt', 1200),
    });
    const { app } = createAudioApp({ capture, assetIds: ['asset_interrupt'] });
    const draft = await app.restoreOrCreateDraft();
    await app.beginDraftRecording(draft.draftId);
    const result = await app.interruptDraftRecording(draft.draftId);
    expect(result.hadSession).toBe(true);
    expect(result.kept).toBe(true);
    expect(result.composer.audio?.durationMs).toBe(1200);
    expect(capture.recording).toBe(false);
  });

  it('explains that nothing was kept when an interrupt happens before any audio exists', async () => {
    const capture = createMemoryAudioCapture({ interruptClip: null });
    const { app } = createAudioApp({ capture });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字还在');
    await app.beginDraftRecording(draft.draftId);
    const result = await app.interruptDraftRecording(draft.draftId);
    expect(result.kept).toBe(false);
    expect(result.composer.audio).toBeNull();
    expect(result.composer.note).toBe('字还在');
  });

  it('keeps the moment and other content when the audio cannot be played or the file is missing', async () => {
    const media = createMemoryMediaStore();
    const { app } = createAudioApp({ media, assetIds: ['asset_broken'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字还在');
    await app.addRecordedAudio(draft.draftId, clip('broken'));
    const saved = await app.saveTextMoment(draft.draftId);
    media.markUnplayable('memory://assets/asset_broken.m4a');

    const unplayable = await app.getMomentDetail(saved.id);
    expect(unplayable.kind).toBe('ready');
    if (unplayable.kind === 'ready') {
      expect(unplayable.note).toBe('字还在');
      expect(unplayable.audio?.status).toBe('unavailable');
      expect(unplayable.audio?.unavailableLabel).toBe('这段声音暂时无法播放，其他内容仍然保留。');
    }

    media.markMissing('memory://assets/asset_broken.m4a');
    const missing = await app.getMomentDetail(saved.id);
    expect(missing.kind).toBe('ready');
    if (missing.kind === 'ready') {
      expect(missing.id).toBe(saved.id);
      expect(missing.audio?.status).toBe('unavailable');
    }
  });

  it('ignores a second start while a recording is already in progress', async () => {
    const capture = createMemoryAudioCapture();
    const { app } = createAudioApp({ capture, assetIds: ['asset_busy'] });
    const draft = await app.restoreOrCreateDraft();
    await app.beginDraftRecording(draft.draftId);
    await expect(app.beginDraftRecording(draft.draftId)).rejects.toMatchObject({
      code: 'AUDIO_BUSY',
    });
    expect(capture.starts).toBe(1);
    const stopped = await app.finishDraftRecording(draft.draftId);
    expect(stopped.audio?.id).toBe('asset_busy');
  });

  it('shows the same audio after a new use-case instance reads the saved moment', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const first = createUseCases({
      ...repos,
      media,
      capture: createMemoryAudioCapture(),
      clock: clockAt('2026-09-24T14:00:00.000Z'),
      assetId: () => 'asset_restart',
    });
    const draft = await first.restoreOrCreateDraft();
    await first.updateDraftNote(draft.draftId, '关掉再打开还有声音');
    await first.addRecordedAudio(draft.draftId, clip('restart'));
    const saved = await first.saveTextMoment(draft.draftId);

    const restarted = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T14:01:00.000Z'),
    });
    const recent = await restarted.getRecentLife();
    expect(recent.items[0].id).toBe(saved.id);
    expect(recent.items[0].audio?.uri).toBe('memory://assets/asset_restart.m4a');
    const detail = await restarted.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.note).toBe('关掉再打开还有声音');
      expect(detail.audio?.status).toBe('available');
    }
  });

  it('removes a draft recording and only deletes the app-owned file', async () => {
    const { app, media } = createAudioApp({ assetIds: ['asset_remove'] });
    const draft = await app.restoreOrCreateDraft();
    await app.addRecordedAudio(draft.draftId, clip('remove'));
    await app.removeDraftAudio(draft.draftId);
    expect((await app.restoreOrCreateDraft()).audio).toBeNull();
    expect(media.removed).toEqual(['memory://assets/asset_remove.m4a']);
  });

  it('keeps the previous draft sound when a replacement recording cannot start', async () => {
    const capture = createMemoryAudioCapture({ permission: 'denied' });
    const { app, media } = createAudioApp({ capture, assetIds: ['asset_kept'] });
    const draft = await app.restoreOrCreateDraft();
    await app.addRecordedAudio(draft.draftId, clip('kept'));
    await expect(app.beginDraftRecording(draft.draftId, { replace: true })).rejects.toMatchObject({
      code: 'MIC_DENIED',
    });
    expect(capture.starts).toBe(0);
    const restored = await app.restoreOrCreateDraft();
    expect(restored.audio?.id).toBe('asset_kept');
    expect(restored.audio?.status).toBe('available');
    expect(restored.audio?.uri).toBe('memory://assets/asset_kept.m4a');
    expect(media.removed).toEqual([]);
    expect(media.persisted.has('memory://assets/asset_kept.m4a')).toBe(true);
  });

  it('does not delete a referenced audio file that sits past the recent 200 moments', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const ownerId = LOCAL_OWNER_ID;
    const persisted = await media.persistAudio({
      assetId: 'asset_old_voice',
      sourceUri: 'memory://recordings/old.m4a',
      mimeType: 'audio/mp4',
    });
    const firstInstant = new Date('2026-01-01T00:00:00.000Z');
    await repos.assets.save(
      createAsset(
        {
          id: 'asset_old_voice',
          ownerId,
          type: 'audio',
          captureTimeSource: 'system',
          localUri: persisted.localUri,
          storage: { status: 'local' },
          metadata: { mimeType: 'audio/mp4', durationMs: 2000 },
        },
        { now: () => firstInstant, ownerId },
      ),
    );
    for (let index = 0; index < 201; index += 1) {
      const now = new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 60_000);
      let moment = createDraftMoment(
        {
          ownerId,
          content: { note: index === 0 ? 'oldest keeps sound' : `note ${index}` },
          time: { recordedAt: now.toISOString(), occurredAtPrecision: 'unknown' },
          origin: { type: 'created' },
        },
        { now: () => now, ownerId, id: () => `moment_old_${index}` },
      );
      if (index === 0) {
        moment = attachAsset(moment, 'asset_old_voice', ownerId, now);
      }
      moment = activateMoment(moment, ownerId, now);
      await repos.moments.save(moment);
    }
    expect(
      (await repos.moments.listRecent(200)).some((item) => item.assetIds.includes('asset_old_voice')),
    ).toBe(false);
    expect(await repos.moments.lookupAssetReferences('asset_old_voice')).toBe('referenced');

    const app = createUseCases({
      ...repos,
      media,
      capture: createMemoryAudioCapture(),
      clock: clockAt('2026-09-24T12:00:00.000Z'),
      assetId: () => 'asset_new_voice',
    });
    const draft = await app.restoreOrCreateDraft();
    const stored = await repos.drafts.loadActive();
    if (!stored) throw new Error('expected draft');
    await repos.drafts.save(
      attachAsset(stored, 'asset_old_voice', ownerId, new Date('2026-09-24T12:00:00.000Z')),
    );
    await app.removeDraftAudio(draft.draftId);
    expect(media.removed).toEqual([]);
    expect(await media.exists('memory://assets/asset_old_voice.m4a')).toBe(true);
    expect((await repos.assets.findById('asset_old_voice')).kind).toBe('ready');
  });

  it('does not show a damaged or missing audio asset as a photo', async () => {
    const { app, repos } = createAudioApp({ assetIds: ['asset_voice'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字还在');
    await app.addRecordedAudio(draft.draftId, clip('voice'));
    const saved = await app.saveTextMoment(draft.draftId);
    const originalFind = repos.assets.findById.bind(repos.assets);

    repos.assets.findById = async (id) =>
      id === 'asset_voice' ? { kind: 'unreadable', type: 'audio' } : originalFind(id);
    const damaged = await app.getMomentDetail(saved.id);
    expect(damaged.kind).toBe('ready');
    if (damaged.kind === 'ready') {
      expect(damaged.note).toBe('字还在');
      expect(damaged.images).toHaveLength(0);
      expect(damaged.audio?.id).toBe('asset_voice');
      expect(damaged.audio?.status).toBe('unavailable');
      expect(damaged.audio?.unavailableLabel).toBe(AUDIO_UNAVAILABLE_LABEL);
    }
    const damagedRecent = await app.getRecentLife();
    expect(damagedRecent.items[0].images).toHaveLength(0);
    expect(damagedRecent.items[0].audio?.status).toBe('unavailable');

    repos.assets.findById = async (id) => (id === 'asset_voice' ? { kind: 'missing' } : originalFind(id));
    const missing = await app.getMomentDetail(saved.id);
    expect(missing.kind).toBe('ready');
    if (missing.kind === 'ready') {
      expect(missing.images).toHaveLength(0);
      expect(missing.audio).toBeNull();
      expect(missing.unknownMedia).toEqual([
        {
          id: 'asset_voice',
          status: 'unavailable',
          label: '这份内容',
          unavailableLabel: UNKNOWN_UNAVAILABLE_LABEL,
        },
      ]);
    }

    const suffixApp = createAudioApp({ assetIds: ['asset:m:audio'] });
    const suffixDraft = await suffixApp.app.restoreOrCreateDraft();
    await suffixApp.app.addRecordedAudio(suffixDraft.draftId, clip('suffix'));
    const suffixSaved = await suffixApp.app.saveTextMoment(suffixDraft.draftId);
    const suffixFind = suffixApp.repos.assets.findById.bind(suffixApp.repos.assets);
    suffixApp.repos.assets.findById = async (id) =>
      id === 'asset:m:audio' ? { kind: 'missing' } : suffixFind(id);
    const suffixDetail = await suffixApp.app.getMomentDetail(suffixSaved.id);
    expect(suffixDetail.kind).toBe('ready');
    if (suffixDetail.kind === 'ready') {
      expect(suffixDetail.images).toHaveLength(0);
      expect(suffixDetail.audio?.status).toBe('unavailable');
      expect(suffixDetail.audio?.unavailableLabel).toBe(AUDIO_UNAVAILABLE_LABEL);
    }
  });

  it('keeps a generated-format audio id visible when its asset row is missing', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const app = createUseCases({
      ...repos,
      media,
      capture: createMemoryAudioCapture(),
      clock: clockAt('2026-09-24T15:00:00.000Z'),
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字还在');
    await app.addPickedImages(draft.draftId, [photo('kept')]);
    await app.addRecordedAudio(draft.draftId, clip('voice'));
    const composer = await app.restoreOrCreateDraft();
    expect(composer.audio?.id).toMatch(/^asset_\d+_[a-z0-9]+$/);
    expect(composer.images[0].id).toMatch(/^asset_\d+_[a-z0-9]+$/);
    const audioId = composer.audio?.id;
    const photoId = composer.images[0].id;
    if (!audioId) throw new Error('expected generated audio id');
    const saved = await app.saveTextMoment(draft.draftId);

    const originalFind = repos.assets.findById.bind(repos.assets);
    repos.assets.findById = async (id) => (id === audioId ? { kind: 'missing' } : originalFind(id));

    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind !== 'ready') return;
    expect(detail.id).toBe(saved.id);
    expect(detail.note).toBe('字还在');
    expect(detail.images.map((item) => item.id)).toEqual([photoId]);
    expect(detail.images[0].status).toBe('available');
    expect(detail.audio).toBeNull();
    expect(detail.unknownMedia).toEqual([
      {
        id: audioId,
        status: 'unavailable',
        label: '这份内容',
        unavailableLabel: UNKNOWN_UNAVAILABLE_LABEL,
      },
    ]);

    const recent = await app.getRecentLife();
    expect(recent.items[0].id).toBe(saved.id);
    expect(recent.items[0].note).toBe('字还在');
    expect(recent.items[0].images).toHaveLength(1);
    expect(recent.items[0].audio).toBeNull();
    expect(recent.items[0].unknownMedia[0]).toMatchObject({
      id: audioId,
      status: 'unavailable',
      unavailableLabel: UNKNOWN_UNAVAILABLE_LABEL,
    });
  });
});
