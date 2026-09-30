import { MEMOIR_PROBE_FIXTURE } from './memoir-probe-fixture';
import { buildProbeExcerptRows, compareProbeQuotes } from './memoir-probe-compare';
import { selectQuotesDeterministic } from './memoir-quote-select';
import {
  buildProbeWalkEvidence,
  sideEvidence,
  walkEvidenceContainsBodies,
} from './memoir-probe-walk-evidence';

describe('memoir probe walk evidence', () => {
  it('records ids and flags without note bodies', () => {
    const quotes = selectQuotesDeterministic(MEMOIR_PROBE_FIXTURE);
    const metrics = compareProbeQuotes({
      moments: MEMOIR_PROBE_FIXTURE,
      quotes,
      side: 'deterministic',
      status: 'ok',
      durationMs: 2,
    });
    const excerpts = buildProbeExcerptRows({
      moments: MEMOIR_PROBE_FIXTURE,
      deterministicQuotes: quotes,
      foundationQuotes: [{ id: 'moment_memoir_eval_s1_a', text: '江边的风让人觉得自由。' }],
    });
    const evidence = buildProbeWalkEvidence({
      scenario: 'ab',
      inspect: null,
      sides: [sideEvidence('A', metrics)],
      excerpts,
    });
    const json = JSON.stringify(evidence);
    expect(json).toContain('moment_memoir_eval_s1_a');
    expect(json).toContain('rewritten');
    expect(walkEvidenceContainsBodies(json)).toBe(false);
    expect(json).not.toContain('原文');
    expect(evidence.excerptFlags.every((row) => !('original' in row))).toBe(true);
  });
});
