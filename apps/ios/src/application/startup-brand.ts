export const BRAND_FADE_MS = 380;

let consumedThisProcess = false;

export function resetStartupBrandForTests(): void {
  consumedThisProcess = false;
}

export function shouldShowStartupBrand(): boolean {
  return !consumedThisProcess;
}

export function consumeStartupBrand(): void {
  consumedThisProcess = true;
}

export function shouldSkipBrandFade(reduceMotion: boolean): boolean {
  return reduceMotion;
}
