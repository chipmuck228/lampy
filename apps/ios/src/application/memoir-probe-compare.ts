import { quoteIsExactSource, type DeterministicQuote } from './memoir-quote-select';
import type { ProbeMomentInput } from './memoir-probe-fixture';

export type ProbeQuote = { id: string; text: string };

export type ProbeSideMetrics = {
  side: 'deterministic' | 'foundation';
  status: string;
  durationMs: number;
  quoteCount: number;
  accurateCount: number;
  omittedIds: string[];
  extraIds: string[];
  rewrittenIds: string[];
};

export function compareProbeQuotes(input: {
  moments: ProbeMomentInput[];
  quotes: Array<DeterministicQuote | ProbeQuote>;
  side: ProbeSideMetrics['side'];
  status: string;
  durationMs: number;
}): ProbeSideMetrics {
  const notes = new Map(input.moments.map((row) => [row.id, row.note]));
  const cited: string[] = [];
  let accurateCount = 0;
  const rewrittenIds: string[] = [];
  const extraIds: string[] = [];

  for (const quote of input.quotes) {
    const id = 'sourceIds' in quote ? quote.sourceIds[0] : quote.id;
    const text = quote.text;
    if (!notes.has(id)) {
      extraIds.push(id);
      continue;
    }
    cited.push(id);
    if (quoteIsExactSource(text, notes.get(id) || '')) accurateCount += 1;
    else rewrittenIds.push(id);
  }

  const omittedIds = input.moments.map((row) => row.id).filter((id) => !cited.includes(id));
  return {
    side: input.side,
    status: input.status,
    durationMs: input.durationMs,
    quoteCount: input.quotes.length,
    accurateCount,
    omittedIds,
    extraIds,
    rewrittenIds,
  };
}

export function probeLogLine(metrics: ProbeSideMetrics): string {
  return [
    `[memoir-probe]`,
    metrics.side,
    metrics.status,
    `${metrics.durationMs}ms`,
    `quotes=${metrics.quoteCount}`,
    `accurate=${metrics.accurateCount}`,
    `omitted=${metrics.omittedIds.length}`,
    `extra=${metrics.extraIds.length}`,
    `rewritten=${metrics.rewrittenIds.length}`,
  ].join(' ');
}

export type ProbeExcerptFlag = 'exact' | 'omitted' | 'rewritten';

export type ProbeExcerptRow = {
  id: string;
  original: string;
  deterministicText: string | null;
  foundationText: string | null;
  deterministicFlag: ProbeExcerptFlag;
  foundationFlag: ProbeExcerptFlag;
};

function quoteTextForId(quotes: Array<DeterministicQuote | ProbeQuote>, id: string): string | null {
  for (const quote of quotes) {
    const quoteId = 'sourceIds' in quote ? quote.sourceIds[0] : quote.id;
    if (quoteId === id) return quote.text;
  }
  return null;
}

function excerptFlag(text: string | null, note: string): ProbeExcerptFlag {
  if (text == null) return 'omitted';
  return quoteIsExactSource(text, note) ? 'exact' : 'rewritten';
}

export function buildProbeExcerptRows(input: {
  moments: ProbeMomentInput[];
  deterministicQuotes?: Array<DeterministicQuote | ProbeQuote>;
  foundationQuotes?: Array<DeterministicQuote | ProbeQuote>;
}): ProbeExcerptRow[] {
  const deterministicQuotes = input.deterministicQuotes ?? [];
  const foundationQuotes = input.foundationQuotes ?? [];
  return input.moments.map((moment) => {
    const deterministicText = quoteTextForId(deterministicQuotes, moment.id);
    const foundationText = quoteTextForId(foundationQuotes, moment.id);
    return {
      id: moment.id,
      original: moment.note,
      deterministicText,
      foundationText,
      deterministicFlag: excerptFlag(deterministicText, moment.note),
      foundationFlag: excerptFlag(foundationText, moment.note),
    };
  });
}
