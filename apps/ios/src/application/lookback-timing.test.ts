import {
  beginLookbackTiming,
  finishLookbackTiming,
  readLookbackTiming,
  resetLookbackTimingForTests,
} from './lookback-timing';

describe('lookback timing marks', () => {
  beforeEach(() => {
    resetLookbackTimingForTests();
  });

  it('records first-open and day-select durations without changing reads', () => {
    const openStarted = beginLookbackTiming(1000);
    finishLookbackTiming('book-first-ready', openStarted, 1180);
    const dayStarted = beginLookbackTiming(2000);
    finishLookbackTiming('day-excerpts-ready', dayStarted, 2240);
    expect(readLookbackTiming()).toEqual([
      { kind: 'book-first-ready', durationMs: 180 },
      { kind: 'day-excerpts-ready', durationMs: 240 },
    ]);
  });
});
