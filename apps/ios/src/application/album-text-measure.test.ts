import { ApplicationError } from './errors';
import { ALBUM_LAYOUT_UNAVAILABLE, createAlbumTextMeasurer, spaceForWrappedChunk } from './album-text-measure';

jest.mock('../../modules/lampy-album-layout', () => ({
  albumLayoutNativeAvailable: () => false,
  measureTextNative: () => {
    throw new Error('native should not run in this test');
  },
}));

describe('album production measurer', () => {
  it('refuses the glyph-width double when Core Text is missing', () => {
    expect(() => createAlbumTextMeasurer()).toThrow(ApplicationError);
    try {
      createAlbumTextMeasurer();
    } catch (error) {
      expect(error).toMatchObject({ code: ALBUM_LAYOUT_UNAVAILABLE, message: '排版能力尚不可用' });
    }
  });

  it('commits when a continued date would leave less than one body line', () => {
    expect(spaceForWrappedChunk({ remainingPt: 50, lineHeightPt: 32, continuedHeightPt: 22 }).commit).toBe(true);
    expect(spaceForWrappedChunk({ remainingPt: 54, lineHeightPt: 32, continuedHeightPt: 22 }).commit).toBe(false);
  });
});
