import { calendarDayBounds } from '../domain-adapters/calendar';
import { ApplicationError } from './errors';
import {
  OCCURRED_IN_FUTURE_MESSAGE,
  formatOccurredDayLabel,
  occurredInputFromChoice,
  projectOccurredChoice,
  resolveOccurredPatch,
} from './occurred-date';

describe('occurred date choice', () => {
  it('writes viewer-today as the start of that calendar day', () => {
    const now = new Date('2026-09-26T16:30:00.000Z');
    const patch = resolveOccurredPatch({ kind: 'today' }, now, 480);
    expect(patch.occurredAtPrecision).toBe('day');
    expect(patch.occurredAt).toBe(calendarDayBounds(2026, 9, 27, 480).startIso);
    expect(patch.occurredAt).toBe('2026-09-26T16:00:00.000Z');
  });

  it('writes a past calendar day without using recordedAt', () => {
    const now = new Date('2026-09-27T02:00:00.000Z');
    const patch = resolveOccurredPatch({ kind: 'day', year: 2026, month: 9, day: 20 }, now, 480);
    expect(patch.occurredAt).toBe('2026-09-19T16:00:00.000Z');
    expect(patch.occurredAtPrecision).toBe('day');
  });

  it('clears occurrence when the user marks time unknown', () => {
    const patch = resolveOccurredPatch({ kind: 'unknown' }, new Date('2026-09-27T02:00:00.000Z'), 480);
    expect(patch).toEqual({ occurredAt: '', occurredAtPrecision: 'unknown' });
  });

  it('rejects a future calendar day', () => {
    expect(() =>
      resolveOccurredPatch(
        { kind: 'day', year: 2026, month: 9, day: 28 },
        new Date('2026-09-26T16:30:00.000Z'),
        480,
      ),
    ).toThrow(ApplicationError);
    try {
      resolveOccurredPatch(
        { kind: 'day', year: 2026, month: 9, day: 28 },
        new Date('2026-09-26T16:30:00.000Z'),
        480,
      );
    } catch (error) {
      expect(error).toMatchObject({ code: 'OCCURRED_IN_FUTURE', message: OCCURRED_IN_FUTURE_MESSAGE });
    }
  });

  it('treats a stored today as today and a previous day as a fixed date after midnight', () => {
    const occurredAt = '2026-09-26T16:00:00.000Z';
    const sameDay = projectOccurredChoice(
      { occurredAt, occurredAtPrecision: 'day' },
      new Date('2026-09-26T18:00:00.000Z'),
      480,
    );
    expect(sameDay).toEqual({
      kind: 'today',
      year: 2026,
      month: 9,
      day: 27,
      label: '今天',
    });
    const nextDay = projectOccurredChoice(
      { occurredAt, occurredAtPrecision: 'day' },
      new Date('2026-09-27T16:30:00.000Z'),
      480,
    );
    expect(nextDay).toEqual({
      kind: 'day',
      year: 2026,
      month: 9,
      day: 27,
      label: '9月27日',
    });
  });

  it('does not turn missing occurrence into recordedAt', () => {
    expect(
      projectOccurredChoice(
        { occurredAtPrecision: 'unknown' },
        new Date('2026-09-27T02:00:00.000Z'),
        480,
      ),
    ).toEqual({ kind: 'unknown', label: '时间不确定' });
    expect(formatOccurredDayLabel({ year: 2025, month: 12, day: 31 }, { year: 2026, month: 9, day: 27 })).toBe(
      '2025年12月31日',
    );
  });

  it('keeps a confirmed today calendar day instead of re-resolving after midnight', () => {
    expect(
      occurredInputFromChoice({
        kind: 'today',
        year: 2026,
        month: 9,
        day: 27,
        label: '今天',
      }),
    ).toEqual({ kind: 'day', year: 2026, month: 9, day: 27 });
    expect(occurredInputFromChoice({ kind: 'today', label: '今天' })).toEqual({ kind: 'today' });
    expect(occurredInputFromChoice({ kind: 'unknown', label: '时间不确定' })).toEqual({ kind: 'unknown' });
  });
});
