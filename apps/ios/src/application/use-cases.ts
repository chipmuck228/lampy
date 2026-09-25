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
import {
  classifyCopyError,
  isMediaPersistError,
  type AudioCapture,
  type ImageSource,
  type MediaStore,
  type PickedImage,
  type RecordedAudio,
} from '../infrastructure/media';
import type {
  AssetRead,
  AssetRepository,
  DraftRepository,
  MomentRepository,
} from '../infrastructure/repositories';
import { formatSoundDuration } from './duration';
import type { HistoryClock } from '../domain-adapters/calendar';
import { ApplicationError, toApplicationError } from './errors';
import { createHistoryUseCases } from './history-use-cases';

export const MAX_DRAFT_IMAGES = 3;
export const MAX_DRAFT_AUDIO = 1;
export const IMAGE_MISSING_LABEL = '这张照片暂时找不到了，但这条记录还在。';
export const IMAGE_UNDECODABLE_LABEL = '这张照片打不开了，但这条记录还在。';
export const IMAGE_UNAVAILABLE_LABEL = IMAGE_MISSING_LABEL;
export const AUDIO_MISSING_LABEL = '这段声音暂时找不到了，其他内容仍然保留。';
export const AUDIO_UNPLAYABLE_LABEL = '这段声音暂时无法播放，其他内容仍然保留。';
export const AUDIO_UNAVAILABLE_LABEL = AUDIO_UNPLAYABLE_LABEL;
export const UNKNOWN_UNAVAILABLE_LABEL = '这份内容暂时无法打开。';

export const LIBRARY_DENIED_MESSAGE =
  '没有打开相册。还可以写字，也可以用其他已允许的方式留下。草稿还在。打开系统设置允许照片后，可以再试。';
export const CAMERA_DENIED_MESSAGE =
  '没有打开相机。还可以写字，也可以用其他已允许的方式留下。草稿还在。打开系统设置允许相机后，可以再试。';
export const MIC_DENIED_MESSAGE =
  '没有打开麦克风。还可以写字和留下照片，草稿还在。打开系统设置允许麦克风后，可以再试。';

const IMAGE_DISK_FULL_MESSAGE =
  '这台设备空间不够，这张照片没有留下。已经写的字和已留下的内容还在草稿里，可以清出空间后再试。';
const IMAGE_COPY_FAILED_MESSAGE =
  '这张照片没有复制进来。已经写的字和已留下的内容还在草稿里，可以再试。';
const IMAGE_WRITE_FAILED_MESSAGE =
  '这张照片还没写进草稿。已经写的字和已留下的内容还在，可以再试。';
const AUDIO_DISK_FULL_MESSAGE =
  '这台设备空间不够，这段声音没有留下。已经写的字和已留下的内容还在草稿里，可以清出空间后再试。';
const AUDIO_COPY_FAILED_MESSAGE =
  '这段声音没有复制进来。已经写的字和已留下的内容还在草稿里，可以再试。';
const AUDIO_WRITE_FAILED_MESSAGE =
  '这段声音还没写进草稿。已经写的字和已留下的内容还在，可以再试。';
const SAVE_DISK_FULL_MESSAGE = '这次没有留下正式记录。草稿还在，可以清出空间后再试。';
const SAVE_WRITE_FAILED_MESSAGE = '这次没有留下正式记录。草稿还在，可以再试。';

export type Clock = { now: () => Date };

export type ImageView = {
  id: string;
  status: 'available' | 'unavailable';
  uri?: string;
  width?: number;
  height?: number;
  label: string;
  unavailableLabel?: string;
  reason?: 'missing' | 'undecodable';
};

export type AudioView = {
  id: string;
  status: 'available' | 'unavailable';
  uri?: string;
  durationMs: number;
  durationLabel: string;
  label: string;
  unavailableLabel?: string;
  reason?: 'missing' | 'unplayable';
};

export type UnknownMediaView = {
  id: string;
  status: 'unavailable';
  label: string;
  unavailableLabel: string;
};

export type RecentLifeItem = {
  id: string;
  note: string;
  recordedAt: string;
  dateLabel: string;
  images: ImageView[];
  audio: AudioView | null;
  unknownMedia: UnknownMediaView[];
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
  unknownMedia: UnknownMediaView[];
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
      unknownMedia: UnknownMediaView[];
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

function inferTypeFromAssetId(assetId: string): 'image' | 'audio' | 'video' | undefined {
  const suffix = assetId.split(':').pop();
  if (suffix === 'image' || suffix === 'audio' || suffix === 'video') return suffix;
  return undefined;
}

function typeFromAssetRead(assetId: string, found: AssetRead): string | undefined {
  if (found.kind === 'ready') return found.asset.type;
  if (found.kind === 'unreadable') return found.type || inferTypeFromAssetId(assetId);
  return inferTypeFromAssetId(assetId);
}

function mapPersistError(error: unknown, kind: 'image' | 'audio'): ApplicationError {
  if (error instanceof ApplicationError) return error;
  const persist = isMediaPersistError(error) ? error : classifyCopyError(error);
  if (kind === 'image') {
    return new ApplicationError(
      persist.code,
      persist.code === 'DISK_FULL' ? IMAGE_DISK_FULL_MESSAGE : IMAGE_COPY_FAILED_MESSAGE,
    );
  }
  return new ApplicationError(
    persist.code,
    persist.code === 'DISK_FULL' ? AUDIO_DISK_FULL_MESSAGE : AUDIO_COPY_FAILED_MESSAGE,
  );
}

function mapRepositoryWrite(
  error: unknown,
  kind: 'image' | 'audio' | 'save',
): ApplicationError {
  if (error instanceof ApplicationError) return error;
  const persist = classifyCopyError(error);
  if (persist.code === 'DISK_FULL') {
    if (kind === 'image') return new ApplicationError('DISK_FULL', IMAGE_DISK_FULL_MESSAGE);
    if (kind === 'audio') return new ApplicationError('DISK_FULL', AUDIO_DISK_FULL_MESSAGE);
    return new ApplicationError('DISK_FULL', SAVE_DISK_FULL_MESSAGE);
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: string }).code || '');
    if (code === 'REPOSITORY_INVALID_RECORD') {
      return new ApplicationError(
        'REPOSITORY_INVALID_RECORD',
        error instanceof Error ? error.message : '这条记录还在，但现在不能覆盖它',
      );
    }
  }
  if (kind === 'image') return new ApplicationError('REPOSITORY_WRITE_FAILED', IMAGE_WRITE_FAILED_MESSAGE);
  if (kind === 'audio') return new ApplicationError('REPOSITORY_WRITE_FAILED', AUDIO_WRITE_FAILED_MESSAGE);
  return new ApplicationError('REPOSITORY_WRITE_FAILED', SAVE_WRITE_FAILED_MESSAGE);
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
  timezoneOffsetMinutes?: number;
  timezone?: HistoryClock;
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
    unknownIds: string[];
  }> {
    const imageIds: string[] = [];
    const unknownIds: string[] = [];
    let audioId: string | null = null;
    for (const assetId of assetIds) {
      const found = deps.assets ? await deps.assets.findById(assetId) : { kind: 'missing' as const };
      const type = typeFromAssetRead(assetId, found);
      if (type === 'audio') {
        if (!audioId) audioId = assetId;
        continue;
      }
      if (type === 'image') {
        imageIds.push(assetId);
        continue;
      }
      if (type === 'video') continue;
      unknownIds.push(assetId);
    }
    return { imageIds, audioId, unknownIds };
  }

  async function resolveUnknown(assetIds: string[]): Promise<UnknownMediaView[]> {
    const { unknownIds } = await classify(assetIds);
    return unknownIds.map((assetId) => ({
      id: assetId,
      status: 'unavailable' as const,
      label: '这份内容',
      unavailableLabel: UNKNOWN_UNAVAILABLE_LABEL,
    }));
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
          unavailableLabel: IMAGE_MISSING_LABEL,
          reason: 'missing',
        });
        continue;
      }
      const uri = found.asset.localUri;
      const exists = deps.media ? await deps.media.exists(uri) : false;
      if (!exists) {
        views.push({
          id: assetId,
          status: 'unavailable',
          width: found.asset.metadata.width,
          height: found.asset.metadata.height,
          label,
          unavailableLabel: IMAGE_MISSING_LABEL,
          reason: 'missing',
        });
        continue;
      }
      const readable = deps.media ? await deps.media.canDecode(uri) : false;
      if (!readable) {
        views.push({
          id: assetId,
          status: 'unavailable',
          width: found.asset.metadata.width,
          height: found.asset.metadata.height,
          label,
          unavailableLabel: IMAGE_UNDECODABLE_LABEL,
          reason: 'undecodable',
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
        unavailableLabel: AUDIO_MISSING_LABEL,
        reason: 'missing',
      };
    }
    const uri = found.asset.localUri;
    const exists = !!deps.media && (await deps.media.exists(uri));
    if (!exists) {
      return {
        id: audioId,
        status: 'unavailable',
        durationMs,
        durationLabel,
        label: '当时的声音',
        unavailableLabel: AUDIO_MISSING_LABEL,
        reason: 'missing',
      };
    }
    const playable = await deps.media!.canPlay(uri);
    if (!playable) {
      return {
        id: audioId,
        status: 'unavailable',
        durationMs,
        durationLabel,
        label: '当时的声音',
        unavailableLabel: AUDIO_UNPLAYABLE_LABEL,
        reason: 'unplayable',
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
    const unknownMedia = await resolveUnknown(draft.assetIds);
    return {
      draftId: draft.id,
      note: draft.content.note,
      isRestored:
        isRestored &&
        (!!draft.content.note.trim() || images.length > 0 || !!audio || unknownMedia.length > 0),
      images,
      audio,
      unknownMedia,
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
    const draftLookup = await deps.drafts.lookupAssetReferences(assetId);
    if (draftLookup === 'referenced' || draftLookup === 'unknown') return true;
    const momentLookup = await deps.moments.lookupAssetReferences(assetId);
    return momentLookup === 'referenced' || momentLookup === 'unknown';
  }

  async function cleanupOrphan(assetId: string, localUri: string | undefined): Promise<void> {
    if (!localUri || !deps.media) return;
    if (await isAssetReferenced(assetId)) return;
    await deps.media.removeAppOwned(localUri);
  }

  async function rollbackUncommitted(assetId: string, localUri: string | undefined): Promise<void> {
    if (await isAssetReferenced(assetId)) return;
    if (localUri && deps.media) {
      await deps.media.removeAppOwned(localUri);
    }
    const existing = deps.assets ? await deps.assets.findById(assetId) : { kind: 'missing' as const };
    if (existing.kind === 'unreadable') return;
    await deps.assets?.remove(assetId);
  }

  async function persistAndAttach(draft: MomentRecord, picks: PickedImage[]): Promise<MomentRecord> {
    if (!deps.assets || !deps.media) {
      throw new ApplicationError('MEDIA_UNAVAILABLE', '现在不能留下照片。');
    }
    let current = draft;
    for (const pick of picks) {
      const assetId = nextAssetId();
      let persisted: { localUri: string; sizeBytes?: number };
      try {
        persisted = await deps.media.persistImage({
          assetId,
          sourceUri: pick.sourceUri,
          mimeType: pick.mimeType,
        });
      } catch (error) {
        throw mapPersistError(error, 'image');
      }
      try {
        const existing = await deps.assets.findById(assetId);
        if (existing.kind === 'unreadable') {
          await rollbackUncommitted(assetId, persisted.localUri);
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
      } catch (error) {
        await rollbackUncommitted(assetId, persisted.localUri);
        throw mapRepositoryWrite(error, 'image');
      }
    }
    return current;
  }

  async function persistAndAttachAudio(
    draft: MomentRecord,
    recorded: RecordedAudio,
    options?: { replace?: boolean },
  ): Promise<MomentRecord> {
    if (!deps.assets || !deps.media) {
      throw new ApplicationError('MEDIA_UNAVAILABLE', '现在不能留下声音。');
    }
    if (recorded.durationMs <= 0) {
      throw new ApplicationError('AUDIO_EMPTY', '这一次没有录下声音。');
    }
    const { audioId: existingAudioId } = await classify(draft.assetIds);
    if (existingAudioId && !options?.replace) {
      throw new ApplicationError('AUDIO_LIMIT', '每条最多一段声音');
    }
    const assetId = nextAssetId();
    let persisted: { localUri: string; sizeBytes?: number };
    try {
      persisted = await deps.media.persistAudio({
        assetId,
        sourceUri: recorded.sourceUri,
        mimeType: recorded.mimeType,
      });
    } catch (error) {
      throw mapPersistError(error, 'audio');
    }
    let next = draft;
    try {
      const existing = await deps.assets.findById(assetId);
      if (existing.kind === 'unreadable') {
        await rollbackUncommitted(assetId, persisted.localUri);
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
      next = existingAudioId ? detachAsset(draft, existingAudioId, ownerId, clock.now()) : draft;
      next = attachAsset(next, assetId, ownerId, clock.now());
      await deps.drafts.save(next);
    } catch (error) {
      await rollbackUncommitted(assetId, persisted.localUri);
      throw mapRepositoryWrite(error, 'audio');
    }
    if (existingAudioId) {
      const previous = await loadAsset(existingAudioId);
      try {
        await cleanupOrphan(existingAudioId, previous?.localUri);
      } catch {
        // The replacement is already on the draft; keep both files if cleanup cannot confirm.
      }
    }
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
      LIBRARY_DENIED_MESSAGE,
    );
  }

  async function addCameraImage(draftId: string): Promise<ComposerViewModel> {
    return pickFromSource(
      draftId,
      deps.camera,
      'CAMERA_DENIED',
      CAMERA_DENIED_MESSAGE,
    );
  }

  async function beginDraftRecording(
    draftId: string,
    options?: { replace?: boolean },
  ): Promise<void> {
    const draft = await requireDraft(draftId);
    if (!options?.replace) {
      const { audioId } = await classify(draft.assetIds);
      if (audioId) {
        throw new ApplicationError('AUDIO_LIMIT', '每条最多一段声音');
      }
    }
    if (!deps.capture) {
      throw new ApplicationError('MEDIA_UNAVAILABLE', '现在不能留下声音。');
    }
    if (deps.capture.isRecording()) {
      throw new ApplicationError('AUDIO_BUSY', '正在录一段声音。');
    }
    const permission = await deps.capture.requestPermission();
    if (permission !== 'granted') {
      throw new ApplicationError('MIC_DENIED', MIC_DENIED_MESSAGE);
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
    const draft = await requireDraft(draftId);
    const next = await persistAndAttachAudio(
      draft,
      {
        ...recorded,
        durationMs: recorded.durationMs > 0 ? recorded.durationMs : elapsedMs,
      },
      { replace: true },
    );
    return toComposer(next, true);
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
    const next = await persistAndAttachAudio(await requireDraft(draftId), recorded, { replace: true });
    return { composer: await toComposer(next, true), kept: true, hadSession: true };
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
    try {
      await deps.moments.save(moment);
    } catch (error) {
      throw mapRepositoryWrite(error, 'save');
    }
    try {
      await deps.drafts.clear(draftId);
    } catch {
      // The formal record is already committed; a later retry is idempotent.
    }
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
        unknownMedia: await resolveUnknown(moment.assetIds),
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
      unknownMedia: await resolveUnknown(found.moment.assetIds),
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
    ...createHistoryUseCases({
      moments: deps.moments,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
      timezone: deps.timezone,
      resolveImages,
      resolveAudio,
      resolveUnknown,
    }),
    toApplicationError,
  };
}
