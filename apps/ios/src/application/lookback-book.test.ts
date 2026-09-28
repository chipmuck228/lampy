import {
  resetLookbackSessionForTests,
  takeLookbackBookIntent,
  writeLookbackBookIntent,
} from './lookback-session';
import {
  LOOKBACK_BOOK_EXCERPT_LIMIT,
  lookbackBookDateLabel,
  lookbackBookExcerpts,
  lookbackBookHref,
  lookbackBookIntentFromParts,
  lookbackBookLocateId,
  lookbackBookMonthOpenable,
  lookbackBookRemaining,
  lookbackBookResponseIsCurrent,
} from './lookback-book';
import type { HistoryMomentItem } from './history-use-cases';

function item(id: string, note: string, images = 0): HistoryMomentItem {
  return {
    id,
    note,
    precision: 'day',
    timeLabel: '2026年9月27日',
    usedRecordedAtFallback: false,
    feeling: null,
    images: Array.from({ length: images }, (_, index) => ({
      id: `${id}_img_${index}`,
      status: 'available' as const,
      uri: `memory://${id}_${index}.jpg`,
      width: 800,
      height: 600,
      label: `照片 ${index + 1}/${images}`,
    })),
    audio: null,
    unknownMedia: [],
  };
}

describe('lookback book contract', () => {
  it('parses year, month, and day intents from this request only', () => {
    expect(lookbackBookIntentFromParts({ year: '2026' })).toEqual({ year: 2026 });
    expect(lookbackBookIntentFromParts({ year: '2026', month: '09' })).toEqual({ year: 2026, month: 9 });
    expect(lookbackBookIntentFromParts({ year: '2026', month: '09', day: '24' })).toEqual({
      year: 2026,
      month: 9,
      day: 24,
    });
    expect(lookbackBookIntentFromParts({ year: 'nope' })).toBeNull();
    expect(lookbackBookIntentFromParts({ year: '2026', month: '13' })).toEqual({ year: 2026 });
    expect(lookbackBookIntentFromParts({ year: '2026', month: '02', day: '31' })).toEqual({
      year: 2026,
      month: 2,
    });
  });

  it('keeps the visible book href on /lookback', () => {
    expect(lookbackBookHref()).toBe('/lookback');
    expect(lookbackBookHref('lb1')).toBe('/lookback?o=lb1');
  });

  it('writes weekday on the date row and does not invent a calendar', () => {
    expect(lookbackBookDateLabel(2026, 9, 27)).toBe('9月27日 · 星期日');
    expect(lookbackBookDateLabel(2026, 9, 28)).toBe('9月28日 · 星期一');
  });

  it('opens a month that has days or only month-precision records', () => {
    expect(lookbackBookMonthOpenable({ dayCount: 1, dayUnconfirmedCount: 0 })).toBe(true);
    expect(lookbackBookMonthOpenable({ dayCount: 0, dayUnconfirmedCount: 2 })).toBe(true);
    expect(lookbackBookMonthOpenable({ dayCount: 0, dayUnconfirmedCount: 0 })).toBe(false);
  });

  it('takes the day-page order and keeps N as total minus shown', () => {
    const items = [item('a', '一'), item('b', '二'), item('c', '三')];
    const shown = lookbackBookExcerpts(items);
    expect(LOOKBACK_BOOK_EXCERPT_LIMIT).toBe(2);
    expect(shown.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(lookbackBookRemaining(11, shown.length)).toBe(9);
    expect(lookbackBookRemaining(1, 1)).toBe(0);
  });

  it('consumes a book intent once and does not reuse a previous process value', () => {
    resetLookbackSessionForTests();
    expect(takeLookbackBookIntent()).toBeNull();
    writeLookbackBookIntent({ year: 2026, month: 9, day: 24 });
    expect(takeLookbackBookIntent()).toEqual({ year: 2026, month: 9, day: 24 });
    expect(takeLookbackBookIntent()).toBeNull();
  });

  it('names the year, month, or day locate target from this intent', () => {
    expect(lookbackBookLocateId({ year: 2024 })).toBe('year-2024');
    expect(lookbackBookLocateId({ year: 2026, month: 9 })).toBe('month-2026-09');
    expect(lookbackBookLocateId({ year: 2026, month: 9, day: 24 })).toBe('day-2026-09-24');
  });

  it('accepts only the latest request generation', () => {
    expect(lookbackBookResponseIsCurrent(2, 1)).toBe(false);
    expect(lookbackBookResponseIsCurrent(2, 2)).toBe(true);
  });

  it('keeps one photo on the excerpt and the exact moment id', () => {
    const shown = lookbackBookExcerpts([item('m_three', '三张', 3)]);
    expect(shown[0].id).toBe('m_three');
    expect(shown[0].images).toHaveLength(1);
    expect(shown[0].extraImageCount).toBe(2);
  });
});
