import * as SplashScreen from 'expo-splash-screen';

export type StartupOverlayState = 'covering' | 'exiting' | 'exited' | 'failed';
export type StartupOverlayResult = 'exited' | 'failed';

export const STARTUP_OVERLAY_FAILSAFE_MS = 4000;

const listeners = new Set<(state: StartupOverlayState) => void>();
const brandListeners = new Set<(covering: boolean) => void>();

let state: StartupOverlayState = 'covering';
let generation = 0;
let inFlight: Promise<StartupOverlayResult> | null = null;
let failsafeTimer: ReturnType<typeof setTimeout> | null = null;
let hungTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimeoutMs = STARTUP_OVERLAY_FAILSAFE_MS;
let failsafeMs = STARTUP_OVERLAY_FAILSAFE_MS;
let brandCovering = false;
let hideImpl: () => Promise<void> = defaultHide;
let paintImpl: (cb: () => void) => void = defaultPaint;

function defaultHide() {
  return SplashScreen.hideAsync();
}

function defaultPaint(cb: () => void) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(cb);
    return;
  }
  cb();
}

function notifyOverlay() {
  for (const listener of listeners) listener(state);
}

function notifyBrand() {
  for (const listener of brandListeners) listener(brandCovering);
}

function afterPaint() {
  return new Promise<void>((resolve) => {
    paintImpl(() => resolve());
  });
}

export function startupOverlayState(): StartupOverlayState {
  return state;
}

export function startupOverlayGeneration(): number {
  return generation;
}

export function startupOverlayIsCurrent(eventGen: number, currentGen: number) {
  return eventGen === currentGen;
}

export function subscribeStartupOverlay(listener: (next: StartupOverlayState) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isStartupBrandCovering() {
  return brandCovering;
}

export function setStartupBrandCovering(next: boolean) {
  if (brandCovering === next) return;
  brandCovering = next;
  notifyBrand();
}

export function subscribeStartupBrandCovering(listener: (covering: boolean) => void) {
  brandListeners.add(listener);
  return () => {
    brandListeners.delete(listener);
  };
}

export function requestStartupOverlayExit(): Promise<StartupOverlayResult> {
  if (state === 'exited' || state === 'failed') return Promise.resolve(state);
  if (inFlight) return inFlight;
  state = 'exiting';
  generation += 1;
  const startedGen = generation;
  notifyOverlay();

  if (hungTimer != null) {
    clearTimeout(hungTimer);
    hungTimer = null;
  }
  const hung = new Promise<StartupOverlayResult>((resolve) => {
    hungTimer = setTimeout(() => resolve('failed'), hideTimeoutMs);
  });
  let hideStarted: Promise<void>;
  try {
    hideStarted = Promise.resolve(hideImpl());
  } catch {
    hideStarted = Promise.reject(new Error('startup-overlay-hide'));
  }
  const hide = hideStarted
    .then(() => afterPaint())
    .then(() => 'exited' as const)
    .catch(() => 'failed' as const);

  inFlight = Promise.race([hide, hung]).then((result) => {
    if (hungTimer != null) {
      clearTimeout(hungTimer);
      hungTimer = null;
    }
    if (startedGen !== generation) {
      return state === 'exited' || state === 'failed' ? state : result;
    }
    if (state === 'exited' || state === 'failed') return state;
    state = result;
    inFlight = null;
    notifyOverlay();
    return result;
  });
  return inFlight;
}

export function ensureStartupOverlayFailsafe() {
  if (failsafeTimer != null) {
    return () => undefined;
  }
  failsafeTimer = setTimeout(() => {
    failsafeTimer = null;
    void requestStartupOverlayExit();
  }, failsafeMs);
  return () => {
    if (failsafeTimer == null) return;
    clearTimeout(failsafeTimer);
    failsafeTimer = null;
  };
}

export function setStartupOverlayHideForTests(hide: (() => Promise<void>) | null) {
  hideImpl = hide ?? defaultHide;
}

export function setStartupOverlayPaintForTests(paint: ((cb: () => void) => void) | null) {
  paintImpl = paint ?? defaultPaint;
}

export function setStartupOverlayTimeoutsForTests(input: { hide?: number; failsafe?: number }) {
  if (input.hide != null) hideTimeoutMs = input.hide;
  if (input.failsafe != null) failsafeMs = input.failsafe;
}

export function resetStartupOverlayForTests() {
  generation += 1;
  state = 'covering';
  inFlight = null;
  brandCovering = false;
  hideTimeoutMs = STARTUP_OVERLAY_FAILSAFE_MS;
  failsafeMs = STARTUP_OVERLAY_FAILSAFE_MS;
  hideImpl = defaultHide;
  paintImpl = defaultPaint;
  if (failsafeTimer != null) {
    clearTimeout(failsafeTimer);
    failsafeTimer = null;
  }
  if (hungTimer != null) {
    clearTimeout(hungTimer);
    hungTimer = null;
  }
  listeners.clear();
  brandListeners.clear();
}
