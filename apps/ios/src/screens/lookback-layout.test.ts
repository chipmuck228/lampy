import { lookbackLayoutFor } from './lookback-chrome';

describe('lookback layout for adapt surfaces', () => {
  it('keeps a short landscape phone readable without a side rail', () => {
    const layout = lookbackLayoutFor(852, 393, 1);
    expect(layout.readingWidth).toBe(720);
    expect(layout.shortHeight).toBe(true);
    expect(layout.verticalTime).toBe(false);
  });

  it('caps an iPad page at the book reading width', () => {
    const layout = lookbackLayoutFor(1024, 1366, 1);
    expect(layout.readingWidth).toBe(720);
    expect(layout.shortHeight).toBe(false);
    expect(layout.verticalTime).toBe(false);
  });

  it('stacks time on a narrow or large-type phone', () => {
    expect(lookbackLayoutFor(390, 844, 1).verticalTime).toBe(true);
    expect(lookbackLayoutFor(1024, 1366, 1.3).verticalTime).toBe(true);
  });
});
