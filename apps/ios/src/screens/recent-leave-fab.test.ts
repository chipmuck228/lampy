import {
  createRecentLeaveFabScroll,
  recentFabIntent,
  recentFabMotion,
  RECENT_FAB_DOWN_SLOP,
  RECENT_FAB_HIDE_MS,
  RECENT_FAB_IDLE_MS,
  RECENT_FAB_SHOW_MS,
  RECENT_FAB_SHIFT_Y,
  RECENT_FAB_UP_SLOP,
} from './recent-leave-fab';

describe('recent leave fab scroll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts visible, hides only on a real downward read, and returns on the way back', () => {
    expect(RECENT_FAB_IDLE_MS).toBe(800);
    expect(RECENT_FAB_HIDE_MS).toBe(380);
    expect(RECENT_FAB_SHOW_MS).toBe(640);
    expect(RECENT_FAB_SHIFT_Y).toBe(10);
    expect(recentFabIntent(0, 0)).toBe('show');
    expect(recentFabIntent(6, 80)).toBe('show');
    expect(recentFabIntent(40, 20)).toBe('hide');
    expect(recentFabIntent(20, 40)).toBe('show');
    expect(recentFabIntent(28, 24)).toBe('idle');
    expect(recentFabIntent(24, 28)).toBe('idle');
  });

  it('follows visible → down → hidden → up / idle → visible', () => {
    const reveal = jest.fn();
    const fab = createRecentLeaveFabScroll(reveal);
    expect(reveal).not.toHaveBeenCalled();

    fab.onScroll(48);
    expect(reveal).toHaveBeenLastCalledWith(false);

    fab.onScroll(20);
    expect(reveal).toHaveBeenLastCalledWith(true);

    reveal.mockClear();
    fab.onScroll(80);
    expect(reveal).toHaveBeenLastCalledWith(false);
    jest.advanceTimersByTime(RECENT_FAB_IDLE_MS);
    expect(reveal).toHaveBeenLastCalledWith(true);

    fab.dispose();
  });

  it('does not hide on a slight move, and snaps without motion when asked', () => {
    const reveal = jest.fn();
    const fab = createRecentLeaveFabScroll(reveal);
    fab.onScroll(6);
    expect(reveal).toHaveBeenLastCalledWith(true);
    reveal.mockClear();
    fab.onScroll(10);
    expect(reveal).not.toHaveBeenCalled();
    fab.dispose();

    expect(recentFabMotion(true, false)).toEqual({ opacity: 1, translateY: 0, duration: RECENT_FAB_SHOW_MS });
    expect(recentFabMotion(false, false)).toEqual({
      opacity: 0,
      translateY: RECENT_FAB_SHIFT_Y,
      duration: RECENT_FAB_HIDE_MS,
    });
    expect(recentFabMotion(true, true)).toEqual({ opacity: 1, translateY: 0, duration: 0 });
    expect(recentFabMotion(false, true)).toEqual({ opacity: 0, translateY: RECENT_FAB_SHIFT_Y, duration: 0 });
  });

  it('ignores a small reverse twitch after a downward read, then returns only on a clear upward look', () => {
    const downFrom = 20;
    const hiddenAt = downFrom + RECENT_FAB_DOWN_SLOP + 16;
    const twitchAt = hiddenAt - (RECENT_FAB_UP_SLOP - 2);
    const downAgainAt = twitchAt + RECENT_FAB_DOWN_SLOP + 8;
    const upAt = downAgainAt - (RECENT_FAB_UP_SLOP + 10);

    expect(recentFabIntent(hiddenAt, downFrom)).toBe('hide');
    expect(recentFabIntent(twitchAt, hiddenAt)).toBe('idle');
    expect(recentFabIntent(downAgainAt, twitchAt)).toBe('hide');
    expect(recentFabIntent(upAt, downAgainAt)).toBe('show');

    const reveal = jest.fn();
    const fab = createRecentLeaveFabScroll(reveal);

    fab.onScroll(hiddenAt);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenLastCalledWith(false);

    fab.onScroll(twitchAt);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenLastCalledWith(false);

    fab.onScroll(downAgainAt);
    expect(reveal).toHaveBeenNthCalledWith(2, false);
    expect(reveal).not.toHaveBeenCalledWith(true);

    fab.onScroll(upAt);
    expect(reveal).toHaveBeenLastCalledWith(true);

    fab.dispose();
  });
});
