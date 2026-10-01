import { lookbackLayoutFor } from './lookback-chrome';

describe('lookback layout for adapt surfaces', () => {
  it('keeps a short landscape phone readable without a side rail', () => {
    const layout = lookbackLayoutFor(852, 393);
    expect(layout.readingWidth).toBe(720);
    expect(layout.shortHeight).toBe(true);
    expect(layout.verticalTime).toBe(false);
  });

  it('caps an iPad page at the book reading width', () => {
    const layout = lookbackLayoutFor(1024, 1366);
    expect(layout.readingWidth).toBe(720);
    expect(layout.shortHeight).toBe(false);
    expect(layout.verticalTime).toBe(false);
  });

  it('stacks time on a narrow phone, not because the system type is large', () => {
    expect(lookbackLayoutFor(390, 844).verticalTime).toBe(true);
    expect(lookbackLayoutFor(1024, 1366).verticalTime).toBe(false);
  });
});
