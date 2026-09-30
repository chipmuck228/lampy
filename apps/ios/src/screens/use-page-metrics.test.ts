import { Dimensions } from 'react-native';

import { readPageMetrics } from './use-page-metrics';

describe('readPageMetrics', () => {
  afterEach(() => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('reads the current window and font scale', () => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
    expect(readPageMetrics()).toEqual({ width: 390, height: 844, fontScale: 1 });
  });

  it('reads a Dynamic Type change from the window metrics', () => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 3.1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 3.1 },
    });
    expect(readPageMetrics()).toEqual({ width: 390, height: 844, fontScale: 3.1 });
  });
});
