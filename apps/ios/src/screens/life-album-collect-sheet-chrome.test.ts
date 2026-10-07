import {
  COLLECT_SHEET_MASK_BLUR,
  COLLECT_SHEET_MASK_SOLID,
  COLLECT_SHEET_PAPER_SOLID,
  COLLECT_SHEET_PAPER_TRANSLUCENT,
  collectSheetMaskColor,
  collectSheetMaxHeight,
  collectSheetPaperColor,
  collectSheetUsesBackdropBlur,
  shouldApplyCollectSheetResult,
} from './life-album-collect-sheet-chrome';

describe('collect sheet chrome', () => {
  it('uses blur only when transparency is allowed and blur is available', () => {
    expect(
      collectSheetUsesBackdropBlur({ reduceTransparency: false, blurAvailable: true }),
    ).toBe(true);
    expect(
      collectSheetUsesBackdropBlur({ reduceTransparency: true, blurAvailable: true }),
    ).toBe(false);
    expect(
      collectSheetUsesBackdropBlur({ reduceTransparency: null, blurAvailable: true }),
    ).toBe(false);
    expect(
      collectSheetUsesBackdropBlur({ reduceTransparency: false, blurAvailable: false }),
    ).toBe(false);
  });

  it('picks solid paper and stronger mask when blur is off', () => {
    expect(collectSheetPaperColor(true)).toBe(COLLECT_SHEET_PAPER_TRANSLUCENT);
    expect(collectSheetPaperColor(false)).toBe(COLLECT_SHEET_PAPER_SOLID);
    expect(collectSheetMaskColor(true)).toBe(COLLECT_SHEET_MASK_BLUR);
    expect(collectSheetMaskColor(false)).toBe(COLLECT_SHEET_MASK_SOLID);
  });

  it('caps sheet height to the safe available window', () => {
    expect(
      collectSheetMaxHeight({ windowHeight: 844, topInset: 47, bottomInset: 34 }),
    ).toBeLessThanOrEqual(560);
    expect(
      collectSheetMaxHeight({ windowHeight: 320, topInset: 20, bottomInset: 10 }),
    ).toBeGreaterThanOrEqual(240);
    const short = collectSheetMaxHeight({ windowHeight: 500, topInset: 40, bottomInset: 20 });
    const landscape = collectSheetMaxHeight({ windowHeight: 390, topInset: 20, bottomInset: 20 });
    expect(landscape).toBeLessThanOrEqual(short);
  });

  it('keeps late-result eligibility rules', () => {
    expect(
      shouldApplyCollectSheetResult({ session: 1, currentSession: 2, cancelled: false }),
    ).toBe(false);
    expect(
      shouldApplyCollectSheetResult({ session: 2, currentSession: 2, cancelled: true }),
    ).toBe(false);
    expect(
      shouldApplyCollectSheetResult({ session: 2, currentSession: 2, cancelled: false }),
    ).toBe(true);
  });
});
