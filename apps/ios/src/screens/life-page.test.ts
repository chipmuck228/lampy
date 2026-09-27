import { isCompactHeight, isRegularWidth, pageGutter, readingWidth } from './life-page';

describe('life page measures', () => {
  it('keeps a readable column on a wide tablet', () => {
    expect(readingWidth(1024)).toBe(520);
    expect(pageGutter(1024)).toBe(48);
    expect(isRegularWidth(768)).toBe(true);
  });

  it('uses the compact gutter and short-height rule on a phone', () => {
    expect(readingWidth(390)).toBe(390);
    expect(pageGutter(390)).toBe(24);
    expect(isRegularWidth(390)).toBe(false);
    expect(isCompactHeight(390)).toBe(true);
    expect(isCompactHeight(844)).toBe(false);
  });
});
