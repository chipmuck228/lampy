import {
  dismissToRootNav,
  ROOT_NAV_HREF,
  shouldIgnoreRootNavPress,
} from './root-nav-switch';

describe('root nav switch contract', () => {
  it('ignores a press on the current root', () => {
    expect(shouldIgnoreRootNavPress('recent', 'recent')).toBe(true);
    expect(shouldIgnoreRootNavPress('lookback', 'albums')).toBe(false);
    expect(shouldIgnoreRootNavPress('albums', 'albums')).toBe(true);
  });

  it('dismisses to the three root hrefs without guessing canGoBack', () => {
    const dismissTo = jest.fn();
    dismissToRootNav({ dismissTo }, 'recent');
    dismissToRootNav({ dismissTo }, 'lookback');
    dismissToRootNav({ dismissTo }, 'albums');
    expect(dismissTo.mock.calls).toEqual([
      [ROOT_NAV_HREF.recent],
      [ROOT_NAV_HREF.lookback],
      [ROOT_NAV_HREF.albums],
    ]);
  });
});
