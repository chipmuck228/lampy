import { albumDateRangeLabel, formatAlbumAudioDuration } from './life-album';

describe('album manage presentation helpers', () => {
  it('computes date range from dates, not list order', () => {
    expect(
      albumDateRangeLabel([
        { occurredSortKey: Date.parse('2026-12-01'), dateLabel: '2026年12月1日' },
        { occurredSortKey: Date.parse('2026-01-02'), dateLabel: '2026年1月2日' },
        { occurredSortKey: null, dateLabel: '记录于 2025年1月1日' },
      ]),
    ).toBe('2026年1月2日 — 2026年12月1日');
  });

  it('omits duration when the original length is missing', () => {
    expect(formatAlbumAudioDuration(null)).toBeNull();
    expect(formatAlbumAudioDuration(0)).toBeNull();
    expect(formatAlbumAudioDuration(8000)).toBe('8秒');
  });
});
