import {
  calendarDayBounds,
  calendarMonthBounds,
  calendarYearBounds,
  deviceTimezoneOffsetMinutes,
  isValidCalendarDay,
} from '../domain-adapters/calendar';
import type { AssetRepository, MomentRepository } from '../infrastructure/repositories';
import type { MediaStore } from '../infrastructure/media';
import {
  placeMomentForHistory,
  projectHistoryDay,
  projectHistoryMonth,
  projectHistoryUnconfirmed,
  projectHistoryYear,
  projectHistoryYearIndex,
  type HistoryDayView,
  type HistoryListedMoment,
  type HistoryMonthView,
  type HistoryUnconfirmedView,
  type HistoryYearView,
  type HistoryYearsView,
} from '../projections/history-projection';
import type { ImageView } from './use-cases';

export const HISTORY_PAGE_SIZE = 50;

export type HistoryMomentItem = HistoryListedMoment & {
  images: ImageView[];
  unknownMedia: { id: string; status: 'unavailable'; label: string; unavailableLabel: string }[];
};

export type HistoryDayViewModel = Omit<HistoryDayView, 'items'> & {
  items: HistoryMomentItem[];
};

export type HistoryUnconfirmedViewModel = Omit<HistoryUnconfirmedView, 'items'> & {
  items: HistoryMomentItem[];
};

export function createHistoryUseCases(deps: {
  moments: MomentRepository;
  assets?: AssetRepository;
  media?: MediaStore;
  timezoneOffsetMinutes?: number;
  resolveImages: (assetIds: string[]) => Promise<ImageView[]>;
}) {
  const timezoneOffsetMinutes =
    deps.timezoneOffsetMinutes ?? deviceTimezoneOffsetMinutes();

  async function decorate(items: HistoryListedMoment[]): Promise<HistoryMomentItem[]> {
    const decorated: HistoryMomentItem[] = [];
    for (const item of items) {
      const found = await deps.moments.findById(item.id);
      if (found.kind !== 'ready') {
        decorated.push({
          ...item,
          images: [],
          unknownMedia: [],
        });
        continue;
      }
      decorated.push({
        ...item,
        images: await deps.resolveImages(found.moment.assetIds),
        unknownMedia: [],
      });
    }
    return decorated;
  }

  async function getHistoryYears(): Promise<HistoryYearsView> {
    const [occurredAtValues, unknownCount] = await Promise.all([
      deps.moments.listActiveOccurredAtValues(),
      deps.moments.countActiveUnknown(),
    ]);
    return projectHistoryYearIndex(occurredAtValues, unknownCount, timezoneOffsetMinutes);
  }

  async function getHistoryYear(year: number): Promise<HistoryYearView | { invalid: true }> {
    if (!Number.isInteger(year) || year < 1 || year > 9999) return { invalid: true };
    const bounds = calendarYearBounds(year, timezoneOffsetMinutes);
    const moments = await deps.moments.listActiveOccurredBetween(bounds.startIso, bounds.endIso);
    return projectHistoryYear(moments, year, timezoneOffsetMinutes);
  }

  async function getHistoryMonth(
    year: number,
    month: number,
  ): Promise<HistoryMonthView | { invalid: true }> {
    if (!Number.isInteger(year) || month < 1 || month > 12) return { invalid: true };
    const bounds = calendarMonthBounds(year, month, timezoneOffsetMinutes);
    const moments = await deps.moments.listActiveOccurredBetween(bounds.startIso, bounds.endIso);
    return projectHistoryMonth(moments, year, month, timezoneOffsetMinutes);
  }

  async function getHistoryDay(
    year: number,
    month: number,
    day: number,
  ): Promise<HistoryDayViewModel | { invalid: true }> {
    if (!isValidCalendarDay(year, month, day)) return { invalid: true };
    const bounds = calendarDayBounds(year, month, day, timezoneOffsetMinutes);
    const moments = await deps.moments.listActiveOccurredBetween(bounds.startIso, bounds.endIso);
    const view = projectHistoryDay(moments, year, month, day, timezoneOffsetMinutes);
    return { ...view, items: await decorate(view.items) };
  }

  async function getHistoryUnknown(offset = 0): Promise<HistoryUnconfirmedViewModel> {
    const page = await deps.moments.listActiveUnknown(HISTORY_PAGE_SIZE, offset);
    const view = projectHistoryUnconfirmed(
      page.items,
      { kind: 'unknown' },
      timezoneOffsetMinutes,
      page.hasMore,
    );
    return { ...view, items: await decorate(view.items) };
  }

  async function getHistoryYearUnconfirmed(
    year: number,
    offset = 0,
  ): Promise<HistoryUnconfirmedViewModel | { invalid: true }> {
    if (!Number.isInteger(year)) return { invalid: true };
    const bounds = calendarYearBounds(year, timezoneOffsetMinutes);
    const moments = (await deps.moments.listActiveOccurredBetween(bounds.startIso, bounds.endIso)).filter(
      (moment) => {
        const place = placeMomentForHistory(moment, timezoneOffsetMinutes);
        return place.kind === 'year' && place.year === year;
      },
    );
    const sliced = moments.slice(offset, offset + HISTORY_PAGE_SIZE);
    const view = projectHistoryUnconfirmed(
      sliced,
      { kind: 'year', year },
      timezoneOffsetMinutes,
      moments.length > offset + HISTORY_PAGE_SIZE,
    );
    return { ...view, items: await decorate(view.items) };
  }

  async function getHistoryMonthUnconfirmed(
    year: number,
    month: number,
    offset = 0,
  ): Promise<HistoryUnconfirmedViewModel | { invalid: true }> {
    if (month < 1 || month > 12) return { invalid: true };
    const bounds = calendarMonthBounds(year, month, timezoneOffsetMinutes);
    const moments = (await deps.moments.listActiveOccurredBetween(bounds.startIso, bounds.endIso)).filter(
      (moment) => {
        const place = placeMomentForHistory(moment, timezoneOffsetMinutes);
        return place.kind === 'month' && place.year === year && place.month === month;
      },
    );
    const sliced = moments.slice(offset, offset + HISTORY_PAGE_SIZE);
    const view = projectHistoryUnconfirmed(
      sliced,
      { kind: 'month', year, month },
      timezoneOffsetMinutes,
      moments.length > offset + HISTORY_PAGE_SIZE,
    );
    return { ...view, items: await decorate(view.items) };
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
