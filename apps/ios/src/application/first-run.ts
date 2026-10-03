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
    photoNote: '一杯咖啡，一段午后。',
    title: '日子，不必特别才值得留下。',
    titleLines: ['日子，不必', '特别才值得', '留下。'],
    titleAccentIndex: 2,
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
    titleLines: ['轻轻扫过，', '也能看见', '日子的样子。'],
    titleAccentIndex: 2,
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
    titleLines: ['从一个日子，', '继续读起。'],
    titleAccentIndex: 1,
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

export const FIRST_RUN_PHOTO_FADE_MS = 500;
export const FIRST_RUN_COPY_FADE_MS = 450;
export const FIRST_RUN_COPY_FADE_DELAY_MS = 100;
export const FIRST_RUN_MOTION_PREF_TIMEOUT_MS = 800;
export const FIRST_RUN_FONT_TIMEOUT_MS = 800;

let motionPrefTimeoutMs = FIRST_RUN_MOTION_PREF_TIMEOUT_MS;
let fontTimeoutMs = FIRST_RUN_FONT_TIMEOUT_MS;

export function firstRunMotionPrefTimeoutMs() {
  return motionPrefTimeoutMs;
}

export function firstRunFontTimeoutMs() {
  return fontTimeoutMs;
}

export function setFirstRunEnterTimeoutsForTests(input: { motionPref?: number; fonts?: number }) {
  if (input.motionPref != null) motionPrefTimeoutMs = input.motionPref;
  if (input.fonts != null) fontTimeoutMs = input.fonts;
}

export function resetFirstRunEnterTimeoutsForTests() {
  motionPrefTimeoutMs = FIRST_RUN_MOTION_PREF_TIMEOUT_MS;
  fontTimeoutMs = FIRST_RUN_FONT_TIMEOUT_MS;
}

export type FirstRunMotionDelay = { current: ReturnType<typeof setTimeout> | null };
export type FirstRunPhotoReady = 'pending' | 'loaded' | 'failed';
export type FirstRunMotionPref = 'pending' | 'on' | 'off' | 'failed';
export type FirstRunFontReady = 'pending' | 'ready' | 'failed';
export type FirstRunEnterPlay = 'wait' | 'fade' | 'show';
export type FirstRunStartupOverlay = 'covering' | 'exiting' | 'exited' | 'failed';

export function settleFirstRunMotion(motion: {
  opacity: { stopAnimation: () => void; setValue: (value: number) => void };
  shift: { stopAnimation: () => void; setValue: (value: number) => void };
  photoOpacity?: { stopAnimation: () => void; setValue: (value: number) => void };
  delay?: FirstRunMotionDelay;
}) {
  if (motion.delay) {
    if (motion.delay.current != null) clearTimeout(motion.delay.current);
    motion.delay.current = null;
  }
  motion.opacity.stopAnimation();
  motion.shift.stopAnimation();
  motion.opacity.setValue(1);
  motion.shift.setValue(0);
  if (motion.photoOpacity) {
    motion.photoOpacity.stopAnimation();
    motion.photoOpacity.setValue(1);
  }
}

export function firstRunShouldAnimatePage(reduceMotion: boolean, appState: string) {
  return reduceMotion === false && appState === 'active';
}

export function firstRunMotionPrefFromQuery(enabled: boolean): Exclude<FirstRunMotionPref, 'pending' | 'failed'> {
  return enabled ? 'on' : 'off';
}

export function firstRunPagerIsSettled(offsetY: number, pageHeight: number, index: number) {
  if (pageHeight <= 0) return false;
  return Math.abs(offsetY - firstRunPagerOffset(index, pageHeight)) <= 2;
}

export function firstRunEnterIsCurrent(eventGen: number, currentGen: number) {
  return eventGen === currentGen;
}

export function firstRunNeedsStartupHandoff(index: number) {
  return index === 0;
}

export function firstRunStartupCovering(
  overlay: FirstRunStartupOverlay = 'exited',
  brandCovering = false,
) {
  return brandCovering || overlay === 'covering' || overlay === 'exiting';
}

export function firstRunShouldRequestOverlayExit(input: {
  index: number;
  pref: FirstRunMotionPref;
  fontsReady: FirstRunFontReady;
  photoReady: FirstRunPhotoReady;
  settled: boolean;
  overlay: FirstRunStartupOverlay;
}) {
  if (!firstRunNeedsStartupHandoff(input.index)) return false;
  if (input.overlay !== 'covering') return false;
  if (input.pref === 'pending') return false;
  if (input.fontsReady === 'pending') return false;
  if (input.pref === 'on' || input.pref === 'failed') return true;
  return input.settled && input.photoReady !== 'pending';
}

export function firstRunShouldPlayEnter(input: {
  pref: FirstRunMotionPref;
  appState: string;
  settled: boolean;
  photoReady: FirstRunPhotoReady;
  fontsReady: FirstRunFontReady;
  alreadySolid?: boolean;
  overlay?: FirstRunStartupOverlay;
  brandCovering?: boolean;
}): FirstRunEnterPlay {
  if (input.alreadySolid) return 'show';
  if (input.pref === 'pending') return 'wait';
  if (input.pref === 'on' || input.pref === 'failed') {
    return input.fontsReady === 'pending' ? 'wait' : 'show';
  }
  if (firstRunStartupCovering(input.overlay ?? 'exited', input.brandCovering === true)) {
    return 'wait';
  }
  if (input.appState !== 'active') return 'wait';
  if (!input.settled) return 'wait';
  if (input.fontsReady === 'pending') return 'wait';
  if (input.photoReady === 'pending') return 'wait';
  return 'fade';
}

export function firstRunProgressLabel(index: number, count: number) {
  return `第 ${index + 1} 屏，共 ${count} 屏`;
}

export function firstRunBodyLines(body: string) {
  return body.split(/(?<=。)/).map((part) => part.trim()).filter(Boolean);
}

export function firstRunCopyColumnWidth(photoWidth: number, layoutWidth: number, layoutHeight: number) {
  if (photoWidth <= 0) return 0;
  const landscape = layoutWidth > layoutHeight;
  const compact = layoutHeight < 500;
  const regular = layoutWidth >= 768 && !compact;
  const ratio = compact ? 0.9 : landscape ? 0.88 : regular ? 0.72 : 0.82;
  return Math.min(photoWidth, Math.max(Math.round(photoWidth * ratio), Math.min(220, photoWidth)));
}

export function firstRunParkedPageOpacity(isCurrent: boolean, isLeaving: boolean) {
  if (isCurrent) return null;
  return isLeaving ? 1 : 0;
}

export function firstRunCanStartEnterMotion(ready: FirstRunPhotoReady) {
  return ready === 'loaded' || ready === 'failed';
}

export type FirstRunCopyMeasure = {
  viewH: number;
  contentH: number;
};

export type FirstRunCopyMeasures = Record<string, FirstRunCopyMeasure>;

export function firstRunCopyMeasureReady(
  measure?: FirstRunCopyMeasure | null,
): measure is FirstRunCopyMeasure {
  return !!measure && measure.viewH > 0 && measure.contentH > 0;
}

export function rememberFirstRunCopyMeasure(
  measures: FirstRunCopyMeasures,
  id: string,
  next: FirstRunCopyMeasure,
): FirstRunCopyMeasures {
  const prev = measures[id];
  if (prev && prev.viewH === next.viewH && prev.contentH === next.contentH) return measures;
  return { ...measures, [id]: next };
}

export function invalidateFirstRunCopyMeasures(): FirstRunCopyMeasures {
  return {};
}

export function firstRunFrameChanged(
  prev: { width: number; height: number },
  next: { width: number; height: number },
) {
  return Math.abs(prev.width - next.width) > 0.5 || Math.abs(prev.height - next.height) > 0.5;
}

export function firstRunShouldInvalidateCopyMeasures(
  prev: { width: number; height: number },
  next: { width: number; height: number },
) {
  if (prev.width <= 0 || prev.height <= 0) return false;
  return firstRunFrameChanged(prev, next);
}

export function firstRunPagerOffset(index: number, pageHeight: number) {
  return Math.max(index, 0) * Math.max(pageHeight, 1);
}

/** Unknown heights must not be treated as “copy fits, no inner scroll”. */
export function firstRunCopyAllowsInnerScroll(measure?: FirstRunCopyMeasure | null) {
  if (!firstRunCopyMeasureReady(measure)) return true;
  return firstRunInnerCanScroll(measure.contentH, measure.viewH);
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
