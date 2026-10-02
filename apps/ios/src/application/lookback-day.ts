import type { HistoryMomentItem } from './history-use-cases';

export type LookbackDayEntry = {
  id: string;
  clockLabel: string | null;
  note: string;
  recordedLabel: string | null;
  feeling: HistoryMomentItem['feeling'];
  images: HistoryMomentItem['images'];
  audio: HistoryMomentItem['audio'];
  unknownMedia: HistoryMomentItem['unknownMedia'];
};

export function lookbackDayClockLabel(precision: string, timeLabel: string): string | null {
  if (precision !== 'exact') return null;
  const match = /(?:\s)(\d{1,2}:\d{2})$/.exec(timeLabel);
  return match?.[1] ?? null;
}

export function lookbackDayEntries(items: HistoryMomentItem[]): LookbackDayEntry[] {
  return items.map((item) => ({
    id: item.id,
    clockLabel: lookbackDayClockLabel(item.precision, item.timeLabel),
    note: item.note,
    recordedLabel: item.recordedElsewhereLabel ?? item.recordedFallbackLabel ?? null,
    feeling: item.feeling,
    images: item.images,
    audio: item.audio,
    unknownMedia: item.unknownMedia,
  }));
}
