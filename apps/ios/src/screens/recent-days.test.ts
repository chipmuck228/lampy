import { groupRecentDays } from './recent-days';

describe('groupRecentDays', () => {
  it('shares one date heading for consecutive items on the same day', () => {
    const groups = groupRecentDays([
      { id: 'a', dateLabel: '9月27日' },
      { id: 'b', dateLabel: '9月27日' },
      { id: 'c', dateLabel: '9月24日' },
    ]);
    expect(groups).toEqual([
      {
        dateLabel: '9月27日',
        items: [
          { id: 'a', dateLabel: '9月27日' },
          { id: 'b', dateLabel: '9月27日' },
        ],
      },
      { dateLabel: '9月24日', items: [{ id: 'c', dateLabel: '9月24日' }] },
    ]);
  });

  it('does not invent a day when the list is empty', () => {
    expect(groupRecentDays([])).toEqual([]);
  });
});
