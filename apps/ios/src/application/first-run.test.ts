import {
  decideFirstRunGuide,
  isFirstRunFinishAction,
  nextFirstRunIndex,
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

  it('restores a visible scene when motion is stopped mid-flight', () => {
    const opacity = { stopAnimation: jest.fn(), setValue: jest.fn() };
    const shift = { stopAnimation: jest.fn(), setValue: jest.fn() };
    settleFirstRunMotion({ opacity, shift });
    expect(opacity.stopAnimation).toHaveBeenCalled();
    expect(shift.stopAnimation).toHaveBeenCalled();
    expect(opacity.setValue).toHaveBeenCalledWith(1);
    expect(shift.setValue).toHaveBeenCalledWith(0);
  });

  it('uses this-round copy and does not claim cloud backup or sync', () => {
    const text = FIRST_RUN_SCREENS.map((screen) => `${screen.title}${screen.body}`).join('');
    expect(text).toContain('一句话，也值得留下。');
    expect(text).toContain('记录保存在这台设备');
    expect(text).not.toMatch(/云备份|同步|家庭已开放|已经可以分享给家人/);
    expect(FIRST_RUN_SCREENS.every((screen) => screen.source.includes('本轮新文案'))).toBe(true);
    expect(FIRST_RUN_SCREENS[2].id).toBe('keep');
    expect(FIRST_RUN_SCREENS[2].action).toBe('留下瞬间');
  });
});
