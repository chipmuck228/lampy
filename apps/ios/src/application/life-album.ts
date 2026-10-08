import { tr } from '../i18n';
export const LIFE_ALBUM_SCHEMA_VERSION = 1 as const;
export const DEFAULT_ALBUM_NAME = tr("一些日子");

export const ALBUM_EMPTY_LEAD = tr("把一些日子，放在一起。");
export const ALBUM_EMPTY_HINT = tr("先收下一条，也可以慢慢添。");
export const ALBUM_GUIDE_TITLE = tr("把一些日子，收成一册。");
export const ALBUM_GUIDE_BODY =
  tr("给册子起个名字，再去回看，把想留在一起的片段收进来。随后，看看这一册。");
export const ALBUM_GUIDE_DISMISS = tr("收起说明");
export const ALBUM_GUIDE_REOPEN = tr("怎么使用");
/** Shown when dismiss succeeded in-session but SecureStore write failed. */
export const ALBUM_GUIDE_PERSIST_FAILED = tr("说明还没记牢，下次可能还会出现。");
export const ALBUM_ROOT_LABEL = tr("生活册");
export const ALBUM_NEW_ACTION = tr("新建一册");
/** Submit label when creating from the collect sheet (create + collect). */
export const ALBUM_CREATE_AND_COLLECT_ACTION = tr("创建并加入此册");
/** Submit label when creating from the album list (create only). */
export const ALBUM_CREATE_ONLY_ACTION = tr("创建这一册");
export const ALBUM_MISSING_SOURCE = tr("这条已经不在");
export const ALBUM_COLLECT_ACTION = tr("收进这一册");
export const ALBUM_COLLECTED_ACTION = tr("已收下");
export const ALBUM_EXIT_COLLECT = tr("退出");
export const ALBUM_READ_FAILED = tr("生活册暂时读不出来，原来的记录还在。");
export const ALBUM_RETRY = tr("再试一次");
export const ALBUM_DELETE_CONFIRM = tr("只删这一册，不删原来的记录。");
export const ALBUM_COLLECT_MENU = tr("收进生活册");
export const ALBUM_ALREADY_IN = tr("已在此册");
export const ALBUM_JOIN_ACTION = tr("加入此册");
export const ALBUM_MY_ALBUMS = tr("我的生活册");
export const ALBUM_GONE = tr("这一册已经不在。原来的记录还在。");
export const ALBUM_WRITE_FAILED = tr("这一册还没记下。原来的记录还在，可以再试。");
/** Album row exists; collect into it failed — do not claim full success. */
export const ALBUM_CREATED_COLLECT_FAILED = tr("册子已创建，这条还没有加入。可以再试。");
export const ALBUM_CREATE_COLLECT_SUCCESS = tr("已加入此册");
export const ALBUM_CREATE_COLLECT_RETRY = tr("再试加入");
export const ALBUM_LOADING = tr("生活册正在读出来。");
export const ALBUM_WORDS_COVER = tr("文字封面");
export const ALBUM_OPENING_HINT = tr("可以写一段开篇，也可以留空。");

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
  photoCount: number;
  hasAudio: boolean;
  unknownCount: number;
  audioDurationMs: number | null;
  thumbnailUri: string | null;
  occurredSortKey: number | null;
};

export const ALBUM_NOTE_EXCERPT_MAX = 72;

export function albumNoteExcerpt(note: string | undefined | null, max = ALBUM_NOTE_EXCERPT_MAX): string | null {
  const trimmed = (note ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export function albumMediaHint(input: { photoCount: number; hasAudio: boolean; unknownCount?: number }): string | null {
  const parts: string[] = [];
  if (input.photoCount > 0) parts.push(input.photoCount === 1 ? tr("有照片") : tr('有{0}张照片', [input.photoCount]));
  if (input.hasAudio) parts.push(tr("有声音"));
  if (input.unknownCount) parts.push(tr("还有一种现在打不开的媒介。"));
  return parts.length ? parts.join(' · ') : null;
}

export type AlbumListItem = {
  id: string;
  name: string;
  entryCount: number;
  lastCollectedAt: string | null;
  lastCollectedLabel: string | null;
  cover: AlbumCover;
  /** Resolved display URI for an image cover; null → warm words cover. */
  coverUri: string | null;
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
  return tr('正在收进《{0}》', [name]);
}

export function albumEntryCountLabel(count: number): string {
  return tr('{0}条', [count]);
}

export function albumDateRangeLabel(entries: { occurredSortKey: number | null; dateLabel: string | null }[]): string | null {
  const dated = entries
    .filter((entry) => entry.occurredSortKey != null && entry.dateLabel)
    .sort((left, right) => (left.occurredSortKey ?? 0) - (right.occurredSortKey ?? 0));
  if (!dated.length) return null;
  const first = dated[0].dateLabel;
  const last = dated[dated.length - 1].dateLabel;
  if (!first || !last || first === last) return first;
  return `${first} — ${last}`;
}

export function formatAlbumAudioDuration(durationMs: number | null): string | null {
  if (durationMs == null || durationMs <= 0) return null;
  const total = Math.round(durationMs / 1000);
  if (total < 60) return tr('{0}秒', [total]);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds ? tr('{0}分{1}秒', [minutes, seconds]) : tr('{0}分钟', [minutes]);
}
