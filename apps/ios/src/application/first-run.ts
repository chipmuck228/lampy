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
    title: '这里，留下自己的生活。',
    body: '一句话、一张照片或一段声音。不用发布，也不用让它显得重要。',
    source: 'https://www.yunpura.com/zh-cn h1 与导语，2026-09-29',
    action: '继续',
  },
  {
    id: 'lookback',
    title: '生活不是信息流，它会慢慢积累。',
    body: '先把今天留下，以后再回来看看。',
    source: 'https://www.yunpura.com/zh-cn h2 与页脚说明，2026-09-29',
    action: '继续',
  },
  {
    id: 'share',
    title: '不是每一张照片，都需要发出去。',
    body: '有些生活适合分享。也有些，只想留给自己和重要的人。',
    source: 'https://www.yunpura.com/zh-cn h2 与导语，2026-09-29',
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
