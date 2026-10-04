import type { HistoryClock } from '../domain-adapters/calendar';
import type { AssetRepository, MomentRepository } from '../infrastructure/repositories';
import type { LifeAlbumRepository } from '../infrastructure/life-album-repository';
import { ApplicationError } from './errors';
import {
  ALBUM_LAYOUT_VERSION,
  ALBUM_PREVIEW_FAILED,
  fingerprintsEqual,
  type AlbumLayout,
  type AlbumSourceFingerprint,
} from './album-layout';
import type { AlbumLayoutMediaMap } from './album-layout-input';
import { fingerprintFromInput, paginateAlbumLayout } from './album-paginate';
import { readAlbumLayoutInput } from './album-layout-read';
import { createAlbumTextMeasurer, type AlbumTextMeasurer } from './album-text-measure';

export const ALBUM_LAYOUT_CANCELLED = 'ALBUM_LAYOUT_CANCELLED';
export const ALBUM_LAYOUT_STALE = 'ALBUM_LAYOUT_STALE';
export const ALBUM_LAYOUT_FAILED = 'ALBUM_LAYOUT_FAILED';

export type AlbumLayoutResult = {
  layout: AlbumLayout;
  media: AlbumLayoutMediaMap;
  fingerprint: AlbumSourceFingerprint;
};

type CacheEntry = AlbumLayoutResult & { albumId: string };

export function createAlbumLayoutUseCases(deps: {
  albums: LifeAlbumRepository;
  moments: MomentRepository;
  assets?: AssetRepository;
  media?: { exists(uri: string): Promise<boolean> };
  ownerId?: string;
  measurer?: AlbumTextMeasurer;
  clock?: { now: () => Date };
  timezone?: HistoryClock;
  privateUnlocked?: () => boolean;
}) {
  const measurer = deps.measurer ?? createAlbumTextMeasurer();
  const clock = deps.clock ?? { now: () => new Date() };
  const timezone: HistoryClock = deps.timezone ?? {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
  const cache = new Map<string, CacheEntry>();
  let generation = 0;

  function assertUnlocked() {
    if (deps.privateUnlocked && !deps.privateUnlocked()) {
      throw new ApplicationError(ALBUM_LAYOUT_FAILED, ALBUM_PREVIEW_FAILED);
    }
  }

  async function snapshot(albumId: string) {
    return readAlbumLayoutInput({
      albums: deps.albums,
      moments: deps.moments,
      assets: deps.assets,
      media: deps.media,
      ownerId: deps.ownerId,
      albumId,
    });
  }

  async function generateAlbumLayout(
    albumId: string,
    options?: { signal?: { cancelled: boolean }; generation?: number; privateUnlocked?: boolean },
  ): Promise<AlbumLayoutResult> {
    assertUnlocked();
    const request = options?.generation ?? ++generation;
    if (options?.generation != null) generation = Math.max(generation, options.generation);
    if (options?.privateUnlocked === false) {
      throw new ApplicationError(ALBUM_LAYOUT_FAILED, ALBUM_PREVIEW_FAILED);
    }
    const first = await snapshot(albumId);
    if (options?.signal?.cancelled || request !== generation) {
      throw new ApplicationError(ALBUM_LAYOUT_CANCELLED, ALBUM_PREVIEW_FAILED);
    }
    const fingerprint = fingerprintFromInput(first.input.album, first.input);
    const cached = cache.get(albumId);
    if (
      cached &&
      cached.layout.layoutVersion === ALBUM_LAYOUT_VERSION &&
      fingerprintsEqual(cached.fingerprint, fingerprint)
    ) {
      return cached;
    }
    const layout = await paginateAlbumLayout(first.input, measurer, {
      generatedAt: clock.now().toISOString(),
      timezone,
    });
    if (options?.signal?.cancelled || request !== generation) {
      throw new ApplicationError(ALBUM_LAYOUT_CANCELLED, ALBUM_PREVIEW_FAILED);
    }
    const second = await snapshot(albumId);
    const after = fingerprintFromInput(second.input.album, second.input);
    if (!fingerprintsEqual(fingerprint, after)) {
      throw new ApplicationError(ALBUM_LAYOUT_STALE, '排的时候记录有变动，这一次没有排成。');
    }
    const result: AlbumLayoutResult = { layout, media: first.media, fingerprint };
    cache.set(albumId, { ...result, albumId });
    return result;
  }

  function invalidateAlbumLayout(albumId: string) {
    cache.delete(albumId);
  }

  function cancelAlbumLayout() {
    generation += 1;
  }

  return {
    generateAlbumLayout,
    invalidateAlbumLayout,
    cancelAlbumLayout,
    currentLayoutGeneration() {
      return generation;
    },
  };
}

export type AlbumLayoutUseCases = ReturnType<typeof createAlbumLayoutUseCases>;
