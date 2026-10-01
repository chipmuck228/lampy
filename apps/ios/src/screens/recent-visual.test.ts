import { recentDayAccessLabel, recentDayHeading, recentRecordedClock, recentType } from './recent-visual';

describe('recent visual presentation', () => {
  it('splits a dated heading without a recorded-at field label', () => {
    expect(recentDayHeading('2026-09-27', '记录于 9月27日')).toEqual({
      date: '9月27日',
      weekday: '星期日',
      year: '2026',
    });
    expect(recentDayHeading('2025-09-27', '记录于 2025年9月27日')).toEqual({
      date: '9月27日',
      weekday: '星期六',
      year: '2025',
    });
    expect(recentDayHeading('unknown', '记录于 时间未确认')).toEqual({
      date: '时间未确认',
      weekday: null,
      year: null,
    });
    expect(recentDayAccessLabel(recentDayHeading('2026-09-27', '记录于 9月27日'), 2)).toBe(
      '9月27日，星期日，2026，2条记录',
    );
  });

  it('paints the recorded clock from the stored instant without inventing a day', () => {
    expect(recentRecordedClock(new Date(2026, 8, 27, 16, 42).toISOString())).toBe('16:42');
    expect(recentRecordedClock('not-a-time')).toBeNull();
  });

  it('keeps Recent record type on the attachment hierarchy at a readable iOS size', () => {
    expect(recentType.title.fontSize).toBe(29);
    expect(recentType.date.fontSize).toBe(22);
    expect(recentType.note.fontSize).toBe(17);
    expect(recentType.note.lineHeight).toBe(35);
    expect(recentType.meta.fontSize).toBe(13);
    expect(recentType.expand.fontSize).toBe(15);
    expect(recentType.feeling.fontSize).toBe(15);
    expect(recentType.open.fontSize).toBe(13);
  });
});
