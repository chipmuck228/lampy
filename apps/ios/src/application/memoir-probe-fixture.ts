/** Isolated synthetic Chinese only. Never load lampy.db or user media. */

export type ProbeMomentInput = {
  id: string;
  note: string;
};

export const MEMOIR_PROBE_FIXTURE: ProbeMomentInput[] = [
  { id: 'moment_memoir_eval_s1_a', note: '下班路过江边，风很大。' },
  { id: 'moment_memoir_eval_s1_b', note: '自己煮了番茄面。' },
  { id: 'moment_memoir_eval_s2_a', note: '又去江边走了一圈。' },
  { id: 'moment_memoir_eval_s3_a', note: '今天在家休息，哪里也没去。' },
  { id: 'moment_memoir_eval_s3_b', note: '下午和同事开会到很晚。' },
  { id: 'moment_memoir_eval_s8_always', note: '你一直去江边走走。' },
];

export function memoirProbeFixtureIds(): string[] {
  return MEMOIR_PROBE_FIXTURE.map((row) => row.id);
}
