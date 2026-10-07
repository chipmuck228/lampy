import {
  albumCoverTileHeight,
  albumCoverTileWidth,
  albumCoverWallColumns,
  albumCoverWallLayout,
  ALBUM_COVER_WALL_MAX_TILE,
  ALBUM_COVER_WALL_MIN_TILE,
} from './album-cover-wall';

describe('album cover wall layout', () => {
  it('uses one column when two tiles cannot fit', () => {
    expect(albumCoverWallColumns(200)).toBe(1);
    expect(albumCoverWallColumns(320)).toBe(2);
  });

  it('caps columns and tile width on wide reading surfaces', () => {
    expect(albumCoverWallColumns(1200)).toBe(4);
    expect(albumCoverTileWidth(1200, 4)).toBeLessThanOrEqual(ALBUM_COVER_WALL_MAX_TILE);
    expect(albumCoverTileHeight(albumCoverTileWidth(360, 2))).toBeGreaterThan(albumCoverTileWidth(360, 2));
  });

  it('uses measured content width, not window width, for a narrow body', () => {
    // Wide window but narrow reading column (rail / iPad).
    const body = 300;
    const layout = albumCoverWallLayout(body);
    expect(layout.measured).toBe(true);
    expect(layout.columns).toBe(1);
    expect(layout.tileWidth).toBeLessThanOrEqual(body);
    expect(albumCoverWallColumns(1024)).toBeGreaterThan(layout.columns);
  });

  it('keeps one column in a narrow collect sheet wall', () => {
    const layout = albumCoverWallLayout(260);
    expect(layout.columns).toBe(1);
    expect(layout.tileWidth).toBeLessThanOrEqual(260);
  });

  it('starts with a safe single column before measure', () => {
    const layout = albumCoverWallLayout(null);
    expect(layout.measured).toBe(false);
    expect(layout.columns).toBe(1);
    expect(layout.tileWidth).toBe(ALBUM_COVER_WALL_MIN_TILE);
  });

  it('recomputes columns when the container width changes', () => {
    expect(albumCoverWallLayout(280).columns).toBe(1);
    expect(albumCoverWallLayout(360).columns).toBe(2);
    expect(albumCoverWallLayout(700).columns).toBeGreaterThanOrEqual(2);
  });

  it('does not treat an already-padded width as needing another gutter pass', () => {
    // onLayout width is content box; layout must use it directly.
    const content = 348;
    const layout = albumCoverWallLayout(content);
    expect(layout.contentWidth).toBe(content);
    expect(layout.tileWidth * layout.columns + 12 * (layout.columns - 1)).toBeLessThanOrEqual(content + 0.5);
  });
});
