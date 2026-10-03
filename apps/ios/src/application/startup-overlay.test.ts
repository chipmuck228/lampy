import * as SplashScreen from 'expo-splash-screen';

import {
  STARTUP_OVERLAY_FAILSAFE_MS,
  STARTUP_OVERLAY_MAX_ATTEMPTS,
  ensureStartupOverlayFailsafe,
  isStartupBrandCovering,
  requestStartupOverlayExit,
  resetStartupOverlayForTests,
  setStartupBrandCovering,
  setStartupOverlayHideForTests,
  setStartupOverlayPaintForTests,
  setStartupOverlayTimeoutsForTests,
  startupOverlayGeneration,
  startupOverlayIsCurrent,
  startupOverlayState,
  subscribeStartupBrandCovering,
  subscribeStartupOverlay,
} from './startup-overlay';

describe('startup overlay exit', () => {
  beforeEach(() => {
    resetStartupOverlayForTests();
    setStartupOverlayPaintForTests((cb) => cb());
  });

  afterEach(() => {
    resetStartupOverlayForTests();
  });

  it('hides once, waits for the next paint, then marks exited', async () => {
    const order: string[] = [];
    let finishHide: () => void = () => undefined;
    setStartupOverlayHideForTests(
      () =>
        new Promise((resolve) => {
          order.push('hide-start');
          finishHide = () => {
            order.push('hide-done');
            resolve();
          };
        }),
    );
    setStartupOverlayPaintForTests((cb) => {
      order.push('paint');
      cb();
    });
    const seen: string[] = [];
    const off = subscribeStartupOverlay((next) => seen.push(next));
    const first = requestStartupOverlayExit();
    const second = requestStartupOverlayExit();
    expect(startupOverlayState()).toBe('exiting');
    expect(seen).toEqual(['exiting']);
    finishHide();
    await expect(first).resolves.toBe('exited');
    await expect(second).resolves.toBe('exited');
    expect(order).toEqual(['hide-start', 'hide-done', 'paint']);
    expect(startupOverlayState()).toBe('exited');
    expect(seen).toEqual(['exiting', 'exited']);
    await expect(requestStartupOverlayExit()).resolves.toBe('exited');
    expect(order).toEqual(['hide-start', 'hide-done', 'paint']);
    off();
  });

  it('uses the shared hide path for the failsafe and does not start a second hide', async () => {
    const hide = jest.fn(async () => undefined);
    setStartupOverlayHideForTests(hide);
    setStartupOverlayTimeoutsForTests({ failsafe: 40, hide: 200 });
    const stop = ensureStartupOverlayFailsafe();
    await requestStartupOverlayExit();
    expect(hide).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hide).toHaveBeenCalledTimes(1);
    expect(startupOverlayState()).toBe('exited');
    stop();
  });

  it('retries once after the first hide fails, then stays exited', async () => {
    const hide = jest.fn()
      .mockRejectedValueOnce(new Error('hide failed'))
      .mockResolvedValueOnce(undefined);
    setStartupOverlayHideForTests(hide);
    await expect(requestStartupOverlayExit()).resolves.toBe('exited');
    expect(hide).toHaveBeenCalledTimes(2);
    expect(startupOverlayState()).toBe('exited');
    await expect(requestStartupOverlayExit()).resolves.toBe('exited');
    expect(hide).toHaveBeenCalledTimes(2);
  });

  it('marks failed only after the limited retry also fails', async () => {
    const hide = jest.fn(async () => {
      throw new Error('hide failed');
    });
    setStartupOverlayHideForTests(hide);
    await expect(requestStartupOverlayExit()).resolves.toBe('failed');
    expect(hide).toHaveBeenCalledTimes(STARTUP_OVERLAY_MAX_ATTEMPTS);
    expect(startupOverlayState()).toBe('failed');
    await expect(requestStartupOverlayExit()).resolves.toBe('failed');
    expect(hide).toHaveBeenCalledTimes(STARTUP_OVERLAY_MAX_ATTEMPTS);
  });

  it('marks failed when both hide attempts time out', async () => {
    const hide = jest.fn(() => new Promise<void>(() => undefined));
    setStartupOverlayTimeoutsForTests({ hide: 20 });
    setStartupOverlayHideForTests(hide);
    await expect(requestStartupOverlayExit()).resolves.toBe('failed');
    expect(hide).toHaveBeenCalledTimes(STARTUP_OVERLAY_MAX_ATTEMPTS);
    expect(startupOverlayState()).toBe('failed');
  });

  it('does not let a hung first hide complete after a newer attempt has started', async () => {
    const resolvers: (() => void)[] = [];
    const hide = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    setStartupOverlayTimeoutsForTests({ hide: 20 });
    setStartupOverlayHideForTests(hide);
    const pending = requestStartupOverlayExit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hide).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(hide).toHaveBeenCalledTimes(2);
    expect(startupOverlayState()).toBe('exiting');
    resolvers[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startupOverlayState()).toBe('exiting');
    resolvers[1]?.();
    await expect(pending).resolves.toBe('exited');
    expect(startupOverlayState()).toBe('exited');
  });

  it('ignores a late hide after both attempts have already failed', async () => {
    const resolvers: (() => void)[] = [];
    setStartupOverlayTimeoutsForTests({ hide: 20 });
    setStartupOverlayHideForTests(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    await expect(requestStartupOverlayExit()).resolves.toBe('failed');
    expect(startupOverlayState()).toBe('failed');
    resolvers[0]?.();
    resolvers[1]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startupOverlayState()).toBe('failed');
    await expect(requestStartupOverlayExit()).resolves.toBe('failed');
  });

  it('lets the failsafe request hide when nobody else has', async () => {
    const hide = jest.fn(async () => undefined);
    setStartupOverlayHideForTests(hide);
    setStartupOverlayTimeoutsForTests({ failsafe: 20, hide: 200 });
    const stop = ensureStartupOverlayFailsafe();
    expect(hide).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(hide).toHaveBeenCalledTimes(1);
    expect(startupOverlayState()).toBe('exited');
    stop();
  });

  it('drops a late hide after reset so a stale generation cannot restart exit', async () => {
    let finishHide: () => void = () => undefined;
    setStartupOverlayHideForTests(
      () =>
        new Promise((resolve) => {
          finishHide = resolve;
        }),
    );
    const startedGen = startupOverlayGeneration();
    const pending = requestStartupOverlayExit();
    expect(startupOverlayIsCurrent(startedGen + 1, startupOverlayGeneration())).toBe(true);
    resetStartupOverlayForTests();
    finishHide();
    await pending;
    expect(startupOverlayState()).toBe('covering');
  });

  it('tracks an actually mounted brand layer without inventing one', () => {
    expect(isStartupBrandCovering()).toBe(false);
    const seen: boolean[] = [];
    const off = subscribeStartupBrandCovering((covering) => seen.push(covering));
    setStartupBrandCovering(true);
    expect(isStartupBrandCovering()).toBe(true);
    setStartupBrandCovering(false);
    expect(isStartupBrandCovering()).toBe(false);
    expect(seen).toEqual([true, false]);
    off();
  });

  it('keeps the existing four-second failsafe budget', () => {
    expect(STARTUP_OVERLAY_FAILSAFE_MS).toBe(4000);
    expect(jest.isMockFunction(SplashScreen.hideAsync)).toBe(true);
  });

  it('lets a later request join the same in-flight hide instead of starting another', async () => {
    let finishHide: () => void = () => undefined;
    const hide = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishHide = resolve;
        }),
    );
    setStartupOverlayHideForTests(hide);
    const first = requestStartupOverlayExit();
    const second = requestStartupOverlayExit();
    expect(hide).toHaveBeenCalledTimes(1);
    finishHide();
    await expect(Promise.all([first, second])).resolves.toEqual(['exited', 'exited']);
    await expect(requestStartupOverlayExit()).resolves.toBe('exited');
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
