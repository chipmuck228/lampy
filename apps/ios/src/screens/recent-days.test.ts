import { groupRecentDays, recentDayHeading, recentDayKey } from './recent-days';

function at(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour).toISOString();
}

const now = new Date(2026, 8, 27, 12);

describe('groupRecentDays', () => {
  it('shares one date heading for consecutive items on the same calendar day', () => {
    const groups = groupRecentDays(
      [
        { id: 'a', dateLabel: '9月27日', recordedAt: at(2026, 9, 27, 10) },
        { id: 'b', dateLabel: '9月27日', recordedAt: at(2026, 9, 27, 16) },
        { id: 'c', dateLabel: '9月24日', recordedAt: at(2026, 9, 24) },
      ],
      now,
    );
    expect(groups.map((group) => ({ key: group.key, dateLabel: group.dateLabel, ids: group.items.map((item) => item.id) }))).toEqual([
      { key: recentDayKey(at(2026, 9, 27, 10)), dateLabel: '9月27日', ids: ['a', 'b'] },
      { key: recentDayKey(at(2026, 9, 24)), dateLabel: '9月24日', ids: ['c'] },
    ]);
  });

  it('does not merge the same month-day from different years', () => {
    const groups = groupRecentDays(
      [
        { id: 'this-year', dateLabel: '9月27日', recordedAt: at(2026, 9, 27) },
        { id: 'last-year', dateLabel: '9月27日', recordedAt: at(2025, 9, 27) },
      ],
      now,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].dateLabel).toBe('9月27日');
    expect(groups[1].dateLabel).toBe('2025年9月27日');
    expect(groups[0].key).not.toBe(groups[1].key);
  });

  it('does not invent a day when the list is empty', () => {
    expect(groupRecentDays([])).toEqual([]);
  });

  it('keeps an unreadable time out of a calendar day', () => {
    expect(recentDayHeading('not-a-date', now)).toBe('时间未确认');
    expect(recentDayKey('not-a-date')).toBe('unknown');
  });
});
