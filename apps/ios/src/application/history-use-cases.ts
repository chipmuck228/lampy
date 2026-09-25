import {
  calendarDayBounds,
  calendarMonthBounds,
  calendarPartsAt,
  calendarYearBounds,
  daysInMonth,
  isValidCalendarDay,
  parseMillis,
  type HistoryClock,
} from '../domain-adapters/calendar';
import type { MomentRecord } from '../domain-adapters/moment-commands';
import {
  DAY_PRECISIONS,
  PLACED_PRECISIONS,
  type MomentRepository,
} from '../infrastructure/repositories';
import {
  projectHistoryDay,
  projectHistoryMonthFromCounts,
  projectHistoryUnconfirmed,
  projectHistoryYearFromCounts,
  projectHistoryYearIndexFromCounts,
  toListedMoment,
  type HistoryDayView,
  type HistoryListedMoment,
  type HistoryUnconfirmedView,
} from '../projections/history-projection';
import { projectFeeling, type FeelingView } from './feeling';
import type { AudioView, ImageView, UnknownMediaView } from './use-cases';

export const HISTORY_PAGE_SIZE = 50;

export type HistoryMomentItem = HistoryListedMoment & {
  feeling: FeelingView | null;
  images: ImageView[];
  audio: AudioView | null;
  unknownMedia: UnknownMediaView[];
};

export type HistoryDayViewModel = Omit<HistoryDayView, 'items'> & {
  items: HistoryMomentItem[];
  hasMore: boolean;
};

export type HistoryUnconfirmedViewModel = Omit<HistoryUnconfirmedView, 'items'> & {
  items: HistoryMomentItem[];
};

export function createHistoryUseCases(deps: {
  moments: MomentRepository;
  timezone?: HistoryClock;
  timezoneOffsetMinutes?: number;
  resolveImages: (assetIds: string[]) => Promise<ImageView[]>;
  resolveAudio: (assetIds: string[]) => Promise<AudioView | null>;
  resolveUnknown: (assetIds: string[]) => Promise<UnknownMediaView[]>;
}) {
  const clock: HistoryClock = deps.timezone ?? deps.timezoneOffsetMinutes ?? { timeZone: deviceTimeZone() };

  async function decorate(moments: MomentRecord[]): Promise<HistoryMomentItem[]> {
    const decorated: HistoryMomentItem[] = [];
    for (const moment of moments) {
      decorated.push({
        ...toListedMoment(moment, clock),
        feeling: projectFeeling(moment.content.emotion),
        images: await deps.resolveImages(moment.assetIds),
        audio: await deps.resolveAudio(moment.assetIds),
        unknownMedia: await deps.resolveUnknown(moment.assetIds),
      });
    }
    return decorated;
  }

  async function getHistoryYears() {
    const [span, unknownCount] = await Promise.all([
      deps.moments.occurredAtSpan(PLACED_PRECISIONS),
      deps.moments.countActiveUnknown(),
    ]);
    if (!span) {
      return projectHistoryYearIndexFromCounts([], unknownCount);
    }
    const startMillis = parseMillis(span.minIso);
    const endMillis = parseMillis(span.maxIso);
    if (startMillis === null || endMillis === null) {
      return projectHistoryYearIndexFromCounts([], unknownCount);
    }
    const startYear = calendarPartsAt(startMillis, clock).year;
    const endYear = calendarPartsAt(endMillis, clock).year;
    const years: { year: number; momentCount: number }[] = [];
    for (let year = endYear; year >= startYear; year -= 1) {
      const bounds = calendarYearBounds(year, clock);
      const momentCount = await deps.moments.countActiveOccurred({
        startIso: bounds.startIso,
        endIso: bounds.endIso,
        precisions: PLACED_PRECISIONS,
      });
      if (momentCount > 0) years.push({ year, momentCount });
    }
    return projectHistoryYearIndexFromCounts(years, unknownCount);
  }

  async function getHistoryYear(year: number) {
    if (!Number.isInteger(year) || year < 1 || year > 9999) return { invalid: true as const };
    const monthCounts = [];
    for (let month = 1; month <= 12; month += 1) {
      const bounds = calendarMonthBounds(year, month, clock);
      monthCounts.push(
        await deps.moments.countActiveOccurred({
          startIso: bounds.startIso,
          endIso: bounds.endIso,
          precisions: ['exact', 'day', 'month'],
        }),
      );
    }
    const yearBounds = calendarYearBounds(year, clock);
    const yearUnconfirmedCount = await deps.moments.countActiveOccurred({
      startIso: yearBounds.startIso,
      endIso: yearBounds.endIso,
      precisions: ['year'],
    });
    return projectHistoryYearFromCounts(year, monthCounts, yearUnconfirmedCount);
  }

  async function getHistoryMonth(year: number, month: number) {
    if (!Number.isInteger(year) || month < 1 || month > 12) return { invalid: true as const };
    const lastDay = daysInMonth(year, month);
    const dayCounts = [];
    for (let day = 1; day <= lastDay; day += 1) {
      const bounds = calendarDayBounds(year, month, day, clock);
      dayCounts.push(
        await deps.moments.countActiveOccurred({
          startIso: bounds.startIso,
          endIso: bounds.endIso,
          precisions: DAY_PRECISIONS,
        }),
      );
    }
    const monthBounds = calendarMonthBounds(year, month, clock);
    const dayUnconfirmedCount = await deps.moments.countActiveOccurred({
      startIso: monthBounds.startIso,
      endIso: monthBounds.endIso,
      precisions: ['month'],
    });
    return projectHistoryMonthFromCounts(year, month, dayCounts, dayUnconfirmedCount);
  }

  async function getHistoryDay(year: number, month: number, day: number, offset = 0) {
    if (!isValidCalendarDay(year, month, day)) return { invalid: true as const };
    const bounds = calendarDayBounds(year, month, day, clock);
    const page = await deps.moments.listActiveOccurred({
      startIso: bounds.startIso,
      endIso: bounds.endIso,
      precisions: DAY_PRECISIONS,
      limit: HISTORY_PAGE_SIZE,
      offset,
      order: 'occurred-asc',
    });
    const view = projectHistoryDay(page.items, year, month, day, clock);
    return {
      ...view,
      items: await decorate(page.items),
      hasMore: page.hasMore,
    };
  }

  async function getHistoryUnknown(offset = 0) {
    const page = await deps.moments.listActiveUnknown(HISTORY_PAGE_SIZE, offset);
    const view = projectHistoryUnconfirmed(page.items, { kind: 'unknown' }, clock, page.hasMore);
    return { ...view, items: await decorate(page.items) };
  }

  async function getHistoryYearUnconfirmed(year: number, offset = 0) {
    if (!Number.isInteger(year)) return { invalid: true as const };
    const bounds = calendarYearBounds(year, clock);
    const page = await deps.moments.listActiveOccurred({
      startIso: bounds.startIso,
      endIso: bounds.endIso,
      precisions: ['year'],
      limit: HISTORY_PAGE_SIZE,
      offset,
      order: 'occurred-asc',
    });
    const view = projectHistoryUnconfirmed(page.items, { kind: 'year', year }, clock, page.hasMore);
    return { ...view, items: await decorate(page.items) };
  }

  async function getHistoryMonthUnconfirmed(year: number, month: number, offset = 0) {
    if (month < 1 || month > 12) return { invalid: true as const };
    const bounds = calendarMonthBounds(year, month, clock);
    const page = await deps.moments.listActiveOccurred({
      startIso: bounds.startIso,
      endIso: bounds.endIso,
      precisions: ['month'],
      limit: HISTORY_PAGE_SIZE,
      offset,
      order: 'occurred-asc',
    });
    const view = projectHistoryUnconfirmed(
      page.items,
      { kind: 'month', year, month },
      clock,
      page.hasMore,
    );
    return { ...view, items: await decorate(page.items) };
  }

  return {
    getHistoryYears,
    getHistoryYear,
    getHistoryMonth,
    getHistoryDay,
    getHistoryUnknown,
    getHistoryYearUnconfirmed,
    getHistoryMonthUnconfirmed,
  };
}

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
