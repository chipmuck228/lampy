import { Dimensions, PixelRatio } from 'react-native';

import {
  RESUME_REREAD_MS,
  pickFontScale,
  readPageMetrics,
  resolveFontScale,
  type FontScaleReading,
  type PageMetrics,
} from './use-page-metrics';

function setWindowFontScale(fontScale: number) {
  Dimensions.set({
    window: { width: 390, height: 844, scale: 2, fontScale },
    screen: { width: 390, height: 844, scale: 2, fontScale },
  });
}

function readSequence(
  steps: { window: number; pixel: number; at: string }[],
  previous?: FontScaleReading,
) {
  let reading = previous;
  return steps.map((step) => {
    reading = resolveFontScale(step.window, step.pixel, reading);
    return { at: step.at, fontScale: reading.fontScale, reading };
  });
}

function rereadSchedule(at: string) {
  return ['first', ...RESUME_REREAD_MS.map((ms) => `${ms}ms`), 'later'].map((label) => ({
    ...{ window: 3, pixel: 1 },
    at: `${at}:${label}`,
  }));
}

describe('readPageMetrics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setWindowFontScale(1);
  });

  it('reads the current window and font scale', () => {
    setWindowFontScale(1);
    expect(readPageMetrics()).toMatchObject({ width: 390, height: 844, fontScale: 1 });
  });

  it('reads a Dynamic Type change from the window metrics', () => {
    setWindowFontScale(3.1);
    expect(readPageMetrics()).toMatchObject({ width: 390, height: 844, fontScale: 3.1 });
  });

  it('adopts PixelRatio once when the window is still the previous size', () => {
    const first = resolveFontScale(3, 1, { fontScale: 3, windowScale: 3, pixelScale: 3 });
    expect(first.fontScale).toBe(1);
    expect(pickFontScale(1, 3.1, { fontScale: 1, windowScale: 1, pixelScale: 1 })).toBe(3.1);
  });
});

describe('font scale source conflict', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setWindowFontScale(1);
  });

  it('keeps an adopted shrink across first, 80ms, 400ms, and later reads while the window stays at 3', () => {
    const previous = { fontScale: 3, windowScale: 3, pixelScale: 3 };
    const steps = rereadSchedule('shrink');
    const seen = readSequence(steps, previous);
    expect(seen.map((item) => item.fontScale)).toEqual([1, 1, 1, 1]);
    expect(seen.map((item) => item.at)).toEqual(['shrink:first', 'shrink:80ms', 'shrink:400ms', 'shrink:later']);
    expect(seen.some((item, index) => index > 0 && item.fontScale === 3)).toBe(false);

    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    setWindowFontScale(3);
    let metrics: PageMetrics = {
      width: 390,
      height: 844,
      fontScale: 3,
      windowFontScale: 3,
      pixelFontScale: 3,
    };
    const rereads = ['first', '80ms', '400ms', 'later'].map((at) => {
      metrics = readPageMetrics(metrics);
      return { at, fontScale: metrics.fontScale, window: metrics.windowFontScale, pixel: metrics.pixelFontScale };
    });
    expect(rereads.map((item) => item.fontScale)).toEqual([1, 1, 1, 1]);
    expect(rereads.every((item) => item.window === 3 && item.pixel === 1)).toBe(true);
    expect(rereads.map((item) => item.at)).toEqual(['first', '80ms', '400ms', 'later']);
  });

  it('keeps an adopted enlarge across rereads until both sources converge', () => {
    const previous = { fontScale: 1, windowScale: 1, pixelScale: 1 };
    const seen = readSequence(
      [
        { window: 1, pixel: 3, at: 'grow:first' },
        { window: 1, pixel: 3, at: 'grow:80ms' },
        { window: 1, pixel: 3, at: 'grow:400ms' },
        { window: 1, pixel: 3, at: 'grow:later' },
        { window: 3, pixel: 3, at: 'grow:converged' },
      ],
      previous,
    );
    expect(seen.map((item) => `${item.at}:${item.fontScale}`)).toEqual([
      'grow:first:3',
      'grow:80ms:3',
      'grow:400ms:3',
      'grow:later:3',
      'grow:converged:3',
    ]);
  });

  it('holds the confirmed scale until the stale source catches up', () => {
    const afterPixel = resolveFontScale(3, 1, { fontScale: 3, windowScale: 3, pixelScale: 3 });
    const held = readSequence(
      [
        { window: 3, pixel: 1, at: 'hold:80ms' },
        { window: 3, pixel: 1, at: 'hold:400ms' },
        { window: 1, pixel: 1, at: 'hold:converged' },
      ],
      afterPixel,
    );
    expect(held.map((item) => item.fontScale)).toEqual([1, 1, 1]);
    expect(held[2].reading).toEqual({ fontScale: 1, windowScale: 1, pixelScale: 1 });
  });
});
