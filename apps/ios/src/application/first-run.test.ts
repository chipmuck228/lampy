import {
  decideFirstRunGuide,
  firstRunBodyLines,
  firstRunCanStartEnterMotion,
  firstRunCopyAllowsInnerScroll,
  firstRunCopyColumnWidth,
  firstRunEnterIsCurrent,
  firstRunInnerCanScroll,
  firstRunMotionPrefFromQuery,
  firstRunPagerIsSettled,
  firstRunProgressLabel,
  firstRunPageAfterInnerSwipe,
  firstRunPageFromOffset,
  firstRunPagerOffset,
  firstRunNeedsStartupHandoff,
  firstRunShouldAnimatePage,
  firstRunShouldInvalidateCopyMeasures,
  firstRunShouldPlayEnter,
  firstRunShouldRequestOverlayExit,
  firstRunStartupCovering,
  invalidateFirstRunCopyMeasures,
  isFirstRunFinishAction,
  nextFirstRunIndex,
  prevFirstRunIndex,
  rememberFirstRunCopyMeasure,
  settleFirstRunMotion,
  FIRST_RUN_LAST_INDEX,
  FIRST_RUN_SCREENS,
} from './first-run';

describe('first-run guide decision', () => {
  it('shows the guide only for an empty library that has not finished', () => {
    expect(decideFirstRunGuide({ completed: false, hasPersonalRecords: false, recordsUnknown: false })).toEqual({
      showGuide: true,
      reason: 'needed',
    });
  });

  it('does not mark complete when the user leaves mid-guide', () => {
    expect(isFirstRunFinishAction(0)).toBe(false);
    expect(isFirstRunFinishAction(1)).toBe(false);
    expect(isFirstRunFinishAction(FIRST_RUN_LAST_INDEX)).toBe(true);
    expect(nextFirstRunIndex(0)).toBe(1);
    expect(prevFirstRunIndex(1)).toBe(0);
    expect(prevFirstRunIndex(0)).toBe(0);
  });

  it('skips the guide when records already exist so an upgrade cannot lose the path in', () => {
    expect(decideFirstRunGuide({ completed: false, hasPersonalRecords: true, recordsUnknown: false }).showGuide).toBe(
      false,
    );
  });

  it('skips the guide when the personal library cannot be read', () => {
    expect(decideFirstRunGuide({ completed: false, hasPersonalRecords: false, recordsUnknown: true }).showGuide).toBe(
      false,
    );
  });

  it('does not show again after the last step is recorded', () => {
    expect(decideFirstRunGuide({ completed: true, hasPersonalRecords: false, recordsUnknown: false }).showGuide).toBe(
      false,
    );
  });

  it('pages from a swipe only after the inner copy has nowhere left to scroll', () => {
    expect(firstRunPageFromOffset(640, 320, 3)).toBe(2);
    expect(firstRunInnerCanScroll(400, 400)).toBe(false);
    expect(firstRunInnerCanScroll(520, 400)).toBe(true);
    expect(
      firstRunPageAfterInnerSwipe({
        canScroll: true,
        offsetY: 120,
        viewHeight: 400,
        contentHeight: 520,
        velocityY: 0.8,
        index: 0,
      }),
    ).toBe(1);
    expect(
      firstRunPageAfterInnerSwipe({
        canScroll: true,
        offsetY: 40,
        viewHeight: 400,
        contentHeight: 520,
        velocityY: 0.8,
        index: 0,
      }),
    ).toBeNull();
    expect(
      firstRunPageAfterInnerSwipe({
        canScroll: false,
        offsetY: 0,
        viewHeight: 400,
        contentHeight: 400,
        velocityY: 0.8,
        index: 0,
      }),
    ).toBeNull();
    expect(
      firstRunPageAfterInnerSwipe({
        canScroll: true,
        offsetY: 120,
        viewHeight: 400,
        contentHeight: 520,
        velocityY: 0.8,
        index: FIRST_RUN_LAST_INDEX,
      }),
    ).toBeNull();
  });

  it('keeps copy scroll eligibility by screen after paging and does not treat unknown as short', () => {
    expect(firstRunInnerCanScroll(0, 0)).toBe(false);
    expect(firstRunCopyAllowsInnerScroll(undefined)).toBe(true);
    expect(firstRunCopyAllowsInnerScroll({ viewH: 0, contentH: 0 })).toBe(true);

    let measures = rememberFirstRunCopyMeasure({}, 'leave', { viewH: 200, contentH: 480 });
    measures = rememberFirstRunCopyMeasure(measures, 'lookback', { viewH: 200, contentH: 360 });
    expect(firstRunCopyAllowsInnerScroll(measures.leave)).toBe(true);
    expect(
      firstRunPageAfterInnerSwipe({
        canScroll: firstRunCopyAllowsInnerScroll(measures.leave),
        offsetY: 40,
        viewHeight: 200,
        contentHeight: 480,
        velocityY: 0.8,
        index: 0,
      }),
    ).toBeNull();

    expect(firstRunCopyAllowsInnerScroll(measures.lookback)).toBe(true);
    expect(
      firstRunPageAfterInnerSwipe({
        canScroll: firstRunCopyAllowsInnerScroll(measures.lookback),
        offsetY: 20,
        viewHeight: 200,
        contentHeight: 360,
        velocityY: 0.8,
        index: 1,
      }),
    ).toBeNull();
    expect(
      firstRunPageAfterInnerSwipe({
        canScroll: firstRunCopyAllowsInnerScroll(measures.lookback),
        offsetY: 160,
        viewHeight: 200,
        contentHeight: 360,
        velocityY: 0.8,
        index: 1,
      }),
    ).toBe(2);

    expect(firstRunShouldInvalidateCopyMeasures({ width: 0, height: 0 }, { width: 390, height: 600 })).toBe(false);
    expect(firstRunShouldInvalidateCopyMeasures({ width: 390, height: 600 }, { width: 758, height: 280 })).toBe(true);
    expect(firstRunCopyAllowsInnerScroll(invalidateFirstRunCopyMeasures().leave)).toBe(true);
    expect(firstRunPagerOffset(1, 280)).toBe(280);
  });

  it('keeps copy narrower than the photo and lets a long title wrap instead of shrinking', () => {
    expect(firstRunCopyColumnWidth(342, 390, 844)).toBe(Math.round(342 * 0.82));
    expect(firstRunCopyColumnWidth(342, 390, 844)).toBeLessThan(342);
    expect(firstRunCopyColumnWidth(520, 1024, 1366)).toBe(Math.round(520 * 0.72));
    expect(firstRunCopyColumnWidth(342, 375, 480)).toBe(Math.round(342 * 0.9));
    expect(firstRunCanStartEnterMotion('pending')).toBe(false);
    expect(firstRunCanStartEnterMotion('loaded')).toBe(true);
    expect(firstRunCanStartEnterMotion('failed')).toBe(true);
  });

  it('starts page motion only while the app is active and Reduce Motion is off', () => {
    expect(firstRunShouldAnimatePage(true, 'active')).toBe(false);
    expect(firstRunShouldAnimatePage(false, 'background')).toBe(false);
    expect(firstRunShouldAnimatePage(false, 'inactive')).toBe(false);
    expect(firstRunShouldAnimatePage(false, 'active')).toBe(true);
  });

  it('keeps Reduce Motion pending separate from on, off, and query failure', () => {
    expect(firstRunMotionPrefFromQuery(true)).toBe('on');
    expect(firstRunMotionPrefFromQuery(false)).toBe('off');
    expect(
      firstRunShouldPlayEnter({
        pref: 'pending',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
      }),
    ).toBe('wait');
    expect(
      firstRunShouldPlayEnter({
        pref: 'on',
        appState: 'active',
        settled: false,
        photoReady: 'pending',
        fontsReady: 'ready',
      }),
    ).toBe('show');
    expect(
      firstRunShouldPlayEnter({
        pref: 'failed',
        appState: 'active',
        settled: false,
        photoReady: 'pending',
        fontsReady: 'failed',
      }),
    ).toBe('show');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: false,
        photoReady: 'loaded',
        fontsReady: 'ready',
      }),
    ).toBe('wait');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
      }),
    ).toBe('fade');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'background',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
      }),
    ).toBe('wait');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'failed',
        fontsReady: 'ready',
      }),
    ).toBe('fade');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
        alreadySolid: true,
      }),
    ).toBe('show');
    expect(firstRunPagerIsSettled(0, 600, 0)).toBe(true);
    expect(firstRunPagerIsSettled(300, 600, 1)).toBe(false);
    expect(firstRunPagerIsSettled(600, 600, 1)).toBe(true);
    expect(firstRunPagerIsSettled(0, 0, 0)).toBe(false);
    expect(firstRunEnterIsCurrent(2, 3)).toBe(false);
    expect(firstRunEnterIsCurrent(3, 3)).toBe(true);
    expect(
      firstRunShouldPlayEnter({
        pref: 'on',
        appState: 'active',
        settled: true,
        photoReady: 'failed',
        fontsReady: 'failed',
      }),
    ).toBe('show');
    expect(
      firstRunShouldPlayEnter({
        pref: 'failed',
        appState: 'active',
        settled: true,
        photoReady: 'pending',
        fontsReady: 'ready',
      }),
    ).toBe('show');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'pending',
        fontsReady: 'ready',
      }),
    ).toBe('wait');
    expect(firstRunNeedsStartupHandoff(0)).toBe(true);
    expect(firstRunNeedsStartupHandoff(1)).toBe(false);
    expect(firstRunStartupCovering('covering', false)).toBe(true);
    expect(firstRunStartupCovering('exiting', false)).toBe(true);
    expect(firstRunStartupCovering('exited', true)).toBe(true);
    expect(firstRunStartupCovering('failed', false)).toBe(false);
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
        overlay: 'covering',
      }),
    ).toBe('wait');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
        overlay: 'exited',
      }),
    ).toBe('fade');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
        overlay: 'failed',
      }),
    ).toBe('show');
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
        overlay: 'exited',
        brandCovering: true,
      }),
    ).toBe('wait');
    expect(
      firstRunShouldPlayEnter({
        pref: 'on',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
        overlay: 'covering',
      }),
    ).toBe('show');
    expect(
      firstRunShouldPlayEnter({
        pref: 'failed',
        appState: 'active',
        settled: true,
        photoReady: 'pending',
        fontsReady: 'ready',
        overlay: 'covering',
      }),
    ).toBe('show');
    expect(
      firstRunShouldRequestOverlayExit({
        index: 0,
        pref: 'off',
        fontsReady: 'ready',
        photoReady: 'loaded',
        settled: true,
        overlay: 'covering',
      }),
    ).toBe(true);
    expect(
      firstRunShouldRequestOverlayExit({
        index: 0,
        pref: 'off',
        fontsReady: 'ready',
        photoReady: 'loaded',
        settled: true,
        overlay: 'exiting',
      }),
    ).toBe(false);
    expect(
      firstRunShouldRequestOverlayExit({
        index: 1,
        pref: 'off',
        fontsReady: 'ready',
        photoReady: 'loaded',
        settled: true,
        overlay: 'covering',
      }),
    ).toBe(false);
    expect(
      firstRunShouldRequestOverlayExit({
        index: 0,
        pref: 'on',
        fontsReady: 'ready',
        photoReady: 'pending',
        settled: false,
        overlay: 'covering',
      }),
    ).toBe(true);
    expect(
      firstRunShouldRequestOverlayExit({
        index: 0,
        pref: 'off',
        fontsReady: 'ready',
        photoReady: 'loaded',
        settled: true,
        overlay: 'failed',
      }),
    ).toBe(false);
    expect(
      firstRunShouldPlayEnter({
        pref: 'off',
        appState: 'active',
        settled: true,
        photoReady: 'loaded',
        fontsReady: 'ready',
        overlay: 'exited',
        alreadySolid: true,
      }),
    ).toBe('show');
    expect(firstRunEnterIsCurrent(4, 5)).toBe(false);
  });

  it('restores a visible scene when motion is stopped mid-flight', () => {
    const opacity = { stopAnimation: jest.fn(), setValue: jest.fn() };
    const shift = { stopAnimation: jest.fn(), setValue: jest.fn() };
    const photoOpacity = { stopAnimation: jest.fn(), setValue: jest.fn() };
    settleFirstRunMotion({ opacity, shift, photoOpacity });
    expect(opacity.stopAnimation).toHaveBeenCalled();
    expect(shift.stopAnimation).toHaveBeenCalled();
    expect(photoOpacity.stopAnimation).toHaveBeenCalled();
    expect(opacity.setValue).toHaveBeenCalledWith(1);
    expect(shift.setValue).toHaveBeenCalledWith(0);
    expect(photoOpacity.setValue).toHaveBeenCalledWith(1);
  });

  it('uses this-round copy and does not claim cloud backup, enter, or leftover prototype lines', () => {
    const text = FIRST_RUN_SCREENS.map((screen) => `${screen.title}${screen.body}${screen.photoNote}${screen.action}`).join('');
    expect(text).toContain('日子，不必特别才值得留下。');
    expect(text).toContain('轻轻扫过，也能看见日子的样子。');
    expect(text).toContain('从一个日子，继续读起。');
    expect(text).toContain('一杯咖啡，一段午后。');
    expect(text).not.toContain('一段咖啡，一段午后。');
    expect(text).toContain('留下瞬间');
    expect(FIRST_RUN_SCREENS[0].titleLines.join('')).toBe(FIRST_RUN_SCREENS[0].title);
    expect(firstRunProgressLabel(0, 3)).toBe('第 1 屏，共 3 屏');
    expect(firstRunBodyLines('不必写成故事。把这一刻，轻轻留给自己。')).toEqual([
      '不必写成故事。',
      '把这一刻，轻轻留给自己。',
    ]);
    expect(text).not.toMatch(/云备份|同步|家庭已开放|已经可以分享给家人|不必翻找|进入 Lampy|自己的生活记录/);
    expect(FIRST_RUN_SCREENS.every((screen) => screen.source.includes('本轮定稿'))).toBe(true);
    expect(FIRST_RUN_SCREENS[2].id).toBe('keep');
    expect(FIRST_RUN_SCREENS[2].action).toBe('留下瞬间');
    expect(FIRST_RUN_SCREENS[0].action).toBe('继续');
  });
});
