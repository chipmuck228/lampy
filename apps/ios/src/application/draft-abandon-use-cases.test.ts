import { createUseCases } from './use-cases';
import { ApplicationError } from './errors';
import {
  createMemoryAudioCapture,
  createMemoryMediaStore,
  createQueuedImageSource,
} from '../infrastructure/media';
import { createMemoryRepositories } from '../infrastructure/repositories';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

function photo(id: string) {
  return { sourceUri: `memory://source/${id}.jpg`, mimeType: 'image/jpeg', width: 800, height: 600 };
}

function clip(id: string) {
  return { sourceUri: `memory://recordings/${id}.m4a`, durationMs: 2400, mimeType: 'audio/mp4' };
}

function createAbandonApp(options?: {
  ids?: string[];
  assetIds?: string[];
  media?: ReturnType<typeof createMemoryMediaStore>;
  capture?: ReturnType<typeof createMemoryAudioCapture>;
}) {
  const repos = createMemoryRepositories();
  const media = options?.media ?? createMemoryMediaStore();
  const library = createQueuedImageSource();
  const capture = options?.capture ?? createMemoryAudioCapture({ clips: [clip('voice')] });
  const ids = options?.ids ?? ['moment_old', 'moment_new', 'moment_third'];
  const assetIds = options?.assetIds ?? ['asset_photo', 'asset_voice', 'asset_extra'];
  let nextId = 0;
  let nextAsset = 0;
  const app = createUseCases({
    ...repos,
    media,
    library,
    capture,
    clock: clockAt('2026-09-26T12:00:00.000Z'),
    id: () => ids[nextId++] || `moment_extra_${nextId}`,
    assetId: () => assetIds[nextAsset++] || `asset_extra_${nextAsset}`,
  });
  return { app, repos, media, capture };
}

describe('leave draft abandon use cases', () => {
  it('keeps editing a restored draft and persists the changes', async () => {
    const { app } = createAbandonApp();
    const first = await app.restoreOrCreateDraft();
    await app.updateDraftNote(first.draftId, '还没留下');
    await app.updateDraftEmotion(first.draftId, '平静');
    await app.addPickedImages(first.draftId, [photo('one')]);
    await app.addRecordedAudio(first.draftId, clip('voice'));

    const restored = await app.restoreOrCreateDraft();
    expect(restored.draftId).toBe(first.draftId);
    expect(restored.isRestored).toBe(true);
    expect(restored.note).toBe('还没留下');
    expect(restored.emotion).toBe('平静');
    expect(restored.images).toHaveLength(1);
    expect(restored.audio?.id).toBe('asset_voice');

    await app.updateDraftNote(restored.draftId, '改过的一句');
    await app.updateDraftEmotion(restored.draftId, '高兴');
    const again = await app.restoreOrCreateDraft();
    expect(again.draftId).toBe(first.draftId);
    expect(again.note).toBe('改过的一句');
    expect(again.emotion).toBe('高兴');
    expect(again.images).toHaveLength(1);
    expect(again.audio?.id).toBe('asset_voice');
  });

  it('clears a non-empty draft and starts a new empty id', async () => {
    const { app, repos, media } = createAbandonApp();
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '旧草稿');
    await app.updateDraftEmotion(draft.draftId, '平静');
    await app.addPickedImages(draft.draftId, [photo('one')]);
    await app.addRecordedAudio(draft.draftId, clip('voice'));
    const photoUri = 'memory://assets/asset_photo.jpg';
    const audioUri = 'memory://assets/asset_voice.m4a';
    expect(media.persisted.has(photoUri)).toBe(true);
    expect(media.persisted.has(audioUri)).toBe(true);

    const abandoned = await app.abandonActiveDraft(draft.draftId);
    expect(abandoned.composer.draftId).toBe('moment_new');
    expect(abandoned.composer.draftId).not.toBe(draft.draftId);
    expect(abandoned.composer.note).toBe('');
    expect(abandoned.composer.emotion).toBe('');
    expect(abandoned.composer.images).toHaveLength(0);
    expect(abandoned.composer.audio).toBeNull();
    expect(abandoned.composer.isRestored).toBe(false);
    expect(abandoned.cleanup.failed).toBe(0);
    expect(abandoned.cleanup.removed).toBe(2);
    expect(media.persisted.has(photoUri)).toBe(false);
    expect(media.persisted.has(audioUri)).toBe(false);
    expect(await repos.assets.findById('asset_photo')).toEqual({ kind: 'missing' });
    expect(await repos.assets.findById('asset_voice')).toEqual({ kind: 'missing' });

    const restored = await app.restoreOrCreateDraft();
    expect(restored.draftId).toBe('moment_new');
    expect(restored.note).toBe('');
    expect(restored.images).toHaveLength(0);
    expect(restored.audio).toBeNull();
  });

  it('keeps the original draft when clear fails', async () => {
    const { app, repos, media } = createAbandonApp();
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '不能丢掉');
    await app.addPickedImages(draft.draftId, [photo('one')]);
    repos.drafts.clear = async () => {
      throw new Error('disk locked');
    };

    await expect(app.abandonActiveDraft(draft.draftId)).rejects.toMatchObject({
      code: 'DRAFT_CLEAR_FAILED',
      message: '这份草稿还没拿掉。原来的内容还在，可以再试。',
    });
    const kept = await app.restoreOrCreateDraft();
    expect(kept.draftId).toBe(draft.draftId);
    expect(kept.note).toBe('不能丢掉');
    expect(kept.images).toHaveLength(1);
    expect(media.persisted.has('memory://assets/asset_photo.jpg')).toBe(true);
  });

  it('does not claim disk cleared when app-owned copies cannot be deleted', async () => {
    const media = createMemoryMediaStore();
    media.failNextRemove();
    const { app } = createAbandonApp({ media });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '有照片');
    await app.addPickedImages(draft.draftId, [photo('one')]);

    const abandoned = await app.abandonActiveDraft(draft.draftId);
    expect(abandoned.composer.draftId).toBe('moment_new');
    expect(abandoned.composer.note).toBe('');
    expect(abandoned.cleanup.failed).toBe(1);
    expect(abandoned.cleanup.removed).toBe(0);
    expect(media.persisted.has('memory://assets/asset_photo.jpg')).toBe(true);
  });

  it('keeps files when a reference cannot be confirmed', async () => {
    const { app, repos, media } = createAbandonApp();
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '不确定引用');
    await app.addPickedImages(draft.draftId, [photo('one')]);
    repos.moments.lookupAssetReferences = async () => 'unknown';

    const abandoned = await app.abandonActiveDraft(draft.draftId);
    expect(abandoned.composer.draftId).toBe('moment_new');
    expect(abandoned.cleanup.removed).toBe(0);
    expect(abandoned.cleanup.kept).toBe(1);
    expect(abandoned.cleanup.failed).toBe(0);
    expect(media.persisted.has('memory://assets/asset_photo.jpg')).toBe(true);
  });

  it('does not delete album originals or saved moments', async () => {
    const first = createAbandonApp({
      ids: ['moment_saved', 'moment_draft', 'moment_fresh'],
      assetIds: ['asset_saved', 'asset_draft'],
    });
    const savedDraft = await first.app.restoreOrCreateDraft();
    await first.app.updateDraftNote(savedDraft.draftId, '已经留下');
    await first.app.addPickedImages(savedDraft.draftId, [photo('saved')]);
    const saved = await first.app.saveTextMoment(savedDraft.draftId);

    const draft = await first.app.restoreOrCreateDraft();
    await first.app.updateDraftNote(draft.draftId, '还没留下');
    await first.app.addPickedImages(draft.draftId, [photo('draft')]);
    const originalRemove = first.media.removeAppOwned.bind(first.media);
    first.media.removeAppOwned = async (localUri) => {
      if (localUri === 'memory://assets/asset_draft.jpg') return false;
      return originalRemove(localUri);
    };

    const abandoned = await first.app.abandonActiveDraft(draft.draftId);
    expect(abandoned.composer.draftId).toBe('moment_fresh');
    expect(abandoned.cleanup.failed).toBe(0);
    expect(first.media.persisted.has('memory://assets/asset_saved.jpg')).toBe(true);
    expect(first.media.persisted.has('memory://assets/asset_draft.jpg')).toBe(true);

    const detail = await first.app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.note).toBe('已经留下');
      expect(detail.images[0].status).toBe('available');
    }
  });

  it('does not write an abandoned draft back after a later persist', async () => {
    const { app } = createAbandonApp();
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '旧稿');
    await app.abandonActiveDraft(draft.draftId);
    await expect(app.updateDraftNote(draft.draftId, '刚放弃的又写回来')).rejects.toBeInstanceOf(
      ApplicationError,
    );
    const restored = await app.restoreOrCreateDraft();
    expect(restored.draftId).toBe('moment_new');
    expect(restored.note).toBe('');
  });

  it('leaves a saved moment and its media when abandon runs after save', async () => {
    const { app, media } = createAbandonApp({
      ids: ['moment_saved', 'moment_next'],
      assetIds: ['asset_saved'],
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '正式留下');
    await app.addPickedImages(draft.draftId, [photo('saved')]);
    const saved = await app.saveTextMoment(draft.draftId);
    await expect(app.abandonActiveDraft(draft.draftId)).rejects.toMatchObject({
      code: 'DRAFT_NOT_FOUND',
    });
    expect(media.persisted.has('memory://assets/asset_saved.jpg')).toBe(true);
    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.note).toBe('正式留下');
    }
  });

  it('keeps the draft when save fails, and abandon can still clear it later', async () => {
    const { app, repos } = createAbandonApp();
    const innerSave = repos.moments.save.bind(repos.moments);
    repos.moments.save = async () => {
      throw new Error('disk full');
    };
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '这次失败');
    await expect(app.saveTextMoment(draft.draftId)).rejects.toMatchObject({
      code: 'DISK_FULL',
    });
    expect((await app.restoreOrCreateDraft()).note).toBe('这次失败');

    repos.moments.save = innerSave;
    const abandoned = await app.abandonActiveDraft(draft.draftId);
    expect(abandoned.composer.note).toBe('');
    expect(abandoned.composer.draftId).not.toBe(draft.draftId);
    expect((await app.getRecentLife()).items).toHaveLength(0);
  });

  it('does not attach an in-progress recording to the abandoned draft', async () => {
    const capture = createMemoryAudioCapture({
      clips: [clip('should-not-land')],
      interruptClip: clip('interrupted'),
    });
    const { app, media } = createAbandonApp({ capture, assetIds: ['asset_should_not'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '正在录');
    await app.beginDraftRecording(draft.draftId);
    expect(capture.isRecording()).toBe(true);

    const abandoned = await app.abandonActiveDraft(draft.draftId);
    expect(capture.isRecording()).toBe(false);
    expect(abandoned.composer.audio).toBeNull();
    expect(abandoned.composer.note).toBe('');
    expect(media.persisted.size).toBe(0);
  });
});
