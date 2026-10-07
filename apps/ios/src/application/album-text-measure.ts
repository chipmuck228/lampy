import {
  ALBUM_FONTS,
  ALBUM_LAYOUT_UNAVAILABLE_COPY,
  albumFontFace,
  type AlbumFontRole,
  type AlbumTextLine,
} from './album-layout';
import { ApplicationError } from './errors';
import { albumCodePointAt, albumCodePointLength } from './album-unicode';
import { albumLayoutNativeAvailable, measureTextNative } from '../../modules/lampy-album-layout';

export const ALBUM_LAYOUT_UNAVAILABLE = 'ALBUM_LAYOUT_UNAVAILABLE';

export type AlbumMeasuredLine = {
  start: number;
  end: number;
  widthPt: number;
  heightPt: number;
  ascentPt: number;
};

export type AlbumTextMeasurer = {
  kind: 'core-text' | 'glyph-width-test-double';
  measure(text: string, role: AlbumFontRole, widthPt: number): Promise<AlbumMeasuredLine[]>;
};

function glyphWidth(point: string, sizePt: number): number {
  const code = point.codePointAt(0) ?? 0;
  if (point === '\n' || point === '\r') return 0;
  if (code <= 0x7f) return sizePt * 0.5;
  if (code <= 0xff) return sizePt * 0.58;
  return sizePt;
}

export function wrapByGlyphWidth(
  text: string,
  widthPt: number,
  sizePt: number,
  lineHeightPt: number,
): AlbumMeasuredLine[] {
  if (!text) return [];
  const lines: AlbumMeasuredLine[] = [];
  const length = albumCodePointLength(text);
  let index = 0;
  while (index < length) {
    const point = albumCodePointAt(text, index) ?? '';
    if (point === '\n') {
      lines.push({ start: index, end: index + 1, widthPt: 0, heightPt: lineHeightPt, ascentPt: sizePt * 0.8 });
      index += 1;
      continue;
    }
    let end = index;
    let used = 0;
    while (end < length) {
      const next = albumCodePointAt(text, end) ?? '';
      if (next === '\n') break;
      const width = glyphWidth(next, sizePt);
      if (end > index && used + width > widthPt) break;
      used += width;
      end += 1;
      if (used >= widthPt && end === index + 1) break;
    }
    if (end === index) end = index + 1;
    lines.push({ start: index, end, widthPt: used, heightPt: lineHeightPt, ascentPt: sizePt * 0.8 });
    index = end;
  }
  return lines;
}

export function createGlyphWidthMeasurer(): AlbumTextMeasurer {
  return {
    kind: 'glyph-width-test-double',
    async measure(text, role, widthPt) {
      return wrapByGlyphWidth(text, widthPt, role.sizePt, role.lineHeightPt);
    },
  };
}

export function createNativeTextMeasurer(): AlbumTextMeasurer {
  return {
    kind: 'core-text',
    async measure(text, role, widthPt) {
      return measureTextNative(
        text,
        albumFontFace(role.family),
        role.sizePt,
        role.lineHeightPt,
        widthPt,
      ).map((line) => ({
        start: line.start,
        end: line.end,
        widthPt: line.widthPt,
        heightPt: line.heightPt || role.lineHeightPt,
        ascentPt: line.ascentPt ?? role.sizePt * 0.8,
      }));
    },
  };
}

/** Production measurer. Never falls back to the Jest glyph-width double. */
export function createAlbumTextMeasurer(): AlbumTextMeasurer {
  if (!albumLayoutNativeAvailable()) {
    throw new ApplicationError(ALBUM_LAYOUT_UNAVAILABLE, ALBUM_LAYOUT_UNAVAILABLE_COPY);
  }
  return createNativeTextMeasurer();
}

export function spaceForWrappedChunk(input: {
  remainingPt: number;
  lineHeightPt: number;
  continuedHeightPt: number;
}): { commit: boolean } {
  return { commit: input.remainingPt < input.continuedHeightPt + input.lineHeightPt };
}

export async function measurePlacedLines(
  measurer: AlbumTextMeasurer,
  text: string,
  role: AlbumFontRole,
  widthPt: number,
  origin: { xPt: number; yPt: number },
): Promise<{ heightPt: number; lines: AlbumTextLine[]; slice: string; range: { start: number; end: number } }> {
  const measured = await measurer.measure(text, role, widthPt);
  const lines: AlbumTextLine[] = [];
  let y = origin.yPt;
  for (const line of measured) {
    lines.push({
      start: line.start,
      end: line.end,
      xPt: origin.xPt,
      yPt: y,
      widthPt: line.widthPt,
      heightPt: line.heightPt,
      baselineYPt: y + line.ascentPt,
    });
    y += line.heightPt;
  }
  return {
    heightPt: y - origin.yPt,
    lines,
    slice: text,
    range: { start: 0, end: albumCodePointLength(text) },
  };
}

export const albumBodyRole = ALBUM_FONTS.body;
export const albumCoverRole = ALBUM_FONTS.coverName;
export const albumDateRole = ALBUM_FONTS.date;
export const albumMetaRole = ALBUM_FONTS.meta;
