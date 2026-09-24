import {
  calendarDayBounds,
  calendarMonthBounds,
  calendarPartsAt,
  calendarYearBounds,
} from './calendar';

const NEW_YORK = { timeZone: 'America/New_York' };

describe('calendar bounds with DST', () => {
  it('uses a 23-hour spring-forward day in America/New_York', () => {
    const bounds = calendarDayBounds(2026, 3, 8, NEW_YORK);
    expect(bounds.startIso).toBe('2026-03-08T05:00:00.000Z');
    expect(bounds.endIso).toBe('2026-03-09T04:00:00.000Z');
    expect(calendarPartsAt(Date.parse(bounds.startIso), NEW_YORK)).toEqual({
      year: 2026,
      month: 3,
      day: 8,
    });
    expect(calendarPartsAt(Date.parse(bounds.endIso) - 1, NEW_YORK)).toEqual({
      year: 2026,
      month: 3,
      day: 8,
    });
    expect(calendarPartsAt(Date.parse(bounds.endIso), NEW_YORK)).toEqual({
      year: 2026,
      month: 3,
      day: 9,
    });
  });

  it('uses a 25-hour fall-back day in America/New_York', () => {
    const bounds = calendarDayBounds(2026, 11, 1, NEW_YORK);
    expect(bounds.startIso).toBe('2026-11-01T04:00:00.000Z');
    expect(bounds.endIso).toBe('2026-11-02T05:00:00.000Z');
    expect(calendarPartsAt(Date.parse('2026-11-01T08:30:00.000Z'), NEW_YORK)).toEqual({
      year: 2026,
      month: 11,
      day: 1,
    });
    expect(calendarPartsAt(Date.parse('2026-11-02T04:59:59.000Z'), NEW_YORK)).toEqual({
      year: 2026,
      month: 11,
      day: 1,
    });
    expect(calendarPartsAt(Date.parse('2026-11-02T05:00:00.000Z'), NEW_YORK)).toEqual({
      year: 2026,
      month: 11,
      day: 2,
    });
  });

  it('does not keep a frozen offset across the spring change', () => {
    const frozenEastern = calendarDayBounds(2026, 3, 8, -300);
    expect(frozenEastern.endIso).toBe('2026-03-09T05:00:00.000Z');
    const local = calendarDayBounds(2026, 3, 8, NEW_YORK);
    expect(local.endIso).toBe('2026-03-09T04:00:00.000Z');
    expect(local.endIso).not.toBe(frozenEastern.endIso);
  });

  it('keeps March and April month bounds on the actual local midnights', () => {
    const march = calendarMonthBounds(2026, 3, NEW_YORK);
    expect(march.startIso).toBe('2026-03-01T05:00:00.000Z');
    expect(march.endIso).toBe('2026-04-01T04:00:00.000Z');
    const year = calendarYearBounds(2026, NEW_YORK);
    expect(year.startIso).toBe('2026-01-01T05:00:00.000Z');
    expect(year.endIso).toBe('2027-01-01T05:00:00.000Z');
  });
});
