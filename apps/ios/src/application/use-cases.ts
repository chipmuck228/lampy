import { createAsset, type AssetRecord } from '../domain-adapters/asset-commands';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import {
  activateMoment,
  attachAsset,
  createDraftMoment,
  updateMomentContent,
  type MomentRecord,
} from '../domain-adapters/moment-commands';
import { projectMomentDetailView } from '../domain-adapters/moment-detail-projection';
import type { ImageSource, MediaStore, PickedImage } from '../infrastructure/media';
import type { AssetRepository, DraftRepository, MomentRepository } from '../infrastructure/repositories';
import { ApplicationError, toApplicationError } from './errors';

export const MAX_DRAFT_IMAGES = 3;
export const IMAGE_UNAVAILABLE_LABEL = '这张照片暂时找不到了，但这条记录还在。';

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

export type RecentLifeItem = {
  id: string;
  note: string;
  recordedAt: string;
  dateLabel: string;
  images: ImageView[];
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

export function createUseCases(deps: {
  moments: MomentRepository;
  drafts: DraftRepository;
  assets?: AssetRepository;
  media?: MediaStore;
  library?: ImageSource;
  camera?: ImageSource;
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

  async function resolveImages(assetIds: string[]): Promise<ImageView[]> {
    const total = assetIds.length;
    if (total === 0) return [];
    const views: ImageView[] = [];
    for (const [index, assetId] of assetIds.entries()) {
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

  async function toComposer(draft: MomentRecord, isRestored: boolean): Promise<ComposerViewModel> {
    const images = await resolveImages(draft.assetIds);
    return {
      draftId: draft.id,
      note: draft.content.note,
      isRestored: isRestored && (!!draft.content.note.trim() || images.length > 0),
      images,
    };
  }

  async function requireDraft(draftId: string): Promise<MomentRecord> {
    const draft = await deps.drafts.loadActive();
    if (!draft || draft.id !== draftId) {
      throw new ApplicationError('DRAFT_NOT_FOUND', '没有可更新的草稿');
    }
    return draft;
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

  async function addPickedImages(draftId: string, picks: PickedImage[]): Promise<ComposerViewModel> {
    const draft = await requireDraft(draftId);
    const remaining = MAX_DRAFT_IMAGES - draft.assetIds.length;
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
    const remaining = MAX_DRAFT_IMAGES - draft.assetIds.length;
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
      throw new ApplicationError('MOMENT_EMPTY', '写一句或留下一张照片。');
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
        const readable =
          !!deps.media && (await deps.media.exists(uri)) && (await deps.media.canDecode(uri));
        projectionAssets.push(
          readable
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
    };
  }

  return {
    restoreOrCreateDraft,
    updateDraftNote,
    addLibraryImages,
    addCameraImage,
    addPickedImages,
    saveTextMoment,
    getRecentLife,
    getMomentDetail,
    toApplicationError,
  };
}
