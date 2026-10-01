import { Dimensions } from 'react-native';

import { readPageMetrics } from './use-page-metrics';

function setWindow(width: number, height: number, fontScale = 3.1) {
  Dimensions.set({
    window: { width, height, scale: 2, fontScale },
    screen: { width, height, scale: 2, fontScale },
  });
}

describe('readPageMetrics', () => {
  afterEach(() => {
    setWindow(390, 844, 1);
  });

  it('reads the current window size and ignores system fontScale', () => {
    setWindow(390, 844, 3.1);
    expect(readPageMetrics()).toEqual({ width: 390, height: 844 });
  });

  it('follows a window size change after rotation', () => {
    setWindow(390, 844, 1);
    expect(readPageMetrics()).toEqual({ width: 390, height: 844 });
    setWindow(844, 390, 3.1);
    expect(readPageMetrics()).toEqual({ width: 844, height: 390 });
  });
});
