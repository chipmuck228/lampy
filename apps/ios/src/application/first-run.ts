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
