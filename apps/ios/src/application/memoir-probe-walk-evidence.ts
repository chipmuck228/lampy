import type { FoundationInspect } from '../infrastructure/foundation-probe';
import type { ProbeExcerptRow, ProbeSideMetrics } from './memoir-probe-compare';
import { probeLogLine } from './memoir-probe-compare';

export const PROBE_WALK_EVIDENCE_FILE = 'foundation-probe-walk.json';

export type ProbeWalkSideEvidence = {
  side: string;
  line: string;
  status: string;
  durationMs: number;
  quoteCount: number;
  accurateCount: number;
  omittedIds: string[];
  extraIds: string[];
  rewrittenIds: string[];
};

export type ProbeWalkEvidence = {
  scenario: string;
  inspect: FoundationInspect | null;
  sides: ProbeWalkSideEvidence[];
  excerptFlags: Array<{
    id: string;
    deterministicFlag: ProbeExcerptRow['deterministicFlag'];
    foundationFlag: ProbeExcerptRow['foundationFlag'];
  }>;
};

export function sideEvidence(side: string, metrics: ProbeSideMetrics): ProbeWalkSideEvidence {
  return {
    side,
    line: probeLogLine(metrics),
    status: metrics.status,
    durationMs: metrics.durationMs,
    quoteCount: metrics.quoteCount,
    accurateCount: metrics.accurateCount,
    omittedIds: metrics.omittedIds,
    extraIds: metrics.extraIds,
    rewrittenIds: metrics.rewrittenIds,
  };
}

export function buildProbeWalkEvidence(input: {
  scenario: string;
  inspect: FoundationInspect | null;
  sides: ProbeWalkSideEvidence[];
  excerpts?: ProbeExcerptRow[];
}): ProbeWalkEvidence {
  return {
    scenario: input.scenario,
    inspect: input.inspect,
    sides: input.sides,
    excerptFlags: (input.excerpts ?? []).map((row) => ({
      id: row.id,
      deterministicFlag: row.deterministicFlag,
      foundationFlag: row.foundationFlag,
    })),
  };
}

export function walkEvidenceContainsBodies(json: string): boolean {
  return /江边|番茄面|开会|休息|你一直/.test(json);
}
