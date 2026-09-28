import { MEMOIR_PROBE_FIXTURE } from './memoir-probe-fixture';
import { compareProbeQuotes, probeLogLine } from './memoir-probe-compare';
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
});
