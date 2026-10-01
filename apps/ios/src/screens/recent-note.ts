export const RECENT_NOTE_PREVIEW_LINES = 6;

export function recentNoteIsTruncated(lineCount: number): boolean {
  return lineCount > RECENT_NOTE_PREVIEW_LINES;
}

/** Clamp until measured. Short notes then drop the limit; long notes stay at 6. */
export function recentNoteVisibleLineLimit(lineCount: number): number | undefined {
  if (lineCount === 0 || recentNoteIsTruncated(lineCount)) return RECENT_NOTE_PREVIEW_LINES;
  return undefined;
}

export function recentOpenCaption(truncated: boolean): string {
  return truncated ? '看这条，还有正文' : '看这条';
}

export function recentOpenAccessLabel(parts: (string | null | undefined)[], truncated: boolean): string {
  return [...parts.filter(Boolean), recentOpenCaption(truncated)].join('，');
}
