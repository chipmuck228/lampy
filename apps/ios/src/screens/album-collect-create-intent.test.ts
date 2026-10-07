import {
  albumCollectCreateHref,
  albumCollectCreateIntentWasIssued,
  consumeAlbumCollectCreateIntent,
  finishCollectCreateToMoment,
  forgetAlbumCollectCreateIntent,
  peekAlbumCollectCreateMomentId,
  resetAlbumCollectCreateIntentsForTests,
  shouldReturnToMomentAfterCollectCreate,
} from './album-collect-create-intent';

describe('album collect-create intent', () => {
  beforeEach(() => {
    resetAlbumCollectCreateIntentsForTests();
  });

  it('issues a href that carries the exact momentId', () => {
    const href = albumCollectCreateHref('moment_ready');
    expect(href.pathname).toBe('/albums/new');
    expect(href.params.m).toBe('moment_ready');
    expect(href.params.c).toMatch(/^ac/);
    expect(peekAlbumCollectCreateMomentId(href.params.c, href.params.m)).toBe('moment_ready');
  });

  it('rejects forged or mismatched moment params', () => {
    const href = albumCollectCreateHref('moment_ready');
    expect(peekAlbumCollectCreateMomentId(href.params.c, 'moment_other')).toBeNull();
    expect(peekAlbumCollectCreateMomentId('forged', 'moment_ready')).toBeNull();
    expect(peekAlbumCollectCreateMomentId(undefined, 'moment_ready')).toBeNull();
  });

  it('does not treat list create (no params) as a collect action', () => {
    expect(peekAlbumCollectCreateMomentId(undefined, undefined)).toBeNull();
    expect(albumCollectCreateIntentWasIssued(undefined)).toBe(false);
  });

  it('forgets on cancel and consumes once on finish', () => {
    const href = albumCollectCreateHref('moment_ready');
    forgetAlbumCollectCreateIntent(href.params.c);
    expect(albumCollectCreateIntentWasIssued(href.params.c)).toBe(false);

    const again = albumCollectCreateHref('moment_ready');
    expect(consumeAlbumCollectCreateIntent(again.params.c)).toEqual({
      momentId: 'moment_ready',
    });
    expect(consumeAlbumCollectCreateIntent(again.params.c)).toBeNull();
  });

  it('returns to moment only with issued intent and matching prior route', () => {
    const href = albumCollectCreateHref('moment_ready');
    const state = {
      index: 1,
      routes: [
        { name: 'moment/[id]', params: { id: 'moment_ready' } },
        { name: 'albums/new' },
      ],
    };
    expect(
      shouldReturnToMomentAfterCollectCreate({
        intentToken: href.params.c,
        momentId: 'moment_ready',
        navigationState: state,
      }),
    ).toBe(true);
    expect(
      shouldReturnToMomentAfterCollectCreate({
        intentToken: href.params.c,
        momentId: 'moment_ready',
        navigationState: { index: 0, routes: [{ name: 'albums/new' }] },
      }),
    ).toBe(false);
    expect(
      shouldReturnToMomentAfterCollectCreate({
        intentToken: 'forged',
        momentId: 'moment_ready',
        navigationState: state,
      }),
    ).toBe(false);
  });

  it('falls back to dismissTo when the prior route is not the moment', () => {
    const back = jest.fn();
    const dismissTo = jest.fn();
    finishCollectCreateToMoment(
      { back, dismissTo },
      { openedFromMoment: false, momentId: 'moment_ready' },
    );
    expect(back).not.toHaveBeenCalled();
    expect(dismissTo).toHaveBeenCalledWith('/moment/moment_ready');
    finishCollectCreateToMoment(
      { back, dismissTo },
      { openedFromMoment: true, momentId: 'moment_ready' },
    );
    expect(back).toHaveBeenCalled();
  });
});
