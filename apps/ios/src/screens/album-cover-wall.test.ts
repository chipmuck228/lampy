import {
  albumCoverTileHeight,
  albumCoverTileWidth,
  albumCoverWallColumns,
  ALBUM_COVER_WALL_MAX_TILE,
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
});
