export const LIFE_ALBUM_SCHEMA_VERSION = 1 as const;
export const DEFAULT_ALBUM_NAME = '一些日子';

export const ALBUM_EMPTY_LEAD = '把一些日子，放在一起。';
export const ALBUM_EMPTY_HINT = '先收下一条，也可以慢慢添。';
export const ALBUM_NEW_ACTION = '新建一册';
export const ALBUM_MISSING_SOURCE = '这条已经不在';
export const ALBUM_COLLECT_ACTION = '收进这一册';
export const ALBUM_COLLECTED_ACTION = '已收下';
export const ALBUM_EXIT_COLLECT = '退出';
export const ALBUM_READ_FAILED = '生活册暂时读不出来，原来的记录还在。';
export const ALBUM_RETRY = '再试一次';
export const ALBUM_DELETE_CONFIRM = '只删这一册，不删原来的记录。';
export const ALBUM_COLLECT_MENU = '收进生活册';
export const ALBUM_ALREADY_IN = '已在这一册';
export const ALBUM_MY_ALBUMS = '我的生活册';
export const ALBUM_GONE = '这一册已经不在。原来的记录还在。';
export const ALBUM_WRITE_FAILED = '这一册还没记下。原来的记录还在，可以再试。';
export const ALBUM_LOADING = '生活册正在读出来。';
export const ALBUM_WORDS_COVER = '文字封面';
export const ALBUM_OPENING_HINT = '可以写一段开篇，也可以留空。';

export type AlbumCover =
  | { kind: 'words' }
  | { kind: 'image'; momentId: string; assetId: string };

export type AlbumEntry = {
  momentId: string;
  collectedAt: string;
  sourceRevisionAtCollect: number;
};

export type LifeAlbum = {
  id: string;
  schemaVersion: typeof LIFE_ALBUM_SCHEMA_VERSION;
  name: string;
  opening: string | null;
  cover: AlbumCover;
  entries: AlbumEntry[];
  createdAt: string;
  updatedAt: string;
};

export type AlbumEntrySource = 'ready' | 'missing' | 'unreadable';

export type AlbumEntryView = AlbumEntry & {
  source: AlbumEntrySource;
  noteExcerpt: string | null;
  dateLabel: string | null;
  mediaHint: string | null;
};

export const ALBUM_NOTE_EXCERPT_MAX = 36;

export function albumNoteExcerpt(note: string | undefined | null, max = ALBUM_NOTE_EXCERPT_MAX): string | null {
  const trimmed = (note ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export function albumMediaHint(input: { photoCount: number; hasAudio: boolean }): string | null {
  const parts: string[] = [];
  if (input.photoCount > 0) parts.push(input.photoCount === 1 ? '有照片' : `有${input.photoCount}张照片`);
  if (input.hasAudio) parts.push('有声音');
  return parts.length ? parts.join(' · ') : null;
}

export type AlbumListItem = {
  id: string;
  name: string;
  entryCount: number;
  lastCollectedAt: string | null;
  lastCollectedLabel: string | null;
  cover: AlbumCover;
};

export type AlbumCoverCandidate = {
  momentId: string;
  assetId: string;
  uri?: string;
  available: boolean;
};

export type AlbumManageView = {
  album: LifeAlbum;
  entries: AlbumEntryView[];
  coverCandidates: AlbumCoverCandidate[];
};

export type AlbumListView =
  | { status: 'ready'; albums: AlbumListItem[] }
  | { status: 'error'; message: string };

export function normalizeAlbumName(name: string | undefined | null): string {
  const trimmed = (name ?? '').trim();
  return trimmed || DEFAULT_ALBUM_NAME;
}

export function normalizeAlbumOpening(opening: string | undefined | null): string | null {
  const trimmed = (opening ?? '').trim();
  return trimmed || null;
}

export function albumCollectingLabel(name: string): string {
  return `正在收进《${name}》`;
}

export function albumEntryCountLabel(count: number): string {
  return `${count}条`;
}
