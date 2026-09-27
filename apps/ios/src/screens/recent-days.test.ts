import { groupRecentDays } from './recent-days';

describe('groupRecentDays', () => {
  it('uses the ViewModel day key, not the visible month-day', () => {
    const groups = groupRecentDays([
      { id: 'a', dayKey: '2026-09-27', dayLabel: '9月27日' },
      { id: 'b', dayKey: '2026-09-27', dayLabel: '9月27日' },
      { id: 'c', dayKey: '2025-09-27', dayLabel: '2025年9月27日' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe('2026-09-27');
    expect(groups[0].label).toBe('9月27日');
    expect(groups[0].items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(groups[1].key).toBe('2025-09-27');
    expect(groups[1].label).toBe('2025年9月27日');
  });
});
