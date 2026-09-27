import {
  BRAND_FADE_MS,
  consumeStartupBrand,
  resetStartupBrandForTests,
  shouldShowStartupBrand,
  shouldSkipBrandFade,
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
    expect(shouldSkipBrandFade(false)).toBe(false);
    expect(shouldSkipBrandFade(true)).toBe(true);
    expect(BRAND_FADE_MS).toBeGreaterThanOrEqual(300);
    expect(BRAND_FADE_MS).toBeLessThanOrEqual(450);
  });
});
