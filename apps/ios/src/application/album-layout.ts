import { appLanguage, tr, type AppLanguage } from '../i18n';
import type { AlbumCover } from './life-album';

/** Bumped when font resolve / measure / draw rules change so in-process cache and old probes invalidate. */
export const ALBUM_LAYOUT_VERSION = 'album-a5-v3' as const;
export const ALBUM_PAGE_WIDTH_PT = 420;
export const ALBUM_PAGE_HEIGHT_PT = 595;
export const ALBUM_MARGIN_TOP_PT = 40;
export const ALBUM_MARGIN_BOTTOM_PT = 44;
export const ALBUM_MARGIN_X_PT = 36;
export const ALBUM_CONTENT_WIDTH_PT = 348;
export const ALBUM_CONTENT_HEIGHT_PT = 511;
export const ALBUM_RECORD_GAP_PT = 16;
export const ALBUM_FILL_RATIO = 0.35;

export const ALBUM_SERIF_FONT = appLanguage === 'en' ? 'Georgia' : 'Songti SC';
export const ALBUM_UI_FONT = appLanguage === 'en' ? 'HelveticaNeue' : 'PingFang SC';
export const ALBUM_SERIF_LICENSE = appLanguage === 'en'
  ? 'iOS system Georgia. Actual resolution and PDF font embedding must be checked separately; no font file is bundled or redistributed.'
  : '目标为 iOS 系统中文衬线 Songti SC / STSong（Apple 随系统授权；授权外副本不可再分发）。实际解析字体以设备 diagnoseFonts 为准；PDF 是否嵌入字形须查文件 /Font 资源，与许可是两件事。';
export const ALBUM_UI_LICENSE = appLanguage === 'en'
  ? 'iOS system Helvetica Neue. Actual resolution and PDF font embedding must be checked separately; no font file is bundled or redistributed.'
  : '目标为 iOS 系统 UI 字体 PingFang SC（Apple 随系统授权；授权外副本不可再分发）。实际解析与 PDF 嵌入情况分别核实。';

export const ALBUM_PREVIEW_ACTION = tr("看看这一册");
export const ALBUM_PREVIEW_EMPTY = tr("先收下一条，也可以慢慢添。");
export const ALBUM_PREVIEW_LOADING = tr("正在排成一册。");
export const ALBUM_PREVIEW_FAILED = tr("这一册暂时排不出来。收进的记录还在。");
export const ALBUM_LAYOUT_UNAVAILABLE_COPY = tr("排版能力尚不可用");
export const ALBUM_PREVIEW_CANCEL = tr("取消");
export const ALBUM_PREVIEW_ZOOM = tr("放大阅读");
export const ALBUM_PREVIEW_ZOOM_OUT = tr("恢复原尺寸");
export const ALBUM_PREVIEW_NEXT = tr("下一页");
export const ALBUM_PREVIEW_PREV = tr("上一页");
export const ALBUM_CLOSE_TEXT = tr("这些日子，先放到这里。");
export const ALBUM_IMAGE_MISSING = tr("这张照片现在看不到。");
export const ALBUM_AUDIO_MISSING = tr("这段声音现在听不到。");
export const ALBUM_SOURCE_GONE = tr("这条已经不在。");
export const ALBUM_SOURCE_UNREADABLE = tr("这条记录暂时读不出来。");
export const ALBUM_SOURCE_CHANGED = tr("这条后来改过。");
export const ALBUM_AUDIO_LABEL = tr("一段声音");
export const ALBUM_CONTINUED = tr("续");
export const ALBUM_TIME_UNKNOWN = tr("发生时间未确认");

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
  language?: AppLanguage;
  fontPolicy?: string;
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
  rendering?: { serif: string; ui: string; copy: Record<string, string> };
};

export type AlbumLayout = {
  albumId: string;
  language?: AppLanguage;
  layoutVersion: typeof ALBUM_LAYOUT_VERSION;
  pageSize: { widthPt: number; heightPt: number };
  margins: { topPt: number; rightPt: number; bottomPt: number; leftPt: number };
  fonts: AlbumFontSpec;
  fontFaces: {
    serif: string;
    ui: string;
    serifLicense: string;
    uiLicense: string;
    /** Populated when native diagnoseFonts runs; never invent Songti after system fallback. */
    resolvedSerif?: {
      requested: string;
      familyName: string;
      fontName: string;
      matchedRequestedFamily: boolean;
      usedSystemFallback: boolean;
    };
    resolvedUi?: {
      requested: string;
      familyName: string;
      fontName: string;
      matchedRequestedFamily: boolean;
      usedSystemFallback: boolean;
    };
  };
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
