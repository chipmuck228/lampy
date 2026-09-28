import { MEMOIR_PROBE_FIXTURE } from './memoir-probe-fixture';
import { buildProbeExcerptRows, compareProbeQuotes, probeLogLine } from './memoir-probe-compare';
import { selectQuotesDeterministic } from './memoir-quote-select';

describe('memoir probe compare', () => {
  it('logs counts and ids, not note bodies', () => {
    const quotes = selectQuotesDeterministic(MEMOIR_PROBE_FIXTURE);
    const metrics = compareProbeQuotes({
      moments: MEMOIR_PROBE_FIXTURE,
      quotes,
      side: 'deterministic',
      status: 'ok',
      durationMs: 2,
    });
    const line = probeLogLine(metrics);
    expect(line).toContain('deterministic');
    expect(line).not.toContain('江边');
    expect(line).not.toContain('番茄面');
    expect(line).not.toContain('你一直');
  });

  it('keeps fixture originals and both excerpts for the dev page', () => {
    const deterministic = selectQuotesDeterministic(MEMOIR_PROBE_FIXTURE);
    const rows = buildProbeExcerptRows({
      moments: MEMOIR_PROBE_FIXTURE,
      deterministicQuotes: deterministic,
      foundationQuotes: [{ id: 'moment_memoir_eval_s1_a', text: '江边的风让人觉得自由。' }],
    });
    const always = rows.find((row) => row.id === 'moment_memoir_eval_s8_always');
    const river = rows.find((row) => row.id === 'moment_memoir_eval_s1_a');
    expect(always?.original).toBe('你一直去江边走走。');
    expect(always?.deterministicText).toBe('你一直去江边走走。');
    expect(always?.deterministicFlag).toBe('exact');
    expect(always?.foundationFlag).toBe('omitted');
    expect(river?.foundationText).toBe('江边的风让人觉得自由。');
    expect(river?.foundationFlag).toBe('rewritten');
  });
});
