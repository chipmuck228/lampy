export const BRAND_FADE_MS = 380;
export const BRAND_READY_TIMEOUT_MS = 4000;

let consumedThisProcess = false;
let readyTimeoutMs = BRAND_READY_TIMEOUT_MS;
let timeoutGeneration = 0;

export function resetStartupBrandForTests(): void {
  consumedThisProcess = false;
  readyTimeoutMs = BRAND_READY_TIMEOUT_MS;
  timeoutGeneration += 1;
}

export function brandTimeoutGeneration(): number {
  return timeoutGeneration;
}

export function setBrandReadyTimeoutForTests(ms: number): void {
  readyTimeoutMs = ms;
}

export function brandReadyTimeoutMs(): number {
  return readyTimeoutMs;
}

export function shouldShowStartupBrand(): boolean {
  return !consumedThisProcess;
}

export function consumeStartupBrand(): void {
  consumedThisProcess = true;
}

export type BrandMotionPref = 'pending' | 'allow' | 'reduce' | 'failed';

export function shouldStartBrandExit(pref: BrandMotionPref): boolean {
  return pref !== 'pending';
}

export function shouldSkipBrandFade(pref: BrandMotionPref): boolean {
  return pref !== 'allow';
}
