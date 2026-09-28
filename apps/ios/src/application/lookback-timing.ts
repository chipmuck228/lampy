export type LookbackTimingKind = 'book-first-ready' | 'day-excerpts-ready';

export type LookbackTimingMark = {
  kind: LookbackTimingKind;
  durationMs: number;
};

let marks: LookbackTimingMark[] = [];

export function beginLookbackTiming(now = Date.now()): number {
  return now;
}

export function finishLookbackTiming(
  kind: LookbackTimingKind,
  startedAt: number,
  now = Date.now(),
): LookbackTimingMark {
  const mark = { kind, durationMs: Math.max(0, now - startedAt) };
  marks.push(mark);
  if (__DEV__ && process.env.JEST_WORKER_ID == null) {
    console.log(`[lookback-timing] ${kind} ${mark.durationMs}ms`);
  }
  return mark;
}

export function readLookbackTiming(): LookbackTimingMark[] {
  return marks.slice();
}

export function resetLookbackTimingForTests(): void {
  marks = [];
}
