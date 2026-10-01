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

  it('keeps the full-record action even when the note is truncated', () => {
    expect(recentOpenCaption(false)).toBe('阅读完整记录');
    expect(recentOpenCaption(true)).toBe('阅读完整记录');
    expect(recentOpenAccessLabel(['记录于 10月1日', '门口的风还在。'], false)).toBe(
      '记录于 10月1日，门口的风还在。，阅读完整记录',
    );
    expect(recentOpenAccessLabel(['记录于 10月1日', null, '傍晚回家'], true)).toBe(
      '记录于 10月1日，傍晚回家，阅读完整记录',
    );
  });
});
