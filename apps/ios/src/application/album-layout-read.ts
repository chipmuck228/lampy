import type { AssetRepository, MomentRepository } from '../infrastructure/repositories';
import type { LifeAlbumRepository } from '../infrastructure/life-album-repository';
import { LOCAL_OWNER_ID } from '../domain-adapters/identity';
import { ApplicationError } from './errors';
import { ALBUM_NOT_FOUND } from './life-album-use-cases';
import { ALBUM_GONE } from './life-album';
import type { AlbumLayoutInput, AlbumLayoutMediaInput, AlbumLayoutMediaMap, AlbumLayoutRecordInput } from './album-layout-input';
import type { AlbumSourceMediaState } from './album-layout';
import type { LifeAlbum } from './life-album';

async function locateLayoutDisplayUri(
  stored: string | undefined,
  media?: {
    exists(uri: string): Promise<boolean>;
    resolveUri?(uri: string): Promise<string | null>;
  },
): Promise<string | null> {
  if (!stored) return null;
  if (media?.resolveUri) return media.resolveUri(stored);
  if (media) return (await media.exists(stored)) ? stored : null;
  return stored;
}

export async function readAlbumLayoutInput(deps: {
  albums: LifeAlbumRepository;
  moments: MomentRepository;
  assets?: AssetRepository;
  media?: {
    exists(uri: string): Promise<boolean>;
    resolveUri?(uri: string): Promise<string | null>;
  };
  ownerId?: string;
  albumId: string;
}): Promise<{ input: AlbumLayoutInput; media: AlbumLayoutMediaMap }> {
  const ownerId = deps.ownerId || LOCAL_OWNER_ID;
  const album = await deps.albums.findById(deps.albumId);
  if (!album || album.ownerId !== ownerId) {
    throw new ApplicationError(ALBUM_NOT_FOUND, ALBUM_GONE);
  }
  const entries = await deps.albums.listEntries(album.id);
  const records: AlbumLayoutRecordInput[] = [];
  const mediaMap: AlbumLayoutMediaMap = {};
  for (const entry of entries) {
    const found = await deps.moments.findById(entry.momentId);
    if (found.kind !== 'ready') {
      records.push({
        momentId: entry.momentId,
        collectedAt: entry.collectedAt,
        sourceRevisionAtCollect: entry.sourceRevisionAtCollect,
        presence: found.kind === 'unreadable' ? 'unreadable' : 'missing',
        revision: null,
        note: '',
        feeling: '',
        occurredAtPrecision: 'unknown',
        recordedAt: entry.collectedAt,
        media: [],
      });
      continue;
    }
    const media: AlbumLayoutMediaInput[] = [];
    for (const assetId of found.moment.assetIds) {
      if (!deps.assets) {
        media.push({
          assetId,
          role: 'unknown',
          availability: 'unreadable',
          intrinsicRatio: null,
          durationMs: null,
        });
        continue;
      }
      const asset = await deps.assets.findById(assetId);
      if (asset.kind === 'missing') {
        media.push({
          assetId,
          role: 'unknown',
          availability: 'missing',
          intrinsicRatio: null,
          durationMs: null,
        });
        continue;
      }
      if (asset.kind === 'unreadable') {
        media.push({
          assetId,
          role: asset.type === 'image' || asset.type === 'audio' ? asset.type : 'unknown',
          availability: 'unreadable',
          intrinsicRatio: null,
          durationMs: null,
        });
        continue;
      }
      const role: AlbumLayoutMediaInput['role'] =
        asset.asset.type === 'image' ? 'image' : asset.asset.type === 'audio' ? 'audio' : 'unknown';
      // Prefer resolveUri so remapped container paths (stale Application UUID) reach
      // native UIImage / RN Image — exists() alone can be true while the stored URI is dead.
      const displayUri = await locateLayoutDisplayUri(asset.asset.localUri, deps.media);
      const availability: AlbumSourceMediaState = displayUri ? 'available' : 'missing';
      if (displayUri) mediaMap[assetId] = displayUri;
      const width = asset.asset.metadata.width;
      const height = asset.asset.metadata.height;
      media.push({
        assetId,
        role,
        availability,
        intrinsicRatio: width && height ? width / height : role === 'image' ? 1 : null,
        durationMs: asset.asset.metadata.durationMs ?? null,
        uri: displayUri ?? undefined,
      });
    }
    records.push({
      momentId: found.moment.id,
      collectedAt: entry.collectedAt,
      sourceRevisionAtCollect: entry.sourceRevisionAtCollect,
      presence: 'ready',
      revision: found.moment.revision,
      note: found.moment.content.note || '',
      feeling: found.moment.content.emotion || '',
      occurredAt: found.moment.time.occurredAt,
      occurredAtPrecision: found.moment.time.occurredAtPrecision,
      recordedAt: found.moment.time.recordedAt,
      media,
    });
  }
  const lifeAlbum: LifeAlbum = {
    id: album.id,
    schemaVersion: album.schemaVersion,
    name: album.name,
    opening: album.opening,
    cover: album.cover,
    entries: entries.map((entry) => ({
      momentId: entry.momentId,
      collectedAt: entry.collectedAt,
      sourceRevisionAtCollect: entry.sourceRevisionAtCollect,
    })),
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
  };
  return { input: { album: lifeAlbum, entries: records }, media: mediaMap };
}
