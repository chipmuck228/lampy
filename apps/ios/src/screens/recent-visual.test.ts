import { recentDayHeading, recentRecordedClock, recentType } from './recent-visual';

describe('recent visual presentation', () => {
  it('splits a dated heading the way the Recent attachment does', () => {
    expect(recentDayHeading('2026-09-27', '记录于 9月27日')).toEqual({
      prefix: '记录于',
      date: '9月27日',
      weekday: '星期日',
      year: '2026',
    });
    expect(recentDayHeading('2025-09-27', '记录于 2025年9月27日')).toEqual({
      prefix: '记录于',
      date: '9月27日',
      weekday: '星期六',
      year: '2025',
    });
    expect(recentDayHeading('unknown', '记录于 时间未确认')).toEqual({
      prefix: '记录于',
      date: '时间未确认',
      weekday: null,
      year: null,
    });
  });

  it('paints the recorded clock from the stored instant without inventing a day', () => {
    expect(recentRecordedClock(new Date(2026, 8, 27, 16, 42).toISOString())).toBe('16:42');
    expect(recentRecordedClock('not-a-time')).toBeNull();
  });

  it('keeps the attachment Recent type sizes', () => {
    expect(recentType.title.fontSize).toBe(29);
    expect(recentType.date.fontSize).toBe(19);
    expect(recentType.note.fontSize).toBe(13);
    expect(recentType.note.lineHeight).toBe(27);
    expect(recentType.kicker.fontSize).toBe(10);
    expect(recentType.open.fontSize).toBe(10);
  });
});
