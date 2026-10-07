export const ALBUM_COVER_WALL_GAP = 12;
export const ALBUM_COVER_WALL_MIN_TILE = 148;
export const ALBUM_COVER_WALL_MAX_TILE = 200;
export const ALBUM_COVER_WALL_MAX_COLS = 4;
/** Portrait paper ratio close to album A5 preview. */
export const ALBUM_COVER_WALL_ASPECT = 4 / 3;

export function albumCoverWallColumns(contentWidth: number): number {
  if (!(contentWidth > 0)) return 1;
  if (contentWidth < ALBUM_COVER_WALL_MIN_TILE * 2 + ALBUM_COVER_WALL_GAP) return 1;
  const raw = Math.floor((contentWidth + ALBUM_COVER_WALL_GAP) / (ALBUM_COVER_WALL_MIN_TILE + ALBUM_COVER_WALL_GAP));
  return Math.max(1, Math.min(ALBUM_COVER_WALL_MAX_COLS, raw));
}

export function albumCoverTileWidth(contentWidth: number, columns: number): number {
  const cols = Math.max(1, columns);
  const gaps = ALBUM_COVER_WALL_GAP * (cols - 1);
  const raw = (Math.max(0, contentWidth) - gaps) / cols;
  return Math.min(ALBUM_COVER_WALL_MAX_TILE, Math.max(1, raw));
}

export function albumCoverTileHeight(tileWidth: number): number {
  return Math.round(tileWidth * ALBUM_COVER_WALL_ASPECT);
}
