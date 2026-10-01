export type FirstRunDecision = {
  showGuide: boolean;
  reason: 'needed' | 'completed' | 'has-records' | 'records-unknown';
};

export function decideFirstRunGuide(input: {
  completed: boolean;
  hasPersonalRecords: boolean;
  recordsUnknown: boolean;
}): FirstRunDecision {
  if (input.completed) return { showGuide: false, reason: 'completed' };
  if (input.recordsUnknown) return { showGuide: false, reason: 'records-unknown' };
  if (input.hasPersonalRecords) return { showGuide: false, reason: 'has-records' };
  return { showGuide: true, reason: 'needed' };
}

export const FIRST_RUN_SCREENS = [
  {
    id: 'leave',
    title: '一句话，也值得留下。',
    body: '一张照片，一段声音，或此刻的感受。',
    source: '本轮新文案，2026-10-01',
    action: '继续',
  },
  {
    id: 'lookback',
    title: '那些平常的日子，后来都有了模样。',
    body: '再读一句原话，再听一次当时的声音。',
    source: '本轮新文案，2026-10-01',
    action: '继续',
  },
  {
    id: 'keep',
    title: '自己的生活，安心放在这里。',
    body: '记录保存在这台设备，也可以开启本机保护。',
    source: '本轮新文案，2026-10-01',
    action: '留下瞬间',
  },
] as const;

export const FIRST_RUN_LAST_INDEX = FIRST_RUN_SCREENS.length - 1;

export function nextFirstRunIndex(index: number) {
  return Math.min(index + 1, FIRST_RUN_LAST_INDEX);
}

export function isFirstRunFinishAction(index: number) {
  return index >= FIRST_RUN_LAST_INDEX;
}

export function settleFirstRunMotion(motion: {
  opacity: { stopAnimation: () => void; setValue: (value: number) => void };
  shift: { stopAnimation: () => void; setValue: (value: number) => void };
}) {
  motion.opacity.stopAnimation();
  motion.shift.stopAnimation();
  motion.opacity.setValue(1);
  motion.shift.setValue(0);
}

export function firstRunPageFromOffset(offsetY: number, pageHeight: number, pageCount: number) {
  return Math.max(0, Math.min(Math.round(offsetY / Math.max(pageHeight, 1)), pageCount - 1));
}

export function firstRunInnerCanScroll(contentHeight: number, viewHeight: number) {
  return contentHeight > viewHeight + 1;
}

/** Finger swipe up raises contentOffset and has positive velocity.y on iOS. */
export function firstRunPageAfterInnerSwipe(input: {
  canScroll: boolean;
  offsetY: number;
  viewHeight: number;
  contentHeight: number;
  velocityY: number;
  index: number;
}): number | null {
  if (!input.canScroll) return null;
  const atEnd = input.offsetY + input.viewHeight >= input.contentHeight - 8;
  const atStart = input.offsetY <= 8;
  if (atEnd && input.velocityY > 0.15 && !isFirstRunFinishAction(input.index)) {
    return nextFirstRunIndex(input.index);
  }
  if (atStart && input.velocityY < -0.15 && input.index > 0) {
    return input.index - 1;
  }
  return null;
}
