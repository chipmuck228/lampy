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
    photo: 'coffee',
    photoAlt: '午后的阳光落在窗边的咖啡桌上',
    photoNote: '一段咖啡，一段午后。',
    title: '日子，不必特别才值得留下。',
    body: '不必写成故事。把这一刻，轻轻留给自己。',
    source: '本轮定稿，2026-10-03',
    action: '继续',
  },
  {
    id: 'lookback',
    photo: 'flowers',
    photoAlt: '窗边晨光里的白色花朵',
    photoNote: '今天，也有想记住的光。',
    title: '轻轻扫过，也能看见日子的样子。',
    body: '文字、照片和声音，保留原来的样子。想再读一遍时，随时停下来。',
    source: '本轮定稿，2026-10-03',
    action: '继续',
  },
  {
    id: 'keep',
    photo: 'window',
    photoAlt: '窗台上的植物和一盏灯',
    photoNote: '有些日子，值得再坐一会儿。',
    title: '从一个日子，继续读起。',
    body: '回到那一天，慢慢读完。过往就在这里，允许停留。',
    source: '本轮定稿，2026-10-03',
    action: '留下瞬间',
  },
] as const;

export const FIRST_RUN_LAST_INDEX = FIRST_RUN_SCREENS.length - 1;

export function nextFirstRunIndex(index: number) {
  return Math.min(index + 1, FIRST_RUN_LAST_INDEX);
}

export function prevFirstRunIndex(index: number) {
  return Math.max(index - 1, 0);
}

export function isFirstRunFinishAction(index: number) {
  return index >= FIRST_RUN_LAST_INDEX;
}

export function settleFirstRunMotion(motion: {
  opacity: { stopAnimation: () => void; setValue: (value: number) => void };
  shift: { stopAnimation: () => void; setValue: (value: number) => void };
  photoOpacity?: { stopAnimation: () => void; setValue: (value: number) => void };
}) {
  motion.opacity.stopAnimation();
  motion.shift.stopAnimation();
  motion.opacity.setValue(1);
  motion.shift.setValue(0);
  if (motion.photoOpacity) {
    motion.photoOpacity.stopAnimation();
    motion.photoOpacity.setValue(1);
  }
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
