import { lookbackLayoutFor } from './lookback-chrome';

describe('lookback layout for adapt surfaces', () => {
  it('keeps a short landscape phone readable without a side rail', () => {
    const layout = lookbackLayoutFor(852, 393);
    expect(layout.readingWidth).toBe(720);
    expect(layout.shortHeight).toBe(true);
    expect(layout.verticalTime).toBe(false);
  });

  it('shares the regular iPad page frame', () => {
    const layout = lookbackLayoutFor(1024, 1366);
    expect(layout.readingWidth).toBe(1024);
    expect(layout.gutter).toBe(48);
    expect(layout.shortHeight).toBe(false);
    expect(layout.verticalTime).toBe(false);
  });

  it('stacks time on a narrow phone, not because the system type is large', () => {
    expect(lookbackLayoutFor(390, 844).verticalTime).toBe(true);
    expect(lookbackLayoutFor(1024, 1366).verticalTime).toBe(false);
  });
});
