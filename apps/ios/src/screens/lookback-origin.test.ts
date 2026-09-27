import {
  finishLeaveToRecent,
  goToRecentFromLookbackRoot,
  leaveHref,
  leaveOpenedFromLookback,
  lookbackOpenedFromRecent,
  lookbackRootHref,
} from './lookback-origin';

describe('lookback origin is bound to the route, not a process flag', () => {
  it('treats only this lookback href as opened from Recent', () => {
    expect(lookbackRootHref(true)).toBe('/lookback?from=recent');
    expect(lookbackRootHref(false)).toBe('/lookback');
    expect(lookbackOpenedFromRecent('recent')).toBe(true);
    expect(lookbackOpenedFromRecent(['recent'])).toBe(true);
    expect(lookbackOpenedFromRecent(undefined)).toBe(false);
    expect(lookbackOpenedFromRecent('family')).toBe(false);
  });

  it('does not leak a previous visit into the next lookback root', () => {
    expect(lookbackOpenedFromRecent('recent')).toBe(true);
    expect(lookbackOpenedFromRecent(undefined)).toBe(false);
    expect(lookbackOpenedFromRecent(undefined)).toBe(false);
  });

  it('goes back only when this instance was opened from Recent', () => {
    const fromRecent = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() };
    goToRecentFromLookbackRoot(fromRecent, true);
    expect(fromRecent.back).toHaveBeenCalledTimes(1);
    expect(fromRecent.dismissTo).not.toHaveBeenCalled();
    expect(fromRecent.push).not.toHaveBeenCalled();

    const deepLink = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() };
    goToRecentFromLookbackRoot(deepLink, false);
    expect(deepLink.dismissTo).toHaveBeenCalledWith('/');
    expect(deepLink.back).not.toHaveBeenCalled();
    expect(deepLink.push).not.toHaveBeenCalled();
  });

  it('never pushes a second Recent after save', () => {
    const router = { dismissTo: jest.fn(), replace: jest.fn(), push: jest.fn() };
    finishLeaveToRecent(router);
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps Leave copy tied to the entry href', () => {
    expect(leaveHref('recent')).toBe('/leave?from=recent');
    expect(leaveHref('lookback')).toBe('/leave?from=lookback');
    expect(leaveOpenedFromLookback('lookback')).toBe(true);
    expect(leaveOpenedFromLookback('recent')).toBe(false);
    expect(leaveOpenedFromLookback(undefined)).toBe(false);
  });
});
