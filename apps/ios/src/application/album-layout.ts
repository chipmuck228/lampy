import type { AlbumCover } from './life-album';

export const ALBUM_LAYOUT_VERSION = 'album-a5-v1' as const;
export const ALBUM_PAGE_WIDTH_PT = 420;
export const ALBUM_PAGE_HEIGHT_PT = 595;
export const ALBUM_MARGIN_TOP_PT = 40;
export const ALBUM_MARGIN_BOTTOM_PT = 44;
export const ALBUM_MARGIN_X_PT = 36;
export const ALBUM_CONTENT_WIDTH_PT = 348;
export const ALBUM_CONTENT_HEIGHT_PT = 511;
export const ALBUM_RECORD_GAP_PT = 16;
export const ALBUM_FILL_RATIO = 0.35;

export const ALBUM_SERIF_FONT = 'Songti SC';
export const ALBUM_UI_FONT = 'PingFang SC';
export const ALBUM_SERIF_LICENSE =
  'iOS 系统中文衬线 Songti SC / STSong（Apple 随系统授权，不可再分发嵌入授权外副本）';
export const ALBUM_UI_LICENSE =
  'iOS 系统 UI 字体 PingFang SC（Apple 随系统授权，不可再分发嵌入授权外副本）';

export const ALBUM_PREVIEW_ACTION = '看看这一册';
export const ALBUM_PREVIEW_EMPTY = '先收下一条，也可以慢慢添。';
export const ALBUM_PREVIEW_LOADING = '正在排成一册。';
export const ALBUM_PREVIEW_FAILED = '这一册暂时排不出来。收进的记录还在。';
export const ALBUM_LAYOUT_UNAVAILABLE_COPY = '排版能力尚不可用';
export const ALBUM_PREVIEW_CANCEL = '取消';
export const ALBUM_PREVIEW_ZOOM = '放大阅读';
export const ALBUM_PREVIEW_ZOOM_OUT = '恢复整页';
export const ALBUM_PREVIEW_NEXT = '下一页';
export const ALBUM_PREVIEW_PREV = '上一页';
export const ALBUM_CLOSE_TEXT = '这些日子，先放到这里。';
export const ALBUM_IMAGE_MISSING = '这张照片现在看不到。';
export const ALBUM_AUDIO_MISSING = '这段声音现在听不到。';
export const ALBUM_SOURCE_GONE = '这条已经不在。';
export const ALBUM_SOURCE_UNREADABLE = '这条记录暂时读不出来。';
export const ALBUM_SOURCE_CHANGED = '这条后来改过。';
export const ALBUM_AUDIO_LABEL = '一段声音';
export const ALBUM_CONTINUED = '续';
export const ALBUM_TIME_UNKNOWN = '发生时间未确认';

export type AlbumFontRole = {
  family: 'album-serif' | 'album-ui' | string;
  sizePt: number;
  lineHeightPt: number;
  color: string;
};

export type AlbumFontSpec = {
  coverName: AlbumFontRole;
  body: AlbumFontRole;
  date: AlbumFontRole;
  meta: AlbumFontRole;
};

export const ALBUM_FONTS: AlbumFontSpec = {
  coverName: { family: 'album-serif', sizePt: 28, lineHeightPt: 36, color: '#25231F' },
  body: { family: 'album-serif', sizePt: 17, lineHeightPt: 32, color: '#25231F' },
  date: { family: 'album-ui', sizePt: 15, lineHeightPt: 22, color: '#53604F' },
  meta: { family: 'album-ui', sizePt: 15, lineHeightPt: 22, color: '#5C5851' },
};

export function albumFontFace(family: string): string {
  if (family === 'album-serif') return ALBUM_SERIF_FONT;
  if (family === 'album-ui') return ALBUM_UI_FONT;
  return family;
}

export type AlbumSourceMediaState = 'available' | 'missing' | 'unreadable';
export type AlbumSourcePresence = 'ready' | 'missing' | 'unreadable';

export type AlbumSourceFingerprint = {
  name: string;
  opening: string | null;
  cover: AlbumCover;
  entryOrder: string[];
  moments: {
    momentId: string;
    presence: AlbumSourcePresence;
    revision: number | null;
    media: { assetId: string; role: 'image' | 'audio' | 'unknown'; availability: AlbumSourceMediaState }[];
  }[];
};

export type AlbumBox = { xPt: number; yPt: number; widthPt: number; heightPt: number };

export type AlbumTextLine = {
  start: number;
  end: number;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  baselineYPt: number;
};

export type AlbumTextRange = { start: number; end: number; unit: 'unicode-scalar' };

type AlbumBlockBase = { box: AlbumBox };

export type AlbumPlacedBlock = AlbumBlockBase &
  (
    | {
        kind: 'cover-name';
        albumId: string;
        text: string;
        textRange: AlbumTextRange;
        lines: AlbumTextLine[];
      }
    | {
        kind: 'cover-image';
        albumId: string;
        momentId: string;
        assetId: string;
        status: 'available' | 'missing';
        intrinsicRatio: number | null;
      }
    | {
        kind: 'opening';
        albumId: string;
        text: string;
        textRange: AlbumTextRange;
        lines: AlbumTextLine[];
      }
    | { kind: 'day-rule'; momentId: string; dateKey: string; text: string; continued?: boolean }
    | {
        kind: 'note';
        momentId: string;
        revision: number;
        text: string;
        textRange: AlbumTextRange;
        lines: AlbumTextLine[];
      }
    | {
        kind: 'image';
        momentId: string;
        assetId: string;
        status: 'available' | 'missing';
        intrinsicRatio: number | null;
      }
    | {
        kind: 'audio';
        momentId: string;
        assetId: string;
        status: 'available' | 'missing' | 'unreadable';
        durationMs: number | null;
        text: string;
      }
    | { kind: 'unknown-media'; momentId: string; assetId: string; label: string }
    | { kind: 'feeling'; momentId: string; value: string; known: boolean }
    | { kind: 'recorded-at'; momentId: string; label: string }
    | { kind: 'source-changed'; momentId: string }
    | { kind: 'source-gone'; momentId: string }
    | { kind: 'source-unreadable'; momentId: string }
    | { kind: 'close'; text: string }
  );

export type AlbumPage = {
  index: number;
  blocks: AlbumPlacedBlock[];
};

export type AlbumLayout = {
  albumId: string;
  layoutVersion: typeof ALBUM_LAYOUT_VERSION;
  pageSize: { widthPt: number; heightPt: number };
  margins: { topPt: number; rightPt: number; bottomPt: number; leftPt: number };
  fonts: AlbumFontSpec;
  fontFaces: { serif: string; ui: string; serifLicense: string; uiLicense: string };
  sourceFingerprint: AlbumSourceFingerprint;
  albumUpdatedAt: string;
  generatedAt: string;
  unicodeUnit: 'unicode-scalar';
  pages: AlbumPage[];
};

export function fingerprintKey(fingerprint: AlbumSourceFingerprint, layoutVersion = ALBUM_LAYOUT_VERSION): string {
  return JSON.stringify({ layoutVersion, fingerprint });
}

export function fingerprintsEqual(left: AlbumSourceFingerprint, right: AlbumSourceFingerprint): boolean {
  return fingerprintKey(left) === fingerprintKey(right);
}

export function canOpenAlbumPreview(entryCount: number): boolean {
  return entryCount > 0;
}
