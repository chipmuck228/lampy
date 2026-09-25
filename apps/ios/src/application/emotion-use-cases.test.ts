import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import { activateMoment, createDraftMoment } from '../domain-adapters/moment-commands';
import {
  createMemoryAudioCapture,
  createMemoryMediaStore,
  createQueuedImageSource,
} from '../infrastructure/media';
import { createMemoryRepositories } from '../infrastructure/repositories';
import { ApplicationError } from './errors';
import { createUseCases } from './use-cases';

function clockAt(iso: string) {
  return { now: () => new Date(iso) };
}

function photo(id: string) {
  return { sourceUri: `memory://source/${id}.jpg`, mimeType: 'image/jpeg', width: 800, height: 600 };
}

function clip(id: string) {
  return { sourceUri: `memory://recordings/${id}.m4a`, durationMs: 2400, mimeType: 'audio/mp4' };
}

function createEmotionApp(options?: {
  assetIds?: string[];
  momentSave?: (original: (moment: never) => Promise<void>) => (moment: never) => Promise<void>;
}) {
  const repos = createMemoryRepositories();
  const media = createMemoryMediaStore();
  const library = createQueuedImageSource();
  const capture = createMemoryAudioCapture();
  const assetIds = options?.assetIds ?? ['asset_photo', 'asset_voice'];
  let next = 0;
  if (options?.momentSave) {
    const original = repos.moments.save.bind(repos.moments);
    repos.moments.save = options.momentSave(original as never) as typeof repos.moments.save;
  }
  const app = createUseCases({
    ...repos,
    media,
    library,
    capture,
    clock: clockAt('2026-09-25T02:00:00.000Z'),
    assetId: () => assetIds[next++] || `asset_extra_${next}`,
  });
  return { app, repos, media };
}

async function seedActive(
  repos: ReturnType<typeof createMemoryRepositories>,
  input: { id: string; note: string; emotion: string },
) {
  const instant = new Date('2026-09-24T12:00:00.000Z');
  let moment = createDraftMoment(
    {
      content: { note: input.note, emotion: input.emotion },
      origin: { type: 'created' },
    },
    { now: () => instant, ownerId: LOCAL_OWNER_ID, id: () => input.id },
  );
  moment = activateMoment(moment, LOCAL_OWNER_ID, instant);
  await repos.moments.save(moment);
  return moment;
}

describe('optional feeling use cases', () => {
  it('saves text, photo, audio, and mixed moments without a feeling', async () => {
    const textApp = createEmotionApp();
    const textDraft = await textApp.app.restoreOrCreateDraft();
    expect(textDraft.emotion).toBe('');
    await textApp.app.updateDraftNote(textDraft.draftId, '只写字');
    const textSaved = await textApp.app.saveTextMoment(textDraft.draftId);
    const textStored = await textApp.repos.moments.findById(textSaved.id);
    expect(textStored.kind).toBe('ready');
    if (textStored.kind === 'ready') {
      expect(textStored.moment.content.emotion).toBe('');
    }

    const photoApp = createEmotionApp({ assetIds: ['asset_photo_only'] });
    const photoDraft = await photoApp.app.restoreOrCreateDraft();
    await photoApp.app.addPickedImages(photoDraft.draftId, [photo('only')]);
    const photoSaved = await photoApp.app.saveTextMoment(photoDraft.draftId);
    const photoDetail = await photoApp.app.getMomentDetail(photoSaved.id);
    expect(photoDetail.kind).toBe('ready');
    if (photoDetail.kind === 'ready') {
      expect(photoDetail.feeling).toBeNull();
      expect(photoDetail.images).toHaveLength(1);
    }

    const audioApp = createEmotionApp({ assetIds: ['asset_audio_only'] });
    const audioDraft = await audioApp.app.restoreOrCreateDraft();
    await audioApp.app.addRecordedAudio(audioDraft.draftId, clip('only'));
    const audioSaved = await audioApp.app.saveTextMoment(audioDraft.draftId);
    const audioDetail = await audioApp.app.getMomentDetail(audioSaved.id);
    expect(audioDetail.kind).toBe('ready');
    if (audioDetail.kind === 'ready') {
      expect(audioDetail.feeling).toBeNull();
      expect(audioDetail.audio?.id).toBe('asset_audio_only');
    }

    const mixedApp = createEmotionApp({ assetIds: ['asset_mixed_photo', 'asset_mixed_voice'] });
    const mixedDraft = await mixedApp.app.restoreOrCreateDraft();
    await mixedApp.app.updateDraftNote(mixedDraft.draftId, '门口');
    await mixedApp.app.addPickedImages(mixedDraft.draftId, [photo('mixed')]);
    await mixedApp.app.addRecordedAudio(mixedDraft.draftId, clip('mixed'));
    const mixedSaved = await mixedApp.app.saveTextMoment(mixedDraft.draftId);
    const mixedDetail = await mixedApp.app.getMomentDetail(mixedSaved.id);
    expect(mixedDetail.kind).toBe('ready');
    if (mixedDetail.kind === 'ready') {
      expect(mixedDetail.feeling).toBeNull();
      expect(mixedDetail.note).toBe('门口');
      expect(mixedDetail.images).toHaveLength(1);
      expect(mixedDetail.audio?.id).toBe('asset_mixed_voice');
    }
  });

  it('selects, changes, and clears a feeling without changing time, assets, or scope', async () => {
    const { app, repos } = createEmotionApp({ assetIds: ['asset_kept'] });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '门口的风');
    await app.addPickedImages(draft.draftId, [photo('kept')]);
    const before = await repos.drafts.loadActive();
    if (!before) throw new Error('expected draft');

    await app.updateDraftEmotion(draft.draftId, '高兴');
    expect((await app.restoreOrCreateDraft()).emotion).toBe('高兴');
    await app.updateDraftEmotion(draft.draftId, '平静');
    expect((await app.restoreOrCreateDraft()).emotion).toBe('平静');
    await app.updateDraftEmotion(draft.draftId, '');
    expect((await app.restoreOrCreateDraft()).emotion).toBe('');
    await app.updateDraftEmotion(draft.draftId, '感动');

    const after = await repos.drafts.loadActive();
    if (!after) throw new Error('expected draft after feeling');
    expect(after.content.note).toBe('门口的风');
    expect(after.content.emotion).toBe('感动');
    expect(after.time.recordedAt).toBe(before.time.recordedAt);
    expect(after.time.occurredAt).toBe(before.time.occurredAt);
    expect(after.time.occurredAtPrecision).toBe(before.time.occurredAtPrecision);
    expect(after.assetIds).toEqual(before.assetIds);
    expect(after.accessSummary.visibility).toBe('private');
    expect(after.ownerId).toBe(LOCAL_OWNER_ID);

    const saved = await app.saveTextMoment(draft.draftId);
    const stored = await repos.moments.findById(saved.id);
    expect(stored.kind).toBe('ready');
    if (stored.kind !== 'ready') return;
    expect(stored.moment.content.emotion).toBe('感动');
    expect(stored.moment.time.occurredAt).toBeUndefined();
    expect(stored.moment.time.occurredAtPrecision).toBe('unknown');
    expect(stored.moment.time.recordedAt).toBe('2026-09-25T02:00:00.000Z');
    expect(stored.moment.assetIds).toEqual(['asset_kept']);
    expect(stored.moment.accessSummary.visibility).toBe('private');
    expect(stored.moment.ownerId).toBe(LOCAL_OWNER_ID);
  });

  it('restores a chosen feeling after a new use-case instance is created', async () => {
    const repos = createMemoryRepositories();
    const first = createUseCases({ ...repos, clock: clockAt('2026-09-25T02:10:00.000Z') });
    const draft = await first.restoreOrCreateDraft();
    await first.updateDraftNote(draft.draftId, '还没留下');
    await first.updateDraftEmotion(draft.draftId, '疲惫');

    const restarted = createUseCases({ ...repos, clock: clockAt('2026-09-25T02:11:00.000Z') });
    const restored = await restarted.restoreOrCreateDraft();
    expect(restored.draftId).toBe(draft.draftId);
    expect(restored.isRestored).toBe(true);
    expect(restored.note).toBe('还没留下');
    expect(restored.emotion).toBe('疲惫');
    expect((await restarted.getRecentLife()).items).toHaveLength(0);
  });

  it('keeps the feeling on a failed save and does not duplicate the moment on retry', async () => {
    let failNext = false;
    const { app, repos } = createEmotionApp({
      momentSave: (original) => async (moment) => {
        if (failNext) throw Object.assign(new Error('SQLITE_FULL'), { code: 'SQLITE_FULL' });
        return original(moment);
      },
    });
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftNote(draft.draftId, '这次先失败');
    await app.updateDraftEmotion(draft.draftId, '难过');
    failNext = true;
    await expect(app.saveTextMoment(draft.draftId)).rejects.toMatchObject({
      code: 'DISK_FULL',
    });
    const kept = await app.restoreOrCreateDraft();
    expect(kept.draftId).toBe(draft.draftId);
    expect(kept.emotion).toBe('难过');
    expect(kept.note).toBe('这次先失败');
    expect((await app.getRecentLife()).items).toHaveLength(0);

    failNext = false;
    const first = await app.saveTextMoment(draft.draftId);
    const second = await app.saveTextMoment(draft.draftId);
    expect(second.id).toBe(first.id);
    expect((await app.getRecentLife()).items).toHaveLength(1);
    const stored = await repos.moments.findById(first.id);
    expect(stored.kind).toBe('ready');
    if (stored.kind === 'ready') {
      expect(stored.moment.content.emotion).toBe('难过');
    }
  });

  it('shows an unknown stored emotion without rewriting it', async () => {
    const { app, repos } = createEmotionApp();
    await seedActive(repos, { id: 'moment_old_joy', note: '旧词还在', emotion: '喜悦' });

    const recent = await app.getRecentLife();
    expect(recent.items[0].feeling).toEqual({ value: '喜悦', label: '喜悦', known: false });
    const detail = await app.getMomentDetail('moment_old_joy');
    expect(detail.kind).toBe('ready');
    if (detail.kind === 'ready') {
      expect(detail.feeling).toEqual({ value: '喜悦', label: '喜悦', known: false });
    }
    const stored = await repos.moments.findById('moment_old_joy');
    expect(stored.kind).toBe('ready');
    if (stored.kind === 'ready') {
      expect(stored.moment.content.emotion).toBe('喜悦');
    }
  });

  it('saves a feeling with each media combination', async () => {
    const photoApp = createEmotionApp({ assetIds: ['asset_photo_feeling'] });
    const photoDraft = await photoApp.app.restoreOrCreateDraft();
    await photoApp.app.addPickedImages(photoDraft.draftId, [photo('feeling')]);
    await photoApp.app.updateDraftEmotion(photoDraft.draftId, '高兴');
    const photoSaved = await photoApp.app.saveTextMoment(photoDraft.draftId);
    const photoDetail = await photoApp.app.getMomentDetail(photoSaved.id);
    expect(photoDetail.kind).toBe('ready');
    if (photoDetail.kind === 'ready') {
      expect(photoDetail.feeling).toEqual({ value: '高兴', label: '高兴', known: true });
      expect(photoDetail.images[0].id).toBe('asset_photo_feeling');
    }

    const audioApp = createEmotionApp({ assetIds: ['asset_audio_feeling'] });
    const audioDraft = await audioApp.app.restoreOrCreateDraft();
    await audioApp.app.addRecordedAudio(audioDraft.draftId, clip('feeling'));
    await audioApp.app.updateDraftEmotion(audioDraft.draftId, '说不清');
    const audioSaved = await audioApp.app.saveTextMoment(audioDraft.draftId);
    const audioRecent = await audioApp.app.getRecentLife();
    expect(audioRecent.items[0].feeling?.value).toBe('说不清');
    expect(audioRecent.items[0].audio?.id).toBe('asset_audio_feeling');

    const mixedApp = createEmotionApp({ assetIds: ['asset_mix_photo', 'asset_mix_voice'] });
    const mixedDraft = await mixedApp.app.restoreOrCreateDraft();
    await mixedApp.app.updateDraftNote(mixedDraft.draftId, '都留下');
    await mixedApp.app.addPickedImages(mixedDraft.draftId, [photo('mix')]);
    await mixedApp.app.addRecordedAudio(mixedDraft.draftId, clip('mix'));
    await mixedApp.app.updateDraftEmotion(mixedDraft.draftId, '烦乱');
    const mixedSaved = await mixedApp.app.saveTextMoment(mixedDraft.draftId);
    const mixedDetail = await mixedApp.app.getMomentDetail(mixedSaved.id);
    expect(mixedDetail.kind).toBe('ready');
    if (mixedDetail.kind === 'ready') {
      expect(mixedDetail.feeling?.value).toBe('烦乱');
      expect(mixedDetail.note).toBe('都留下');
      expect(mixedDetail.images).toHaveLength(1);
      expect(mixedDetail.audio?.id).toBe('asset_mix_voice');
    }
  });

  it('does not treat a feeling-only draft as enough to save', async () => {
    const { app } = createEmotionApp();
    const draft = await app.restoreOrCreateDraft();
    await app.updateDraftEmotion(draft.draftId, '平静');
    await expect(app.saveTextMoment(draft.draftId)).rejects.toBeInstanceOf(ApplicationError);
    expect((await app.getRecentLife()).items).toHaveLength(0);
    expect((await app.restoreOrCreateDraft()).emotion).toBe('平静');
  });
});
