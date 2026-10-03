import {
  collectAlbumIdFromParam,
  lookbackParamsWithCollect,
  lookbackParamsWithoutCollect,
} from './lookback-origin';

describe('lookback collect params', () => {
  it('enters collect without dropping the trusted origin', () => {
    expect(lookbackParamsWithCollect({ o: 'lb-origin' }, 'album_1')).toEqual({
      o: 'lb-origin',
      collect: 'album_1',
    });
  });

  it('exits collect without clearing other trusted params', () => {
    expect(lookbackParamsWithoutCollect({ o: 'lb-origin', collect: 'album_1' })).toEqual({
      o: 'lb-origin',
    });
    expect(lookbackParamsWithoutCollect({ collect: 'album_1' })).toEqual({});
  });

  it('treats blank or illegal empty collect as no album', () => {
    expect(collectAlbumIdFromParam('')).toBeNull();
    expect(collectAlbumIdFromParam('   ')).toBeNull();
    expect(collectAlbumIdFromParam(['album_1'])).toBe('album_1');
  });
});
