import { createUseCases } from './use-cases';
import { ApplicationError } from './errors';
import { createQueuedImageSource, createMemoryMediaStore } from '../infrastructure/media';
import { createMemoryRepositories } from '../infrastructure/repositories';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

function photo(id: string, width = 800, height = 600) {
  return { sourceUri: `memory://source/${id}.jpg`, mimeType: 'image/jpeg', width, height };
}

function createImageApp(options?: {
  library?: ReturnType<typeof createQueuedImageSource>;
  camera?: ReturnType<typeof createQueuedImageSource>;
  media?: ReturnType<typeof createMemoryMediaStore>;
  assetIds?: string[];
}) {
  const repos = createMemoryRepositories();
  const media = options?.media ?? createMemoryMediaStore();
  const library = options?.library ?? createQueuedImageSource();
  const camera = options?.camera ?? createQueuedImageSource();
  const assetIds = options?.assetIds ?? ['asset_a', 'asset_b', 'asset_c', 'asset_d', 'asset_e'];
  let next = 0;
  const app = createUseCases({
    ...repos,
    media,
    library,
    camera,
    clock: clockAt('2026-09-24T12:00:00.000Z'),
    assetId: () => assetIds[next++] || `asset_extra_${next}`,
  });
  return { app, repos, media, library, camera };
}

describe('image personal moment use cases', () => {
  it('saves one, two, and three photos on a draft', async () => {
    const { app } = createImageApp();
    const draft = await app.restoreOrCreateDraft();

    await app.addPickedImages(draft.draftId, [photo('one')]);
    expect((await app.restoreOrCreateDraft()).images).toHaveLength(1);

    await app.addPickedImages(draft.draftId, [photo('two', 400, 800)]);
    expect((await app.restoreOrCreateDraft()).images.map((item) => item.label)).toEqual([
      '照片 1/2',
      '照片 2/2',
    ]);

    await app.addPickedImages(draft.draftId, [photo('three')]);
    const composer = await app.restoreOrCreateDraft();
    expect(composer.images).toHaveLength(3);
    expect(composer.images.every((item) => item.status === 'available')).toBe(true);
  });

  it('keeps the first three photos and refuses the fourth without writing it', async () => {
    const { app, repos, media } = createImageApp();
    const draft = await app.restoreOrCreateDraft();
    await expect(
      app.addPickedImages(draft.draftId, [photo('1'), photo('2'), photo('3'), photo('4')]),
    ).rejects.toMatchObject({ code: 'IMAGE_LIMIT', message: '每条最多三张照片' });

    const restored = await app.restoreOrCreateDraft();
    expect(restored.images.map((item) => item.id)).toEqual(['asset_a', 'asset_b', 'asset_c']);
    expect(media.persisted.size).toBe(3);
    expect(await repos.assets.findById('asset_d')).toEqual({ kind: 'missing' });

    await expect(app.addPickedImages(draft.draftId, [photo('4')])).rejects.toBeInstanceOf(
      ApplicationError,
    );
    expect((await app.restoreOrCreateDraft()).images).toHaveLength(3);
    expect(media.persisted.size).toBe(3);
  });

  it('saves a photo-only moment and a text-plus-photo moment', async () => {
    const first = createImageApp({ assetIds: ['asset_photo'] });
    const photoDraft = await first.app.restoreOrCreateDraft();
    await first.app.addPickedImages(photoDraft.draftId, [photo('only')]);
    const savedPhoto = await first.app.saveTextMoment(photoDraft.draftId);
    const photoDetail = await first.app.getMomentDetail(savedPhoto.id);
    expect(photoDetail.kind).toBe('ready');
    if (photoDetail.kind === 'ready') {
      expect(photoDetail.note).toBe('');
      expect(photoDetail.images).toHaveLength(1);
      expect(photoDetail.images[0].status).toBe('available');
    }

    const second = createImageApp({ assetIds: ['asset_mixed'] });
    const mixedDraft = await second.app.restoreOrCreateDraft();
    await second.app.updateDraftNote(mixedDraft.draftId, '门口的光');
    await second.app.addPickedImages(mixedDraft.draftId, [photo('mixed')]);
    const savedMixed = await second.app.saveTextMoment(mixedDraft.draftId);
    const recent = await second.app.getRecentLife();
    expect(recent.items[0].note).toBe('门口的光');
    expect(recent.items[0].images[0].status).toBe('available');
    const mixedDetail = await second.app.getMomentDetail(savedMixed.id);
    expect(mixedDetail.kind).toBe('ready');
    if (mixedDetail.kind === 'ready') {
      expect(mixedDetail.note).toBe('门口的光');
      expect(mixedDetail.images[0].uri).toBe('memory://assets/asset_mixed.jpg');
    }
  });

  it('does not request a picker when the user has not opened that entry', async () => {
    const library = createQueuedImageSource({
      picks: [[photo('library')]],
    });
    const camera = createQueuedImageSource();
    const { app } = createImageApp({ library, camera });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '只写字');
    expect(library.requests).toBe(0);
    expect(camera.requests).toBe(0);
  });

  it('keeps the draft after library permission is denied', async () => {
    const library = createQueuedImageSource({
      permission: 'denied',
      picks: [[photo('should-not-land')]],
    });
    const { app, media } = createImageApp({ library });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '还想写下去');
    await expect(app.addLibraryImages(draft.draftId)).rejects.toMatchObject({
      code: 'LIBRARY_DENIED',
    });
    expect(library.requests).toBe(1);
    const restored = await app.restoreOrCreateDraft();
    expect(restored.draftId).toBe(draft.draftId);
    expect(restored.note).toBe('还想写下去');
    expect(restored.images).toHaveLength(0);
    expect(media.persisted.size).toBe(0);
    expect((await app.getRecentLife()).items).toHaveLength(0);
  });

  it('keeps the draft after camera permission is denied', async () => {
    const camera = createQueuedImageSource({ permission: 'denied' });
    const { app } = createImageApp({ camera });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '相机关掉了');
    await expect(app.addCameraImage(draft.draftId)).rejects.toMatchObject({
      code: 'CAMERA_DENIED',
    });
    expect((await app.restoreOrCreateDraft()).note).toBe('相机关掉了');
  });

  it('restores draft photos after a new use-case instance is created', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const first = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T13:00:00.000Z'),
      assetId: () => 'asset_restore',
    });
    const draft = await first.restoreOrCreateDraft();
    await first.updateDraftNote(draft.draftId, '还没留下');
    await first.addPickedImages(draft.draftId, [photo('keep')]);

    const restarted = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T13:01:00.000Z'),
    });
    const restored = await restarted.restoreOrCreateDraft();
    expect(restored.draftId).toBe(draft.draftId);
    expect(restored.isRestored).toBe(true);
    expect(restored.note).toBe('还没留下');
    expect(restored.images).toHaveLength(1);
    expect(restored.images[0].id).toBe('asset_restore');
    expect((await restarted.getRecentLife()).items).toHaveLength(0);
  });

  it('does not create a second moment or asset when save is repeated', async () => {
    const { app, repos, media } = createImageApp({ assetIds: ['asset_once'] });
    const draft = await app.restoreOrCreateDraft();
    await app.addPickedImages(draft.draftId, [photo('once')]);
    const first = await app.saveTextMoment(draft.draftId);
    const second = await app.saveTextMoment(draft.draftId);
    expect(second.id).toBe(first.id);
    expect((await app.getRecentLife()).items).toHaveLength(1);
    expect(media.persisted.size).toBe(1);
    expect((await repos.moments.findById(first.id)).kind).toBe('ready');
    expect((await repos.assets.findById('asset_once')).kind).toBe('ready');
  });

  it('keeps the moment and text when the image file is missing or undecodable', async () => {
    const media = createMemoryMediaStore();
    const { app } = createImageApp({ media, assetIds: ['asset_gone', 'asset_broken'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '字还在');
    await app.addPickedImages(draft.draftId, [photo('gone'), photo('broken')]);
    const saved = await app.saveTextMoment(draft.draftId);
    media.markMissing('memory://assets/asset_gone.jpg');
    media.markUndecodable('memory://assets/asset_broken.jpg');

    const detail = await app.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind !== 'ready') return;
    expect(detail.id).toBe(saved.id);
    expect(detail.note).toBe('字还在');
    expect(detail.images.map((item) => item.status)).toEqual(['unavailable', 'unavailable']);
    expect(detail.images[0].unavailableLabel).toBe('这张照片暂时找不到了，但这条记录还在。');

    const missing = await app.getMomentDetail('moment_does_not_exist');
    expect(missing).toEqual({ kind: 'missing', requestedId: 'moment_does_not_exist' });
  });

  it('shows the same photos after a new use-case instance reads the saved moment', async () => {
    const repos = createMemoryRepositories();
    const media = createMemoryMediaStore();
    const first = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T14:00:00.000Z'),
      assetId: () => 'asset_restart',
    });
    const draft = await first.restoreOrCreateDraft();
    await first.updateDraftNote(draft.draftId, '关掉再打开还有照片');
    await first.addPickedImages(draft.draftId, [photo('restart')]);
    const saved = await first.saveTextMoment(draft.draftId);

    const restarted = createUseCases({
      ...repos,
      media,
      clock: clockAt('2026-09-24T14:01:00.000Z'),
    });
    const recent = await restarted.getRecentLife();
    expect(recent.items[0].id).toBe(saved.id);
    expect(recent.items[0].images[0].uri).toBe('memory://assets/asset_restart.jpg');
    const detail = await restarted.getMomentDetail(saved.id);
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.note).toBe('关掉再打开还有照片');
      expect(detail.images[0].status).toBe('available');
    }
  });
});
