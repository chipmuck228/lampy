import { appLanguage } from '../i18n';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  ALBUM_FONTS,
  ALBUM_LAYOUT_VERSION,
  albumFontFace,
} from './album-layout';
import type { AlbumLayoutInput } from './album-layout-input';

export type AlbumReadingStyle = 'plain' | 'handmade';
export const ALBUM_READING_STYLES = {
  plain: { paper: '#F8F5ED', photoBorder: '#E4DFD2', photoBorderWidth: 0 },
  handmade: { paper: '#F3ECDD', photoBorder: '#FFFFFF', photoBorderWidth: 6 },
} as const;
export function albumReadingFonts() {
  return Object.fromEntries(
    Object.entries(ALBUM_FONTS).map(([key, role]) => [
      key,
      {
        fontFamily: albumFontFace(role.family),
        fontSize: role.sizePt,
        lineHeight: role.lineHeightPt,
        color: role.color,
      },
    ]),
  ) as Record<
    keyof typeof ALBUM_FONTS,
    { fontFamily: string; fontSize: number; lineHeight: number; color: string }
  >;
}
export type AlbumReadingPosition = {
  version: 1;
  fingerprint: string;
  width: number;
  style: AlbumReadingStyle;
  y: number;
  anchor: string | null;
  within: number;
};
export function albumReadingFingerprint(input: AlbumLayoutInput): string {
  // Position validation includes full content/media metadata, not only collection time.
  return bytesToHex(
    sha256(
      utf8ToBytes(JSON.stringify([ALBUM_LAYOUT_VERSION, appLanguage, input])),
    ),
  );
}
export function captureAlbumReadingPosition(
  input: {
    fingerprint: string;
    width: number;
    style: AlbumReadingStyle;
    y: number;
  },
  anchors: Record<string, number>,
): AlbumReadingPosition {
  const y = Math.max(0, input.y);
  const closest = Object.entries(anchors)
    .filter(([, top]) => top <= y)
    .sort((a, b) => b[1] - a[1])[0];
  return {
    version: 1,
    ...input,
    y,
    anchor: closest?.[0] ?? null,
    within: closest ? y - closest[1] : 0,
  };
}
export function restoreAlbumReadingPosition(
  saved: AlbumReadingPosition | null,
  current: { fingerprint: string; width: number; style: AlbumReadingStyle },
  anchors: Record<string, number>,
): number {
  if (!saved) return 0;
  if (
    saved.fingerprint === current.fingerprint &&
    saved.width === current.width &&
    saved.style === current.style
  )
    return saved.y;
  // Changed text, media, width or decoration invalidates pixel offsets within a record.
  return saved.anchor && anchors[saved.anchor] != null
    ? anchors[saved.anchor]
    : 0;
}
