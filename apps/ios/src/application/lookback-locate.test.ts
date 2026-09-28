import { lookbackLocateScrollY, requestLookbackLocate } from './lookback-locate';

describe('lookback locate scroll coordinates', () => {
  it('places the anchor in the scroll container from window positions', () => {
    expect(lookbackLocateScrollY(18, 800, 160)).toBe(658);
    expect(lookbackLocateScrollY(0, 120, 120)).toBe(0);
    expect(lookbackLocateScrollY(40, 80, 200)).toBe(0);
  });

  it('waits for the late window measure and consumes the container y once', () => {
    const consume = jest.fn();
    let onAnchor: ((x: number, y: number, width: number, height: number) => void) | undefined;
    let onScroll: ((x: number, y: number, width: number, height: number) => void) | undefined;
    requestLookbackLocate({
      measureAnchorWindow: (callback) => {
        onAnchor = callback;
      },
      measureScrollWindow: (callback) => {
        onScroll = callback;
      },
      readOffset: () => 24,
      consume,
    });
    expect(consume).not.toHaveBeenCalled();
    expect(onScroll).toBeUndefined();
    onAnchor?.(0, 1840, 390, 48);
    expect(consume).not.toHaveBeenCalled();
    onScroll?.(0, 120, 390, 844);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith(1744);
  });

  it('falls back to the same container coordinates when window measure is missing', () => {
    const consume = jest.fn();
    requestLookbackLocate({
      readOffset: () => 18,
      consume,
      measureAnchorInScroll: (onSuccess) => {
        onSuccess(0, 640, 390, 48);
      },
    });
    expect(consume).toHaveBeenCalledWith(658);
  });
});
