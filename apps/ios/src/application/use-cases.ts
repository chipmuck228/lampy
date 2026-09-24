import { createAsset, type AssetRecord } from '../domain-adapters/asset-commands';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import {
  activateMoment,
  attachAsset,
  createDraftMoment,
  detachAsset,
  updateMomentContent,
  type MomentRecord,
} from '../domain-adapters/moment-commands';
import { projectMomentDetailView } from '../domain-adapters/moment-detail-projection';
import type {
  AudioCapture,
  ImageSource,
  MediaStore,
  PickedImage,
  RecordedAudio,
} from '../infrastructure/media';
import type { AssetRepository, DraftRepository, MomentRepository } from '../infrastructure/repositories';
import { formatSoundDuration } from './duration';
import { ApplicationError, toApplicationError } from './errors';

export const MAX_DRAFT_IMAGES = 3;
export const MAX_DRAFT_AUDIO = 1;
export const IMAGE_UNAVAILABLE_LABEL = '这张照片暂时找不到了，但这条记录还在。';
export const AUDIO_UNAVAILABLE_LABEL = '这段声音暂时无法播放，其他内容仍然保留。';

export type Clock = { now: () => Date };

export type ImageView = {
  id: string;
  status: 'available' | 'unavailable';
  uri?: string;
  width?: number;
  height?: number;
  label: string;
  unavailableLabel?: string;
};

export type AudioView = {
  id: string;
  status: 'available' | 'unavailable';
  uri?: string;
  durationMs: number;
  durationLabel: string;
  label: string;
  unavailableLabel?: string;
};

export type RecentLifeItem = {
  id: string;
  note: string;
  recordedAt: string;
  dateLabel: string;
  images: ImageView[];
  audio: AudioView | null;
};

export type RecentLifeViewModel = {
  isFirstUse: boolean;
  items: RecentLifeItem[];
};

export type ComposerViewModel = {
  draftId: string;
  note: string;
  isRestored: boolean;
  images: ImageView[];
  audio: AudioView | null;
};

export type InterruptRecordingResult = {
  composer: ComposerViewModel;
  kept: boolean;
  hadSession: boolean;
};

export type MomentDetailViewModel =
  | {
      kind: 'ready';
      id: string;
      note: string;
      dateLabel: string;
      precision: string;
      usedRecordedAtFallback: boolean;
      sourceLabel: string;
      images: ImageView[];
      audio: AudioView | null;
    }
  | { kind: 'missing'; requestedId: string }
  | { kind: 'error'; requestedId: string };

function defaultClock(): Clock {
  return { now: () => new Date() };
}

function defaultId(): string {
  return `moment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultAssetId(): string {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function calendarDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '时间未确认';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function photoLabel(index: number, total: number): string {
  return `照片 ${index}/${total}`;
}

function toProjectionAsset(asset: AssetRecord | null): object | null {
  if (!asset) return null;
  return asset;
}

function isImageAsset(asset: AssetRecord): boolean {
  return asset.type !== 'audio' && asset.type !== 'video';
}

function isAudioAsset(asset: AssetRecord): boolean {
  return asset.type === 'audio';
}

export function createUseCases(deps: {
  moments: MomentRepository;
  drafts: DraftRepository;
  assets?: AssetRepository;
  media?: MediaStore;
  library?: ImageSource;
  camera?: ImageSource;
  capture?: AudioCapture;
  clock?: Clock;
  ownerId?: string;
  id?: () => string;
  assetId?: () => string;
}) {
  const ownerId = deps.ownerId || LOCAL_OWNER_ID;
  const clock = deps.clock || defaultClock();
  const nextId = deps.id || defaultId;
  const nextAssetId = deps.assetId || defaultAssetId;
  let restoreInFlight: Promise<ComposerViewModel> | null = null;

  async function loadAsset(assetId: string): Promise<AssetRecord | null> {
    if (!deps.assets) return null;
    const found = await deps.assets.findById(assetId);
    return found.kind === 'ready' ? found.asset : null;
  }

  async function classify(assetIds: string[]): Promise<{
    imageIds: string[];
    audioId: string | null;
  }> {
    const imageIds: string[] = [];
    let audioId: string | null = null;
    for (const assetId of assetIds) {
      const asset = await loadAsset(assetId);
      if (asset && isAudioAsset(asset)) {
        if (!audioId) audioId = assetId;
        continue;
      }
      if (asset && !isImageAsset(asset)) continue;
      imageIds.push(assetId);
    }
    return { imageIds, audioId };
  }

  async function resolveImages(assetIds: string[]): Promise<ImageView[]> {
    const { imageIds } = await classify(assetIds);
    const total = imageIds.length;
    if (total === 0) return [];
    const views: ImageView[] = [];
    for (const [index, assetId] of imageIds.entries()) {
      const label = photoLabel(index + 1, total);
      const found = deps.assets ? await deps.assets.findById(assetId) : { kind: 'missing' as const };
      if (found.kind !== 'ready') {
        views.push({
          id: assetId,
          status: 'unavailable',
          label,
          unavailableLabel: IMAGE_UNAVAILABLE_LABEL,
        });
        continue;
      }
      const uri = found.asset.localUri;
      const exists = deps.media ? await deps.media.exists(uri) : false;
      const readable = exists && deps.media ? await deps.media.canDecode(uri) : false;
      if (!readable) {
        views.push({
          id: assetId,
          status: 'unavailable',
          width: found.asset.metadata.width,
          height: found.asset.metadata.height,
          label,
          unavailableLabel: IMAGE_UNAVAILABLE_LABEL,
        });
        continue;
      }
      views.push({
        id: assetId,
        status: 'available',
        uri,
        width: found.asset.metadata.width,
        height: found.asset.metadata.height,
        label,
      });
    }
    return views;
  }

  async function resolveAudio(assetIds: string[]): Promise<AudioView | null> {
    const { audioId } = await classify(assetIds);
    if (!audioId) return null;
    const found = deps.assets ? await deps.assets.findById(audioId) : { kind: 'missing' as const };
    const durationMs =
      found.kind === 'ready' && Number.isFinite(found.asset.metadata.durationMs)
        ? found.asset.metadata.durationMs || 0
        : 0;
    const durationLabel = formatSoundDuration(durationMs);
    if (found.kind !== 'ready') {
      return {
        id: audioId,
        status: 'unavailable',
        durationMs,
        durationLabel,
        label: '当时的声音',
        unavailableLabel: AUDIO_UNAVAILABLE_LABEL,
      };
    }
    const uri = found.asset.localUri;
    const playable = !!deps.media && (await deps.media.exists(uri)) && (await deps.media.canPlay(uri));
    if (!playable) {
      return {
        id: audioId,
        status: 'unavailable',
        durationMs,
        durationLabel,
        label: '当时的声音',
        unavailableLabel: AUDIO_UNAVAILABLE_LABEL,
      };
    }
    return {
      id: audioId,
      status: 'available',
      uri,
      durationMs,
      durationLabel,
      label: '当时的声音',
    };
  }

  async function toComposer(draft: MomentRecord, isRestored: boolean): Promise<ComposerViewModel> {
    const images = await resolveImages(draft.assetIds);
    const audio = await resolveAudio(draft.assetIds);
    return {
      draftId: draft.id,
      note: draft.content.note,
      isRestored: isRestored && (!!draft.content.note.trim() || images.length > 0 || !!audio),
      images,
      audio,
    };
  }

  async function requireDraft(draftId: string): Promise<MomentRecord> {
    const draft = await deps.drafts.loadActive();
    if (!draft || draft.id !== draftId) {
      throw new ApplicationError('DRAFT_NOT_FOUND', '没有可更新的草稿');
    }
    return draft;
  }

  async function isAssetReferenced(assetId: string): Promise<boolean> {
    const draft = await deps.drafts.loadActive();
    if (draft?.assetIds.includes(assetId)) return true;
    if (draft) {
      const own = await deps.moments.findById(draft.id);
      if (own.kind === 'ready' && own.moment.assetIds.includes(assetId)) return true;
    }
    const recent = await deps.moments.listRecent(200);
    return recent.some((moment) => moment.assetIds.includes(assetId));
  }

  async function cleanupOrphan(assetId: string, localUri: string | undefined): Promise<void> {
    if (!localUri || !deps.media) return;
    if (await isAssetReferenced(assetId)) return;
    await deps.media.removeAppOwned(localUri);
  }

  async function persistAndAttach(draft: MomentRecord, picks: PickedImage[]): Promise<MomentRecord> {
    if (!deps.assets || !deps.media) {
      throw new ApplicationError('MEDIA_UNAVAILABLE', '现在不能留下照片。');
    }
    let current = draft;
    for (const pick of picks) {
      const assetId = nextAssetId();
      const persisted = await deps.media.persistImage({
        assetId,
        sourceUri: pick.sourceUri,
        mimeType: pick.mimeType,
      });
      const existing = await deps.assets.findById(assetId);
      if (existing.kind === 'unreadable') {
        throw new ApplicationError('REPOSITORY_INVALID_RECORD', '这张照片还在，但现在不能覆盖它');
      }
      if (existing.kind === 'missing') {
        const instant = clock.now();
        const asset = createAsset(
          {
            id: assetId,
            ownerId,
            type: 'image',
            captureTimeSource: 'system',
            localUri: persisted.localUri,
            storage: { status: 'local' },
            metadata: {
              mimeType: pick.mimeType,
              sizeBytes: persisted.sizeBytes,
              width: pick.width,
              height: pick.height,
            },
          },
          { now: () => instant, ownerId },
        );
        await deps.assets.save(asset);
      }
      current = attachAsset(current, assetId, ownerId, clock.now());
      await deps.drafts.save(current);
    }
    return current;
  }

  async function persistAndAttachAudio(
    draft: MomentRecord,
    recorded: RecordedAudio,
  ): Promise<MomentRecord> {
    if (!deps.assets || !deps.media) {
      throw new ApplicationError('MEDIA_UNAVAILABLE', '现在不能留下声音。');
    }
    if (recorded.durationMs <= 0) {
      throw new ApplicationError('AUDIO_EMPTY', '这一次没有录下声音。');
    }
    const { audioId } = await classify(draft.assetIds);
    if (audioId) {
      throw new ApplicationError('AUDIO_LIMIT', '每条最多一段声音');
    }
    const assetId = nextAssetId();
    const persisted = await deps.media.persistAudio({
      assetId,
      sourceUri: recorded.sourceUri,
      mimeType: recorded.mimeType,
    });
    const existing = await deps.assets.findById(assetId);
    if (existing.kind === 'unreadable') {
      throw new ApplicationError('REPOSITORY_INVALID_RECORD', '这段声音还在，但现在不能覆盖它');
    }
    if (existing.kind === 'missing') {
      const instant = clock.now();
      const asset = createAsset(
        {
          id: assetId,
          ownerId,
          type: 'audio',
          captureTimeSource: 'system',
          localUri: persisted.localUri,
          storage: { status: 'local' },
          metadata: {
            mimeType: recorded.mimeType || 'audio/mp4',
            sizeBytes: persisted.sizeBytes,
            durationMs: recorded.durationMs,
          },
        },
        { now: () => instant, ownerId },
      );
      await deps.assets.save(asset);
    }
    const next = attachAsset(draft, assetId, ownerId, clock.now());
    await deps.drafts.save(next);
    return next;
  }

  async function addPickedImages(draftId: string, picks: PickedImage[]): Promise<ComposerViewModel> {
    const draft = await requireDraft(draftId);
    const remaining = MAX_DRAFT_IMAGES - (await classify(draft.assetIds)).imageIds.length;
    if (remaining <= 0) {
      throw new ApplicationError('IMAGE_LIMIT', '每条最多三张照片');
    }
    if (picks.length === 0) {
      return toComposer(draft, true);
    }
    const accepted = picks.slice(0, remaining);
    const next = await persistAndAttach(draft, accepted);
    if (picks.length > remaining) {
      throw new ApplicationError('IMAGE_LIMIT', '每条最多三张照片');
    }
    return toComposer(next, true);
  }

  async function pickFromSource(
    draftId: string,
    source: ImageSource | undefined,
    deniedCode: 'LIBRARY_DENIED' | 'CAMERA_DENIED',
    deniedMessage: string,
  ): Promise<ComposerViewModel> {
    const draft = await requireDraft(draftId);
    const remaining = MAX_DRAFT_IMAGES - (await classify(draft.assetIds)).imageIds.length;
    if (remaining <= 0) {
      throw new ApplicationError('IMAGE_LIMIT', '每条最多三张照片');
    }
    if (!source) {
      throw new ApplicationError('MEDIA_UNAVAILABLE', '现在不能留下照片。');
    }
    const permission = await source.requestPermission();
    if (permission !== 'granted') {
      throw new ApplicationError(deniedCode, deniedMessage);
    }
    const picks = await source.pick(remaining);
    if (picks.length === 0) {
      return toComposer(draft, true);
    }
    if (picks.length > remaining) {
      await persistAndAttach(draft, picks.slice(0, remaining));
      throw new ApplicationError('IMAGE_LIMIT', '每条最多三张照片');
    }
    const next = await persistAndAttach(draft, picks);
    return toComposer(next, true);
  }

  async function restoreOrCreateDraft(): Promise<ComposerViewModel> {
    if (restoreInFlight) return restoreInFlight;
    restoreInFlight = (async () => {
      const existing = await deps.drafts.loadActive();
      if (existing) {
        return toComposer(existing, true);
      }
      const instant = clock.now();
      const draft = createDraftMoment(
        {
          ownerId,
          content: { note: '' },
          time: {
            recordedAt: instant.toISOString(),
            occurredAtPrecision: 'unknown',
          },
          origin: { type: 'created' },
        },
        { now: () => instant, ownerId, id: nextId },
      );
      await deps.drafts.save(draft);
      return toComposer(draft, false);
    })().finally(() => {
      restoreInFlight = null;
    });
    return restoreInFlight;
  }

  async function updateDraftNote(draftId: string, note: string): Promise<void> {
    const draft = await requireDraft(draftId);
    const instant = clock.now();
    const next = updateMomentContent(draft, { content: { note } }, ownerId, instant);
    await deps.drafts.save(next);
  }

  async function addLibraryImages(draftId: string): Promise<ComposerViewModel> {
    return pickFromSource(
      draftId,
      deps.library,
      'LIBRARY_DENIED',
      '没有打开相册。还可以写字，草稿还在。',
    );
  }

  async function addCameraImage(draftId: string): Promise<ComposerViewModel> {
    return pickFromSource(
      draftId,
      deps.camera,
      'CAMERA_DENIED',
      '没有打开相机。还可以写字，草稿还在。',
    );
  }

  async function beginDraftRecording(draftId: string): Promise<void> {
    const draft = await requireDraft(draftId);
    const { audioId } = await classify(draft.assetIds);
    if (audioId) {
      throw new ApplicationError('AUDIO_LIMIT', '每条最多一段声音');
    }
    if (!deps.capture) {
      throw new ApplicationError('MEDIA_UNAVAILABLE', '现在不能留下声音。');
    }
    if (deps.capture.isRecording()) {
      throw new ApplicationError('AUDIO_BUSY', '正在录一段声音。');
    }
    const permission = await deps.capture.requestPermission();
    if (permission !== 'granted') {
      throw new ApplicationError('MIC_DENIED', '没有打开麦克风。还可以写字和留下照片，草稿还在。');
    }
    await deps.capture.start();
  }

  async function addRecordedAudio(draftId: string, recorded: RecordedAudio): Promise<ComposerViewModel> {
    const draft = await requireDraft(draftId);
    const next = await persistAndAttachAudio(draft, recorded);
    return toComposer(next, true);
  }

  async function finishDraftRecording(draftId: string): Promise<ComposerViewModel> {
    if (!deps.capture) {
      throw new ApplicationError('MEDIA_UNAVAILABLE', '现在不能留下声音。');
    }
    const elapsedMs = deps.capture.getElapsedMs();
    const recorded = await deps.capture.stop();
    return addRecordedAudio(draftId, {
      ...recorded,
      durationMs: recorded.durationMs > 0 ? recorded.durationMs : elapsedMs,
    });
  }

  async function interruptDraftRecording(draftId: string): Promise<InterruptRecordingResult> {
    const draft = await requireDraft(draftId);
    if (!deps.capture || !deps.capture.isRecording()) {
      return { composer: await toComposer(draft, true), kept: false, hadSession: false };
    }
    const recorded = await deps.capture.interrupt();
    if (!recorded || recorded.durationMs <= 0) {
      return { composer: await toComposer(draft, true), kept: false, hadSession: true };
    }
    const composer = await addRecordedAudio(draftId, recorded);
    return { composer, kept: true, hadSession: true };
  }

  async function removeDraftAudio(draftId: string): Promise<ComposerViewModel> {
    const draft = await requireDraft(draftId);
    const { audioId } = await classify(draft.assetIds);
    if (!audioId) {
      return toComposer(draft, true);
    }
    const asset = await loadAsset(audioId);
    const next = detachAsset(draft, audioId, ownerId, clock.now());
    await deps.drafts.save(next);
    await cleanupOrphan(audioId, asset?.localUri);
    return toComposer(next, true);
  }

  async function saveTextMoment(draftId: string): Promise<{ id: string }> {
    const existing = await deps.moments.findById(draftId);
    if (existing.kind === 'unreadable') {
      throw new ApplicationError('REPOSITORY_INVALID_RECORD', '这条记录还在，但现在不能覆盖它');
    }
    if (existing.kind === 'ready' && existing.moment.lifecycle.status === 'active') {
      await deps.drafts.clear(draftId);
      return { id: existing.moment.id };
    }

    const draft = await deps.drafts.loadActive();
    if (!draft || draft.id !== draftId) {
      throw new ApplicationError('DRAFT_NOT_FOUND', '没有可保存的草稿');
    }

    const note = draft.content.note.trim();
    if (!note && draft.assetIds.length === 0) {
      throw new ApplicationError('MOMENT_EMPTY', '写一句、留下一张照片或一段声音。');
    }

    const instant = clock.now();
    let moment: MomentRecord = updateMomentContent(
      draft,
      {
        content: { note },
        time: {
          recordedAt: instant.toISOString(),
          occurredAtPrecision: 'unknown',
        },
      },
      ownerId,
      instant,
    );
    moment = activateMoment(moment, ownerId, instant);
    await deps.moments.save(moment);
    await deps.drafts.clear(draftId);
    return { id: moment.id };
  }

  async function getRecentLife(): Promise<RecentLifeViewModel> {
    const moments = await deps.moments.listRecent(50);
    const items: RecentLifeItem[] = [];
    for (const moment of moments) {
      items.push({
        id: moment.id,
        note: moment.content.note,
        recordedAt: moment.time.recordedAt,
        dateLabel: calendarDateLabel(moment.time.occurredAt || moment.time.recordedAt),
        images: await resolveImages(moment.assetIds),
        audio: await resolveAudio(moment.assetIds),
      });
    }
    return {
      isFirstUse: moments.length === 0,
      items,
    };
  }

  async function getMomentDetail(momentId: string): Promise<MomentDetailViewModel> {
    if (!momentId) {
      return { kind: 'missing', requestedId: '' };
    }
    let found;
    try {
      found = await deps.moments.findById(momentId);
    } catch {
      return { kind: 'error', requestedId: momentId };
    }
    if (found.kind === 'missing') {
      return { kind: 'missing', requestedId: momentId };
    }
    if (found.kind === 'unreadable') {
      return { kind: 'error', requestedId: momentId };
    }

    const projectionAssets: (object | null)[] = [];
    for (const assetId of found.moment.assetIds) {
      try {
        const asset = deps.assets ? await deps.assets.findById(assetId) : { kind: 'missing' as const };
        if (asset.kind !== 'ready') {
          projectionAssets.push(null);
          continue;
        }
        const uri = asset.asset.localUri;
        const usable = asset.asset.type === 'audio'
          ? !!deps.media && (await deps.media.exists(uri)) && (await deps.media.canPlay(uri))
          : !!deps.media && (await deps.media.exists(uri)) && (await deps.media.canDecode(uri));
        projectionAssets.push(
          usable
            ? toProjectionAsset(asset.asset)
            : {
                ...asset.asset,
                localUri: '',
                storage: { ...asset.asset.storage, status: 'missing' },
              },
        );
      } catch {
        projectionAssets.push(null);
      }
    }

    const view = projectMomentDetailView(found.moment, projectionAssets);
    return {
      kind: 'ready',
      id: view.id,
      note: view.content.note,
      dateLabel: view.displayDate.primary,
      precision: view.displayDate.precision,
      usedRecordedAtFallback: view.displayDate.usedRecordedAtFallback,
      sourceLabel: view.source.label,
      images: await resolveImages(found.moment.assetIds),
      audio: await resolveAudio(found.moment.assetIds),
    };
  }

  return {
    restoreOrCreateDraft,
    updateDraftNote,
    addLibraryImages,
    addCameraImage,
    addPickedImages,
    beginDraftRecording,
    finishDraftRecording,
    interruptDraftRecording,
    addRecordedAudio,
    removeDraftAudio,
    saveTextMoment,
    getRecordingElapsedMs() {
      return deps.capture?.getElapsedMs() ?? 0;
    },
    getRecentLife,
    getMomentDetail,
    toApplicationError,
  };
}
