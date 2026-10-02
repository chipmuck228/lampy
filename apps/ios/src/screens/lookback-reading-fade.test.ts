import {
  LOOKBACK_READING_APPEAR_SHIFT,
  LOOKBACK_READING_FADE_IN_MS,
  LOOKBACK_READING_FADE_OUT_MS,
  lookbackReadingAppearShift,
  lookbackReadingFadeDuration,
  lookbackReadingFadeInDuration,
  lookbackReadingFadeOutDuration,
  lookbackReadingShouldHoldVisible,
} from './lookback-reading-fade';

describe('lookback reading fade', () => {
  it('holds a visible day across a real scope change', () => {
    expect(
      lookbackReadingShouldHoldVisible({
        hadVisibleReading: true,
        sameScope: false,
      }),
    ).toBe(true);
  });

  it('does not hold the same day or an empty first load', () => {
    expect(
      lookbackReadingShouldHoldVisible({
        hadVisibleReading: true,
        sameScope: true,
      }),
    ).toBe(false);
    expect(
      lookbackReadingShouldHoldVisible({
        hadVisibleReading: false,
        sameScope: false,
      }),
    ).toBe(false);
  });

  it('appears slowly and leaves a little sooner, unless Reduce Motion is on', () => {
    expect(lookbackReadingFadeInDuration(false)).toBe(LOOKBACK_READING_FADE_IN_MS);
    expect(lookbackReadingFadeOutDuration(false)).toBe(LOOKBACK_READING_FADE_OUT_MS);
    expect(lookbackReadingAppearShift(false)).toBe(LOOKBACK_READING_APPEAR_SHIFT);
    expect(lookbackReadingFadeDuration(false)).toBe(LOOKBACK_READING_FADE_IN_MS);
    expect(lookbackReadingFadeInDuration(true)).toBe(0);
    expect(lookbackReadingFadeOutDuration(true)).toBe(0);
    expect(lookbackReadingAppearShift(true)).toBe(0);
  });

  it('keeps the appear longer than the leave so records do not pop', () => {
    expect(LOOKBACK_READING_FADE_IN_MS).toBeGreaterThan(LOOKBACK_READING_FADE_OUT_MS);
    expect(LOOKBACK_READING_FADE_IN_MS).toBeGreaterThanOrEqual(560);
  });
});
