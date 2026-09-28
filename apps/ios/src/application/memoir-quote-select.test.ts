import { MEMOIR_PROBE_FIXTURE } from './memoir-probe-fixture';
import { compareProbeQuotes } from './memoir-probe-compare';
import { selectQuotesDeterministic, whitelistProbeMoments } from './memoir-quote-select';

describe('memoir probe quote select', () => {
  it('builds moments from a whitelist and drops extra keys', () => {
    const allowed = whitelistProbeMoments([
      { id: 'a', note: '下班路过江边，风很大。' },
      { id: 'b', note: '自己煮了番茄面。', uri: 'file://secret' },
      { id: 'c', note: '   ' },
    ]);
    expect(allowed).toEqual([{ id: 'a', note: '下班路过江边，风很大。' }]);
  });

  it('selects original notes without rewriting 你一直', () => {
    const quotes = selectQuotesDeterministic(MEMOIR_PROBE_FIXTURE);
    const always = quotes.find((row) => row.sourceIds[0] === 'moment_memoir_eval_s8_always');
    expect(always?.text).toBe('你一直去江边走走。');
    const metrics = compareProbeQuotes({
      moments: MEMOIR_PROBE_FIXTURE,
      quotes,
      side: 'deterministic',
      status: 'ok',
      durationMs: 1,
    });
    expect(metrics.accurateCount).toBe(MEMOIR_PROBE_FIXTURE.length);
    expect(metrics.omittedIds).toEqual([]);
    expect(metrics.rewrittenIds).toEqual([]);
  });

  it('marks a rewritten model quote without treating generation as success', () => {
    const metrics = compareProbeQuotes({
      moments: MEMOIR_PROBE_FIXTURE,
      quotes: [{ id: 'moment_memoir_eval_s1_a', text: '江边的风让人觉得自由。' }],
      side: 'foundation',
      status: 'ok',
      durationMs: 40,
    });
    expect(metrics.accurateCount).toBe(0);
    expect(metrics.rewrittenIds).toEqual(['moment_memoir_eval_s1_a']);
    expect(metrics.omittedIds.length).toBe(MEMOIR_PROBE_FIXTURE.length - 1);
  });
});
