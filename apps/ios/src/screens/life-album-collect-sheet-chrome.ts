import { ink, paper } from './life-page';

/** Outer shell radius; pair with borderCurve: 'continuous' when supported. */
export const COLLECT_SHEET_RADIUS = 28;

/** Soft ink veil over the blurred (or solid) backdrop. */
export const COLLECT_SHEET_MASK_BLUR = 'rgba(37,35,31,0.14)';
/** Stronger plain mask when blur is unavailable or Reduce Transparency is on. */
export const COLLECT_SHEET_MASK_SOLID = 'rgba(37,35,31,0.28)';

/** Warm paper fill ~96% — do not set opacity on the whole sheet. */
export const COLLECT_SHEET_PAPER_TRANSLUCENT = 'rgba(243,240,233,0.96)';
export const COLLECT_SHEET_PAPER_SOLID = paper;

export function shouldApplyCollectSheetResult(input: {
  session: number;
  currentSession: number;
  cancelled: boolean;
}): boolean {
  return !input.cancelled && input.session === input.currentSession;
}

export function collectSheetUsesBackdropBlur(input: {
  /** null = pending or query failed → treat as reduced (no blur). */
  reduceTransparency: boolean | null;
  blurAvailable: boolean;
}): boolean {
  if (!input.blurAvailable) return false;
  if (input.reduceTransparency !== false) return false;
  return true;
}

export function collectSheetMaskColor(usesBlur: boolean): string {
  return usesBlur ? COLLECT_SHEET_MASK_BLUR : COLLECT_SHEET_MASK_SOLID;
}

export function collectSheetPaperColor(usesBlur: boolean): string {
  return usesBlur ? COLLECT_SHEET_PAPER_TRANSLUCENT : COLLECT_SHEET_PAPER_SOLID;
}

export function collectSheetMaxHeight(input: {
  windowHeight: number;
  topInset: number;
  bottomInset: number;
}): number {
  const available = Math.max(
    200,
    input.windowHeight - Math.max(0, input.topInset) - Math.max(0, input.bottomInset),
  );
  return Math.min(560, Math.max(240, Math.round(available * 0.72)));
}

/** Ink used only for soft lift shadow (not a heavy border). */
export const collectSheetShadowColor = ink;
