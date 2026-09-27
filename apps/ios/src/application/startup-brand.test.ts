import {
  BRAND_FADE_MS,
  BRAND_READY_TIMEOUT_MS,
  brandReadyTimeoutMs,
  consumeStartupBrand,
  resetStartupBrandForTests,
  setBrandReadyTimeoutForTests,
  shouldShowStartupBrand,
  shouldSkipBrandFade,
  shouldStartBrandExit,
} from './startup-brand';

describe('startup brand session', () => {
  beforeEach(() => {
    resetStartupBrandForTests();
  });

  it('plays once per process and never after consume', () => {
    expect(shouldShowStartupBrand()).toBe(true);
    consumeStartupBrand();
    expect(shouldShowStartupBrand()).toBe(false);
    consumeStartupBrand();
    expect(shouldShowStartupBrand()).toBe(false);
  });

  it('skips the fade only when Reduce Motion is on', () => {
    expect(shouldStartBrandExit('pending')).toBe(false);
    expect(shouldStartBrandExit('allow')).toBe(true);
    expect(shouldStartBrandExit('reduce')).toBe(true);
    expect(shouldStartBrandExit('failed')).toBe(true);
    expect(shouldSkipBrandFade('pending')).toBe(true);
    expect(shouldSkipBrandFade('allow')).toBe(false);
    expect(shouldSkipBrandFade('reduce')).toBe(true);
    expect(shouldSkipBrandFade('failed')).toBe(true);
    expect(BRAND_FADE_MS).toBeGreaterThanOrEqual(300);
    expect(BRAND_FADE_MS).toBeLessThanOrEqual(450);
    expect(BRAND_READY_TIMEOUT_MS).toBeGreaterThan(BRAND_FADE_MS);
    expect(BRAND_READY_TIMEOUT_MS).toBe(4000);
    expect(brandReadyTimeoutMs()).toBe(BRAND_READY_TIMEOUT_MS);
    setBrandReadyTimeoutForTests(200);
    expect(brandReadyTimeoutMs()).toBe(200);
    resetStartupBrandForTests();
    expect(brandReadyTimeoutMs()).toBe(BRAND_READY_TIMEOUT_MS);
  });
});
