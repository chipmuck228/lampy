import { lookbackDayClockLabel, lookbackDayEntries } from './lookback-day';
import type { HistoryMomentItem } from './history-use-cases';

function item(partial: Partial<HistoryMomentItem> & Pick<HistoryMomentItem, 'id' | 'precision' | 'timeLabel'>): HistoryMomentItem {
  return {
    note: '',
    usedRecordedAtFallback: false,
    feeling: null,
    images: [],
    audio: null,
    unknownMedia: [],
    ...partial,
  };
}

describe('lookback day entries', () => {
  it('shows a clock only for exact precision and never invents one for day precision', () => {
    expect(lookbackDayClockLabel('exact', '2026年9月24日 08:15')).toBe('08:15');
    expect(lookbackDayClockLabel('day', '2026年9月24日')).toBeNull();
    expect(lookbackDayClockLabel('day', '2026年9月24日 09:00')).toBeNull();
    expect(lookbackDayClockLabel('unknown', '时间未确认')).toBeNull();
  });

  it('keeps same-day multiples as separate entries under one shared date', () => {
    const entries = lookbackDayEntries([
      item({ id: 'a', precision: 'exact', timeLabel: '2026年9月24日 08:15', note: '门口的风' }),
      item({ id: 'b', precision: 'day', timeLabel: '2026年9月24日', note: '后来又写了一句' }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: 'a', clockLabel: '08:15', note: '门口的风', recordedLabel: null });
    expect(entries[1]).toMatchObject({ id: 'b', clockLabel: null, note: '后来又写了一句' });
  });

  it('keeps a recorded-time note when it is not the same as the occurred day', () => {
    const entries = lookbackDayEntries([
      item({
        id: 'mix',
        precision: 'day',
        timeLabel: '2026年9月28日',
        note: '长混合',
        recordedElsewhereLabel: '记录于 10月1日',
      }),
    ]);
    expect(entries[0].recordedLabel).toBe('记录于 10月1日');
  });
});
