import {
  recentNoteIsTruncated,
  recentNoteVisibleLineLimit,
  recentOpenAccessLabel,
  recentOpenCaption,
  RECENT_NOTE_PREVIEW_LINES,
} from './recent-note';

describe('recent note preview', () => {
  it('keeps six lines as the preview limit', () => {
    expect(RECENT_NOTE_PREVIEW_LINES).toBe(6);
    expect(recentNoteIsTruncated(6)).toBe(false);
    expect(recentNoteIsTruncated(7)).toBe(true);
    expect(recentNoteVisibleLineLimit(0)).toBe(6);
    expect(recentNoteVisibleLineLimit(3)).toBeUndefined();
    expect(recentNoteVisibleLineLimit(6)).toBeUndefined();
    expect(recentNoteVisibleLineLimit(7)).toBe(6);
  });

  it('mentions remaining text only when the note is actually truncated', () => {
    expect(recentOpenCaption(false)).toBe('看这条');
    expect(recentOpenCaption(true)).toBe('看这条，还有正文');
    expect(recentOpenAccessLabel(['记录于 10月1日', '门口的风还在。'], false)).toBe(
      '记录于 10月1日，门口的风还在。，看这条',
    );
    expect(recentOpenAccessLabel(['记录于 10月1日', null, '傍晚回家'], true)).toBe(
      '记录于 10月1日，傍晚回家，看这条，还有正文',
    );
  });
});
