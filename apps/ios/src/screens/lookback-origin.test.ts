import {
  finishLeaveToRecent,
  firstSearchParam,
  forgetLookbackOrigin,
  forgetLookbackYearOrigin,
  goToLookbackRootFromYear,
  goToRecentFromLookbackRoot,
  issueLookbackOrigin,
  issueLookbackYearOrigin,
  leaveHref,
  leaveOpenedFromLookback,
  lookbackOriginWasIssued,
  lookbackRootHrefFromRecent,
  lookbackYearHrefFromRoot,
  lookbackYearOriginWasIssued,
  previousRouteIsLookbackRoot,
  previousRouteIsRecent,
  resetLookbackOriginsForTests,
  shouldBackToLookbackRoot,
  shouldBackToRecent,
} from './lookback-origin';

const recentThenLookback = {
  index: 1,
  routes: [{ name: 'index' }, { name: 'lookback/index' }],
};

describe('lookback origin is bound to this push, not a URL guess', () => {
  beforeEach(() => {
    resetLookbackOriginsForTests();
  });

  it('issues a token only when Recent actually opens lookback', () => {
    const href = lookbackRootHrefFromRecent();
    expect(href).toMatch(/^\/lookback\?o=[^&]+$/);
    const token = firstSearchParam(href.slice('/lookback?o='.length));
    expect(lookbackOriginWasIssued(token)).toBe(true);
    expect(lookbackOriginWasIssued('stolen')).toBe(false);
    expect(lookbackOriginWasIssued(undefined)).toBe(false);
  });

  it('does not treat lampy://lookback?from=recent as opened from Recent', () => {
    expect(
      shouldBackToRecent({
        originToken: undefined,
        navigationState: recentThenLookback,
      }),
    ).toBe(false);
    expect(
      shouldBackToRecent({
        originToken: 'recent',
        navigationState: recentThenLookback,
      }),
    ).toBe(false);
    expect(lookbackOriginWasIssued('recent')).toBe(false);
  });

  it('does not treat lampy://lookback?o=invalid as opened from Recent', () => {
    expect(lookbackOriginWasIssued('invalid')).toBe(false);
    expect(
      shouldBackToRecent({
        originToken: 'invalid',
        navigationState: recentThenLookback,
      }),
    ).toBe(false);
  });

  it('backs only when the token was issued and the previous stack route is Recent', () => {
    const token = issueLookbackOrigin();
    expect(
      shouldBackToRecent({
        originToken: token,
        navigationState: recentThenLookback,
      }),
    ).toBe(true);
    expect(
      shouldBackToRecent({
        originToken: token,
        navigationState: { index: 0, routes: [{ name: 'lookback/index' }] },
      }),
    ).toBe(false);
    expect(
      shouldBackToRecent({
        originToken: token,
        navigationState: {
          index: 1,
          routes: [{ name: 'family' }, { name: 'lookback/index' }],
        },
      }),
    ).toBe(false);
    expect(previousRouteIsRecent(recentThenLookback)).toBe(true);
    expect(previousRouteIsRecent({ index: 0, routes: [{ name: 'index' }] })).toBe(false);
  });

  it('forgets this visit so the next lookback root cannot reuse it', () => {
    const token = issueLookbackOrigin();
    expect(lookbackOriginWasIssued(token)).toBe(true);
    forgetLookbackOrigin(token);
    expect(lookbackOriginWasIssued(token)).toBe(false);
    expect(
      shouldBackToRecent({
        originToken: token,
        navigationState: recentThenLookback,
      }),
    ).toBe(false);
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

  it('backs to lookback root only when the year token was issued and the previous route is lookback', () => {
    const lookbackThenYear = {
      index: 1,
      routes: [{ name: 'lookback/index' }, { name: 'lookback/[year]/index' }],
    };
    const href = lookbackYearHrefFromRoot(2026);
    expect(href).toMatch(/^\/lookback\/2026\?y=[^&]+$/);
    const token = firstSearchParam(href.slice('/lookback/2026?y='.length));
    expect(lookbackYearOriginWasIssued(token)).toBe(true);
    expect(
      shouldBackToLookbackRoot({
        originToken: token,
        navigationState: lookbackThenYear,
      }),
    ).toBe(true);
    expect(
      shouldBackToLookbackRoot({
        originToken: token,
        navigationState: { index: 0, routes: [{ name: 'lookback/[year]/index' }] },
      }),
    ).toBe(false);
    expect(
      shouldBackToLookbackRoot({
        originToken: 'stolen',
        navigationState: lookbackThenYear,
      }),
    ).toBe(false);
    expect(previousRouteIsLookbackRoot(lookbackThenYear)).toBe(true);
    expect(previousRouteIsLookbackRoot({ index: 0, routes: [{ name: 'lookback/index' }] })).toBe(
      false,
    );
  });

  it('lands on /lookback after a year page with no recorded previous page', () => {
    const fromRoot = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() };
    goToLookbackRootFromYear(fromRoot, true);
    expect(fromRoot.back).toHaveBeenCalledTimes(1);
    expect(fromRoot.dismissTo).not.toHaveBeenCalled();

    const coldMonthLink = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() };
    goToLookbackRootFromYear(coldMonthLink, false);
    expect(coldMonthLink.dismissTo).toHaveBeenCalledWith('/lookback');
    expect(coldMonthLink.back).not.toHaveBeenCalled();
    expect(coldMonthLink.push).not.toHaveBeenCalled();
  });

  it('forgets the year visit so a later deep link cannot reuse it', () => {
    const token = issueLookbackYearOrigin();
    expect(lookbackYearOriginWasIssued(token)).toBe(true);
    forgetLookbackYearOrigin(token);
    expect(lookbackYearOriginWasIssued(token)).toBe(false);
    expect(
      shouldBackToLookbackRoot({
        originToken: token,
        navigationState: {
          index: 1,
          routes: [{ name: 'lookback/index' }, { name: 'lookback/[year]/index' }],
        },
      }),
    ).toBe(false);
  });

  it('keeps Leave copy tied to the entry href', () => {
    expect(leaveHref('recent')).toBe('/leave?from=recent');
    expect(leaveHref('lookback')).toBe('/leave?from=lookback');
    expect(leaveOpenedFromLookback('lookback')).toBe(true);
    expect(leaveOpenedFromLookback('recent')).toBe(false);
    expect(leaveOpenedFromLookback(undefined)).toBe(false);
  });
});
