import {
  decideFirstRunGuide,
  firstRunInnerCanScroll,
  firstRunPageAfterInnerSwipe,
  firstRunPageFromOffset,
  isFirstRunFinishAction,
  nextFirstRunIndex,
  prevFirstRunIndex,
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
    expect(text).toContain('留下瞬间');
    expect(text).not.toMatch(/云备份|同步|家庭已开放|已经可以分享给家人|不必翻找|进入 Lampy|自己的生活记录/);
    expect(FIRST_RUN_SCREENS.every((screen) => screen.source.includes('本轮定稿'))).toBe(true);
    expect(FIRST_RUN_SCREENS[2].id).toBe('keep');
    expect(FIRST_RUN_SCREENS[2].action).toBe('留下瞬间');
    expect(FIRST_RUN_SCREENS[0].action).toBe('继续');
  });
});
