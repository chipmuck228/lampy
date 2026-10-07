import type { LifeAlbum } from './life-album';
import type { AlbumSourceMediaState, AlbumSourcePresence } from './album-layout';

export type AlbumLayoutMediaInput = {
  assetId: string;
  role: 'image' | 'audio' | 'unknown';
  availability: AlbumSourceMediaState;
  intrinsicRatio: number | null;
  durationMs: number | null;
  uri?: string;
};

export type AlbumLayoutRecordInput = {
  momentId: string;
  collectedAt: string;
  sourceRevisionAtCollect: number;
  presence: AlbumSourcePresence;
  revision: number | null;
  note: string;
  feeling: string;
  occurredAt?: string;
  occurredAtPrecision: string;
  recordedAt: string;
  media: AlbumLayoutMediaInput[];
};

export type AlbumLayoutInput = {
  album: LifeAlbum;
  entries: AlbumLayoutRecordInput[];
};

export type AlbumLayoutMediaMap = Record<string, string>;
