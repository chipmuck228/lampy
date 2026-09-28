import type { ProbeMomentInput } from './memoir-probe-fixture';

export type DeterministicQuote = {
  kind: 'quote';
  sourceIds: [string];
  text: string;
};

const REQUEST_KEYS = ['id', 'note'] as const;

export function whitelistProbeMoments(raw: unknown): ProbeMomentInput[] {
  if (!Array.isArray(raw)) return [];
  const rows: ProbeMomentInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.some((key) => !(REQUEST_KEYS as readonly string[]).includes(key))) continue;
    if (typeof record.id !== 'string' || typeof record.note !== 'string') continue;
    if (!record.note.trim()) continue;
    rows.push({ id: record.id, note: record.note });
  }
  return rows;
}

export function selectQuotesDeterministic(raw: unknown): DeterministicQuote[] {
  return whitelistProbeMoments(raw).map((row) => ({
    kind: 'quote',
    sourceIds: [row.id],
    text: row.note.trim(),
  }));
}

export function quoteIsExactSource(text: string, note: string): boolean {
  const needle = text.trim();
  return needle.length > 0 && note.includes(needle);
}
