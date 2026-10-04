import {
  lookbackCollectIsReady,
  shouldApplyLookbackCollectLoad,
  shouldApplyLookbackCollectResult,
  shouldApplyLookbackCollectWrite,
} from './lookback-collect';

describe('lookback collect generation', () => {
  it('is ready only when the loaded album is the current target', () => {
    expect(lookbackCollectIsReady('album_b', 'album_a')).toBe(false);
    expect(lookbackCollectIsReady('album_b', null)).toBe(false);
    expect(lookbackCollectIsReady(null, 'album_b')).toBe(false);
    expect(lookbackCollectIsReady('album_b', 'album_b')).toBe(true);
  });

  it('drops a stale load after the target changes', () => {
    expect(
      shouldApplyLookbackCollectLoad({
        targetId: 'album_b',
        albumId: 'album_a',
        generation: 1,
        currentGeneration: 2,
      }),
    ).toBe(false);
    expect(
      shouldApplyLookbackCollectLoad({
        targetId: 'album_b',
        albumId: 'album_b',
        generation: 2,
        currentGeneration: 2,
      }),
    ).toBe(true);
  });

  it('lets refresh and write share the same request eligibility', () => {
    expect(
      shouldApplyLookbackCollectResult({
        targetId: 'album_1',
        requestAlbumId: 'album_1',
        generation: 2,
        currentGeneration: 3,
      }),
    ).toBe(false);
    expect(
      shouldApplyLookbackCollectResult({
        targetId: 'album_1',
        requestAlbumId: 'album_1',
        generation: 3,
        currentGeneration: 3,
      }),
    ).toBe(true);
    expect(
      shouldApplyLookbackCollectLoad({
        targetId: 'album_1',
        albumId: 'album_1',
        generation: 3,
        currentGeneration: 3,
      }),
    ).toBe(
      shouldApplyLookbackCollectResult({
        targetId: 'album_1',
        requestAlbumId: 'album_1',
        generation: 3,
        currentGeneration: 3,
      }),
    );
  });

  it('drops a late write unless it still matches the loaded target', () => {
    expect(
      shouldApplyLookbackCollectWrite({
        targetId: 'album_b',
        loadedId: 'album_b',
        requestAlbumId: 'album_a',
        generation: 1,
        currentGeneration: 2,
      }),
    ).toBe(false);
    expect(
      shouldApplyLookbackCollectWrite({
        targetId: 'album_b',
        loadedId: null,
        requestAlbumId: 'album_b',
        generation: 2,
        currentGeneration: 2,
      }),
    ).toBe(false);
    expect(
      shouldApplyLookbackCollectWrite({
        targetId: 'album_b',
        loadedId: 'album_b',
        requestAlbumId: 'album_b',
        generation: 2,
        currentGeneration: 2,
      }),
    ).toBe(true);
  });
});
