import { lookbackBookWeekdayName } from '../application/lookback-book';
import { pad2, parseMillis } from '../domain-adapters/calendar';

/** Attachment Recent canvas. Screen-only; do not reuse on Lookback. */
export const recentPaper = '#F8F6EF';
export const recentInk = '#373B34';
export const recentInkSoft = '#9D9F91';
export const recentSage = '#7C8272';
export const recentOlive = '#424B3C';
export const recentHairline = '#E4E4DB';
export const recentRule = '#DCDED3';
export const recentOccurred = '#8C7863';
export const recentFeelingInk = '#8C907C';
export const recentOpenInk = '#7B8073';
export const recentKicker = '#9B9D8F';
export const recentPrefixInk = '#9C9E90';
export const recentWeekdayInk = '#8B8E80';
export const recentYearInk = '#A8AB9E';
export const recentEndInk = '#A3A699';
export const recentSettings = '#55594D';

export const recentSerif = 'Songti SC';
export const recentSans = 'PingFang SC';

/**
 * Attachment Recent hierarchy, in iOS points.
 * CSS px on the 390-wide web frame (note 13 / meta 10) reads too small on device.
 * Record copy uses the same file's reading sizes: compose 17, detail 15.
 */
export const recentType = {
  kicker: {
    fontFamily: recentSans,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.4,
    fontWeight: '600' as const,
  },
  title: {
    fontFamily: recentSerif,
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: 2.6,
    fontWeight: '600' as const,
  },
  prefix: {
    fontFamily: recentSans,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    fontWeight: '600' as const,
  },
  date: {
    fontFamily: recentSerif,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: 0.88,
    fontWeight: '600' as const,
  },
  weekday: {
    fontFamily: recentSans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
  year: {
    fontFamily: recentSans,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.96,
  },
  meta: {
    fontFamily: recentSans,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0.52,
  },
  note: {
    fontFamily: recentSerif,
    fontSize: 17,
    lineHeight: 35,
    letterSpacing: 0.6,
  },
  expand: {
    fontFamily: recentSans,
    fontSize: 15,
    lineHeight: 22,
  },
  feeling: {
    fontFamily: recentSans,
    fontSize: 15,
    lineHeight: 22,
  },
  open: {
    fontFamily: recentSans,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0.26,
  },
  fab: {
    fontFamily: recentSans,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 1.12,
  },
  end: {
    fontFamily: recentSerif,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0.78,
  },
} as const;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function recentDayHeading(
  key: string,
  label: string,
): {
  prefix: string;
  date: string;
  weekday: string | null;
  year: string | null;
} {
  const matched = DAY_KEY.exec(key);
  if (!matched) {
    const rest = label.replace(/^记录于\s*/, '');
    return { prefix: '记录于', date: rest || label, weekday: null, year: null };
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  return {
    prefix: '记录于',
    date: `${month}月${day}日`,
    weekday: lookbackBookWeekdayName(year, month, day),
    year: String(year),
  };
}

export function recentRecordedClock(recordedAt?: string | null): string | null {
  if (!recordedAt) return null;
  const millis = parseMillis(recordedAt);
  if (millis == null) return null;
  const at = new Date(millis);
  if (Number.isNaN(at.getTime())) return null;
  return `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
}
