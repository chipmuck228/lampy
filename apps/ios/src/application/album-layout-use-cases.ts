import type { HistoryClock } from '../domain-adapters/calendar';
import type { AssetRepository, MomentRepository } from '../infrastructure/repositories';
import type { LifeAlbumRepository } from '../infrastructure/life-album-repository';
import { ApplicationError } from './errors';
import {
  ALBUM_LAYOUT_UNAVAILABLE_COPY,
  ALBUM_LAYOUT_VERSION,
  ALBUM_PREVIEW_FAILED,
  fingerprintsEqual,
  type AlbumLayout,
  type AlbumSourceFingerprint,
} from './album-layout';
import type { AlbumLayoutMediaMap } from './album-layout-input';
import { fingerprintFromInput, paginateAlbumLayout } from './album-paginate';
import { readAlbumLayoutInput } from './album-layout-read';
import {
  ALBUM_LAYOUT_UNAVAILABLE,
  createAlbumTextMeasurer,
  type AlbumTextMeasurer,
} from './album-text-measure';

export const ALBUM_LAYOUT_CANCELLED = 'ALBUM_LAYOUT_CANCELLED';
export const ALBUM_LAYOUT_STALE = 'ALBUM_LAYOUT_STALE';
export const ALBUM_LAYOUT_FAILED = 'ALBUM_LAYOUT_FAILED';
export { ALBUM_LAYOUT_UNAVAILABLE };

export type AlbumLayoutResult = {
  layout: AlbumLayout;
  media: AlbumLayoutMediaMap;
  fingerprint: AlbumSourceFingerprint;
  requestId: number;
};

type CacheEntry = {
  albumId: string;
  layout: AlbumLayout;
  fingerprint: AlbumSourceFingerprint;
};

export function createAlbumLayoutUseCases(deps: {
  albums: LifeAlbumRepository;
  moments: MomentRepository;
  assets?: AssetRepository;
  media?: {
    exists(uri: string): Promise<boolean>;
    resolveUri?(uri: string): Promise<string | null>;
  };
  ownerId?: string;
  measurer?: AlbumTextMeasurer;
  clock?: { now: () => Date };
  timezone?: HistoryClock;
  privateUnlocked?: () => boolean;
}) {
  const clock = deps.clock ?? { now: () => new Date() };
  const timezone: HistoryClock = deps.timezone ?? {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
  const cache = new Map<string, CacheEntry>();
  let generation = 0;
  const cancelledIds = new Set<number>();

  function assertUnlocked(privateUnlocked?: boolean) {
    if (privateUnlocked === false) {
      throw new ApplicationError(ALBUM_LAYOUT_FAILED, ALBUM_PREVIEW_FAILED);
    }
    if (deps.privateUnlocked && !deps.privateUnlocked()) {
      throw new ApplicationError(ALBUM_LAYOUT_FAILED, ALBUM_PREVIEW_FAILED);
    }
  }

  function measurer(): AlbumTextMeasurer {
    if (deps.measurer) return deps.measurer;
    try {
      return createAlbumTextMeasurer();
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(ALBUM_LAYOUT_UNAVAILABLE, ALBUM_LAYOUT_UNAVAILABLE_COPY);
    }
  }

  function assertCurrent(requestId: number, signal?: { cancelled: boolean }) {
    if (signal?.cancelled || cancelledIds.has(requestId) || requestId !== generation) {
      throw new ApplicationError(ALBUM_LAYOUT_CANCELLED, ALBUM_PREVIEW_FAILED);
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

  function beginAlbumLayout(albumId: string) {
    generation += 1;
    return { albumId, requestId: generation };
  }

  async function generateAlbumLayout(
    albumId: string,
    options?: { signal?: { cancelled: boolean }; requestId?: number; privateUnlocked?: boolean },
  ): Promise<AlbumLayoutResult> {
    assertUnlocked(options?.privateUnlocked);
    const requestId = options?.requestId ?? beginAlbumLayout(albumId).requestId;
    const first = await snapshot(albumId);
    assertCurrent(requestId, options?.signal);
    const fingerprint = fingerprintFromInput(first.input.album, first.input);
    const cached = cache.get(albumId);
    if (
      cached &&
      cached.layout.layoutVersion === ALBUM_LAYOUT_VERSION &&
      fingerprintsEqual(cached.fingerprint, fingerprint)
    ) {
      assertCurrent(requestId, options?.signal);
      return { layout: cached.layout, fingerprint: cached.fingerprint, media: first.media, requestId };
    }
    const layout = await paginateAlbumLayout(first.input, measurer(), {
      generatedAt: clock.now().toISOString(),
      timezone,
    });
    assertCurrent(requestId, options?.signal);
    const second = await snapshot(albumId);
    assertCurrent(requestId, options?.signal);
    const after = fingerprintFromInput(second.input.album, second.input);
    if (!fingerprintsEqual(fingerprint, after)) {
      throw new ApplicationError(ALBUM_LAYOUT_STALE, '排的时候记录有变动，这一次没有排成。');
    }
    cache.set(albumId, { albumId, layout, fingerprint });
    return { layout, media: first.media, fingerprint, requestId };
  }

  function invalidateAlbumLayout(albumId: string) {
    cache.delete(albumId);
  }

  function cancelAlbumLayout(requestId?: number) {
    if (requestId == null) {
      generation += 1;
      return;
    }
    cancelledIds.add(requestId);
  }

  return {
    beginAlbumLayout,
    generateAlbumLayout,
    invalidateAlbumLayout,
    cancelAlbumLayout,
    currentLayoutGeneration() {
      return generation;
    },
  };
}

export type AlbumLayoutUseCases = ReturnType<typeof createAlbumLayoutUseCases>;
