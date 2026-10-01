export const RECENT_NOTE_PREVIEW_LINES = 6;

export function recentNoteIsTruncated(lineCount: number): boolean {
  return lineCount > RECENT_NOTE_PREVIEW_LINES;
}

export function recentOpenCaption(truncated: boolean): string {
  return truncated ? '看这条，还有正文' : '看这条';
}

export function recentOpenAccessLabel(parts: (string | null | undefined)[], truncated: boolean): string {
  return [...parts.filter(Boolean), recentOpenCaption(truncated)].join('，');
}
