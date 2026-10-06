import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import type { AssetRepository, MomentRepository } from '../infrastructure/repositories';
import type { LifeAlbumRepository } from '../infrastructure/life-album-repository';
import { createMemoryLifeAlbumRepository } from '../infrastructure/life-album-repository';
import {
  calendarPartsAt,
  parseMillis,
  type HistoryClock,
} from '../domain-adapters/calendar';
import { ApplicationError, toApplicationError } from './errors';
import {
  ALBUM_GONE,
  ALBUM_WRITE_FAILED,
  LIFE_ALBUM_SCHEMA_VERSION,
  albumMediaHint,
  albumNoteExcerpt,
  normalizeAlbumName,
  normalizeAlbumOpening,
  type AlbumCover,
  type AlbumCoverCandidate,
  type AlbumEntrySource,
  type AlbumEntryView,
  type AlbumListItem,
  type AlbumListView,
  type AlbumManageView,
  type LifeAlbum,
} from './life-album';
type Clock = { now: () => Date };

export const ALBUM_NOT_FOUND = 'ALBUM_NOT_FOUND';
export const ALBUM_COVER_INVALID = 'ALBUM_COVER_INVALID';
export const ALBUM_REORDER_INVALID = 'ALBUM_REORDER_INVALID';
export const ALBUM_SOURCE_UNAVAILABLE = 'ALBUM_SOURCE_UNAVAILABLE';
export const ALBUM_WRITE_FAILED_CODE = 'ALBUM_WRITE_FAILED';

function defaultAlbumId(): string {
  return `album_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function coverEquals(left: AlbumCover, right: AlbumCover): boolean {
  if (left.kind === 'words' && right.kind === 'words') return true;
  return (
    left.kind === 'image' &&
    right.kind === 'image' &&
    left.momentId === right.momentId &&
    left.assetId === right.assetId
  );
}

function toAlbum(record: {
  id: string;
  name: string;
  opening: string | null;
  cover: AlbumCover;
  createdAt: string;
  updatedAt: string;
}, entries: { momentId: string; collectedAt: string; sourceRevisionAtCollect: number }[]): LifeAlbum {
  return {
    id: record.id,
    schemaVersion: LIFE_ALBUM_SCHEMA_VERSION,
    name: record.name,
    opening: record.opening,
    cover: record.cover,
    entries: entries.map((entry) => ({
      momentId: entry.momentId,
      collectedAt: entry.collectedAt,
      sourceRevisionAtCollect: entry.sourceRevisionAtCollect,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function formatCollectedAt(iso: string | null, clock: HistoryClock): string | null {
  if (!iso) return null;
  const millis = parseMillis(iso);
  if (millis === null) return null;
  const parts = calendarPartsAt(millis, clock);
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

export function createLifeAlbumUseCases(deps: {
  albums?: LifeAlbumRepository;
  moments: MomentRepository;
  assets?: AssetRepository;
  media?: { exists(uri: string): Promise<boolean> };
  clock?: Clock;
  ownerId?: string;
  id?: () => string;
  timezone?: HistoryClock;
}) {
  const albums = deps.albums ?? createMemoryLifeAlbumRepository();
  const ownerId = deps.ownerId || LOCAL_OWNER_ID;
  const clock = deps.clock ?? { now: () => new Date() };
  const nextId = deps.id ?? defaultAlbumId;
  const viewerClock: HistoryClock = deps.timezone ?? {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };

  function writeFailed(error: unknown): never {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(ALBUM_WRITE_FAILED_CODE, ALBUM_WRITE_FAILED);
  }

  async function requireAlbum(albumId: string) {
    const album = await albums.findById(albumId);
    if (!album || album.ownerId !== ownerId) {
      throw new ApplicationError(ALBUM_NOT_FOUND, ALBUM_GONE);
    }
    return album;
  }

  async function coverAfterRemoving(album: Awaited<ReturnType<typeof requireAlbum>>, momentId: string) {
    if (album.cover.kind === 'image' && album.cover.momentId === momentId) {
      return { kind: 'words' as const };
    }
    return album.cover;
  }

  async function assertCoverAllowed(
    albumId: string,
    cover: AlbumCover,
    entries?: { momentId: string }[],
  ): Promise<void> {
    if (cover.kind === 'words') return;
    const present = entries ?? (await albums.listEntries(albumId));
    if (!present.some((entry) => entry.momentId === cover.momentId)) {
      throw new ApplicationError(ALBUM_COVER_INVALID, '封面只能选自已经收进这一册的照片。');
    }
    const found = await deps.moments.findById(cover.momentId);
    if (found.kind !== 'ready' || !found.moment.assetIds.includes(cover.assetId)) {
      throw new ApplicationError(ALBUM_COVER_INVALID, '封面只能选自已经收进这一册的照片。');
    }
    if (!deps.assets) {
      throw new ApplicationError(ALBUM_COVER_INVALID, '封面只能选自已经收进这一册的照片。');
    }
    const asset = await deps.assets.findById(cover.assetId);
    if (asset.kind !== 'ready' || asset.asset.type !== 'image') {
      throw new ApplicationError(ALBUM_COVER_INVALID, '封面只能选自已经收进这一册的照片。');
    }
  }

  async function toListItem(album: Awaited<ReturnType<typeof requireAlbum>>): Promise<AlbumListItem> {
    const entries = await albums.listEntries(album.id);
    const lastCollectedAt = entries.reduce<string | null>((latest, entry) => {
      if (!latest || entry.collectedAt > latest) return entry.collectedAt;
      return latest;
    }, null);
    return {
      id: album.id,
      name: album.name,
      entryCount: entries.length,
      lastCollectedAt,
      lastCollectedLabel: formatCollectedAt(lastCollectedAt, viewerClock),
      cover: album.cover,
    };
  }

  async function coverCandidates(albumId: string): Promise<AlbumCoverCandidate[]> {
    const entries = await albums.listEntries(albumId);
    const candidates: AlbumCoverCandidate[] = [];
    for (const entry of entries) {
      const found = await deps.moments.findById(entry.momentId);
      if (found.kind !== 'ready' || !deps.assets) continue;
      for (const assetId of found.moment.assetIds) {
        const asset = await deps.assets.findById(assetId);
        if (asset.kind !== 'ready' || asset.asset.type !== 'image') continue;
        const uri = asset.asset.localUri;
        const available = deps.media ? await deps.media.exists(uri) : Boolean(uri);
        candidates.push({
          momentId: entry.momentId,
          assetId,
          uri: available ? uri : undefined,
          available,
        });
      }
    }
    return candidates;
  }

  async function describeEntry(momentId: string): Promise<{
    source: AlbumEntrySource;
    noteExcerpt: string | null;
    dateLabel: string | null;
    mediaHint: string | null;
    photoCount: number;
    hasAudio: boolean;
    unknownCount: number;
    audioDurationMs: number | null;
    thumbnailUri: string | null;
    occurredSortKey: number | null;
  }> {
    const empty = {
      noteExcerpt: null,
      dateLabel: null,
      mediaHint: null,
      photoCount: 0,
      hasAudio: false,
      unknownCount: 0,
      audioDurationMs: null,
      thumbnailUri: null,
      occurredSortKey: null,
    };
    const found = await deps.moments.findById(momentId);
    if (found.kind !== 'ready') {
      return {
        source: found.kind === 'unreadable' ? 'unreadable' : 'missing',
        ...empty,
      };
    }
    let photoCount = 0;
    let hasAudio = false;
    let unknownCount = 0;
    let audioDurationMs: number | null = null;
    let thumbnailUri: string | null = null;
    if (deps.assets) {
      for (const assetId of found.moment.assetIds) {
        const asset = await deps.assets.findById(assetId);
        if (asset.kind !== 'ready') {
          unknownCount += 1;
          continue;
        }
        if (asset.asset.type === 'image') {
          photoCount += 1;
          if (!thumbnailUri) {
            const uri = asset.asset.localUri;
            const available = deps.media ? await deps.media.exists(uri) : Boolean(uri);
            thumbnailUri = available ? uri : null;
          }
          continue;
        }
        if (asset.asset.type === 'audio') {
          hasAudio = true;
          const duration = asset.asset.metadata?.durationMs;
          if (typeof duration === 'number' && duration > 0) audioDurationMs = duration;
          continue;
        }
        unknownCount += 1;
      }
    }
    const occurred = found.moment.time.occurredAt;
    const dateIso = occurred || found.moment.time.recordedAt;
    const dated = formatCollectedAt(dateIso, viewerClock);
    const occurredSortKey = dateIso ? parseMillis(dateIso) : null;
    return {
      source: 'ready',
      noteExcerpt: albumNoteExcerpt(found.moment.content.note),
      dateLabel: occurred ? dated : dated ? `记录于 ${dated}` : null,
      mediaHint: albumMediaHint({ photoCount, hasAudio, unknownCount }),
      photoCount,
      hasAudio,
      unknownCount,
      audioDurationMs,
      thumbnailUri,
      occurredSortKey,
    };
  }

  async function toManageView(albumId: string): Promise<AlbumManageView> {
    const album = await requireAlbum(albumId);
    const records = await albums.listEntries(albumId);
    const entries: AlbumEntryView[] = [];
    for (const record of records) {
      const described = await describeEntry(record.momentId);
      entries.push({
        momentId: record.momentId,
        collectedAt: record.collectedAt,
        sourceRevisionAtCollect: record.sourceRevisionAtCollect,
        ...described,
      });
    }
    return {
      album: toAlbum(album, records),
      entries,
      coverCandidates: await coverCandidates(albumId),
    };
  }

  async function listAlbums(): Promise<AlbumListView> {
    try {
      const records = await albums.list(ownerId);
      const items: AlbumListItem[] = [];
      for (const record of records) {
        items.push(await toListItem(record));
      }
      items.sort((left, right) => {
        const leftAt = left.lastCollectedAt || left.id;
        const rightAt = right.lastCollectedAt || right.id;
        if (left.lastCollectedAt && right.lastCollectedAt && leftAt !== rightAt) {
          return rightAt.localeCompare(leftAt);
        }
        if (left.lastCollectedAt && !right.lastCollectedAt) return -1;
        if (!left.lastCollectedAt && right.lastCollectedAt) return 1;
        return right.id.localeCompare(left.id);
      });
      return { status: 'ready', albums: items };
    } catch (error) {
      if (error instanceof ApplicationError) return { status: 'error', message: error.message };
      return { status: 'error', message: '生活册暂时读不出来，原来的记录还在。' };
    }
  }

  async function getAlbum(albumId: string): Promise<AlbumManageView> {
    try {
      return await toManageView(albumId);
    } catch (error) {
      throw toApplicationError(error);
    }
  }

  async function createAlbum(input?: { name?: string }): Promise<LifeAlbum> {
    const now = clock.now().toISOString();
    const album = {
      id: nextId(),
      ownerId,
      schemaVersion: LIFE_ALBUM_SCHEMA_VERSION,
      name: normalizeAlbumName(input?.name),
      opening: null,
      cover: { kind: 'words' as const },
      createdAt: now,
      updatedAt: now,
    };
    try {
      await albums.withTransaction(async () => {
        await albums.insert(album);
      });
    } catch (error) {
      writeFailed(error);
    }
    return toAlbum(album, []);
  }

  async function updateAlbum(input: {
    albumId: string;
    name?: string;
    opening?: string | null;
  }): Promise<AlbumManageView> {
    try {
      await albums.withTransaction(async () => {
        const album = await requireAlbum(input.albumId);
        const next = {
          ...album,
          name: input.name === undefined ? album.name : normalizeAlbumName(input.name),
          opening:
            input.opening === undefined ? album.opening : normalizeAlbumOpening(input.opening),
          updatedAt: clock.now().toISOString(),
        };
        await albums.update(next);
      });
      return await toManageView(input.albumId);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      writeFailed(error);
    }
  }

  async function setAlbumCover(input: { albumId: string; cover: AlbumCover }): Promise<AlbumManageView> {
    try {
      await albums.withTransaction(async () => {
        const album = await requireAlbum(input.albumId);
        const entries = await albums.listEntries(input.albumId);
        await assertCoverAllowed(input.albumId, input.cover, entries);
        if (coverEquals(album.cover, input.cover)) return;
        await albums.update({
          ...album,
          cover: input.cover,
          updatedAt: clock.now().toISOString(),
        });
      });
      return await toManageView(input.albumId);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      writeFailed(error);
    }
  }

  async function collectAlbumEntry(input: {
    albumId: string;
    momentId: string;
  }): Promise<{ album: LifeAlbum; inserted: boolean; alreadyCollected: boolean }> {
    try {
      let inserted = false;
      await albums.withTransaction(async () => {
        await requireAlbum(input.albumId);
        const existing = await albums.findEntry(input.albumId, input.momentId);
        if (existing) return;
        const found = await deps.moments.findById(input.momentId);
        if (found.kind !== 'ready') {
          throw new ApplicationError(ALBUM_SOURCE_UNAVAILABLE, '这条记录现在无法找到。');
        }
        const current = await albums.listEntries(input.albumId);
        const result = await albums.insertEntry({
          albumId: input.albumId,
          momentId: input.momentId,
          collectedAt: clock.now().toISOString(),
          sourceRevisionAtCollect: found.moment.revision,
          sortOrder: current.length,
        });
        if (result === 'exists') return;
        inserted = true;
        const album = await requireAlbum(input.albumId);
        await albums.update({
          ...album,
          updatedAt: clock.now().toISOString(),
        });
      });
      const view = await toManageView(input.albumId);
      return { album: view.album, inserted, alreadyCollected: !inserted };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      writeFailed(error);
    }
  }

  async function withdrawAlbumEntry(input: {
    albumId: string;
    momentId: string;
  }): Promise<AlbumManageView> {
    try {
      await albums.withTransaction(async () => {
        const album = await requireAlbum(input.albumId);
        const removed = await albums.deleteEntry(input.albumId, input.momentId);
        if (!removed) return;
        const remaining = await albums.listEntries(input.albumId);
        await albums.replaceEntryOrder(
          input.albumId,
          remaining.map((entry) => entry.momentId),
        );
        await albums.update({
          ...album,
          cover: await coverAfterRemoving(album, input.momentId),
          updatedAt: clock.now().toISOString(),
        });
      });
      return await toManageView(input.albumId);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      writeFailed(error);
    }
  }

  async function reorderAlbumEntries(input: {
    albumId: string;
    momentIds: string[];
  }): Promise<AlbumManageView> {
    try {
      await albums.withTransaction(async () => {
        const album = await requireAlbum(input.albumId);
        const current = await albums.listEntries(input.albumId);
        const currentIds = current.map((entry) => entry.momentId);
        if (currentIds.length !== input.momentIds.length) {
          throw new ApplicationError(ALBUM_REORDER_INVALID, '这一册的顺序没有改成。可以再试。');
        }
        const same = [...currentIds].sort().join('\0') === [...input.momentIds].sort().join('\0');
        if (!same) {
          throw new ApplicationError(ALBUM_REORDER_INVALID, '这一册的顺序没有改成。可以再试。');
        }
        await albums.replaceEntryOrder(input.albumId, input.momentIds);
        await albums.update({
          ...album,
          updatedAt: clock.now().toISOString(),
        });
      });
      return await toManageView(input.albumId);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      writeFailed(error);
    }
  }

  async function moveAlbumEntry(input: {
    albumId: string;
    momentId: string;
    direction: 'up' | 'down';
  }): Promise<AlbumManageView> {
    const current = await albums.listEntries(input.albumId);
    const ids = current.map((entry) => entry.momentId);
    const index = ids.indexOf(input.momentId);
    if (index < 0) throw new ApplicationError(ALBUM_REORDER_INVALID, '这一册的顺序没有改成。可以再试。');
    const swap = input.direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= ids.length) return toManageView(input.albumId);
    const next = ids.slice();
    const [moved] = next.splice(index, 1);
    next.splice(swap, 0, moved);
    return reorderAlbumEntries({ albumId: input.albumId, momentIds: next });
  }

  async function deleteAlbum(albumId: string): Promise<void> {
    try {
      await albums.withTransaction(async () => {
        await requireAlbum(albumId);
        await albums.delete(albumId);
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      writeFailed(error);
    }
  }

  async function albumIdsContainingMoment(momentId: string): Promise<string[]> {
    return albums.listAlbumIdsContaining(momentId);
  }

  return {
    listAlbums,
    getAlbum,
    createAlbum,
    updateAlbum,
    setAlbumCover,
    collectAlbumEntry,
    withdrawAlbumEntry,
    reorderAlbumEntries,
    moveAlbumEntry,
    deleteAlbum,
    albumIdsContainingMoment,
  };
}

export type LifeAlbumUseCases = ReturnType<typeof createLifeAlbumUseCases>;
