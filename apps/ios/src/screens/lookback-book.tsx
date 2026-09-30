import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  LOOKBACK_BOOK_NOTE_LINES,
  lookbackBookDateLabel,
  lookbackBookMonthAccessLabel,
  type LookbackBookExcerpt,
  type LookbackBookYear,
} from '../application/lookback-book';
import type { LookbackMonthEntry } from '../application/lookback-month';
import { pad2 } from '../domain-adapters/calendar';
import type { PlaybackStatus } from '../infrastructure/media';
import { hairline } from './life-page';
import { LifeIcon, LookThisHit } from './life-icons';
import { MomentAudio, MomentUnknownMedia } from './moment-audio';
import { MomentFeeling } from './moment-feeling';
import { MomentImages } from './moment-images';

export function LookbackBookYearChapter({
  chapter,
  children,
}: {
  chapter: LookbackBookYear;
  children?: ReactNode;
}) {
  return (
    <View testID={`lookback-book-year-${chapter.year}`} style={styles.chapter}>
      <Text style={styles.chapterTitle} accessibilityRole="header">
        {chapter.title}
      </Text>
      <Text style={styles.meta} accessibilityLabel={`有${chapter.momentCount}条记录`}>
        {chapter.momentCount}条
      </Text>
      {children}
    </View>
  );
}

export function LookbackBookMonthRow({
  year,
  month,
  count,
  summary,
  expanded,
  onPress,
}: {
  year: number;
  month: number;
  count: number;
  summary: string;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={lookbackBookMonthAccessLabel(year, month, summary, expanded)}
      testID={`lookback-book-month-${year}-${pad2(month)}`}
      onPress={onPress}
      style={styles.monthHit}
    >
      <View style={styles.monthRow}>
        <View style={styles.monthCopy}>
          <Text style={styles.monthTitle}>{month}月</Text>
          <Text style={styles.monthCount}>{count}条</Text>
        </View>
        <LifeIcon name={expanded ? 'collapse' : 'expand'} size={16} decorative />
      </View>
    </Pressable>
  );
}

export function LookbackBookDayRow({
  year,
  month,
  entry,
  selected,
  onPress,
}: {
  year: number;
  month: number;
  entry: LookbackMonthEntry;
  selected: boolean;
  onPress: () => void;
}) {
  const weekday = lookbackBookDateLabel(year, month, entry.day);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${weekday}，${entry.summary}`}
      testID={`lookback-book-day-${year}-${pad2(month)}-${pad2(entry.day)}`}
      onPress={onPress}
      style={styles.dayHit}
    >
      <View style={styles.dayRow}>
        <Text style={styles.dayTitle}>{weekday}</Text>
        <Text style={styles.dayCount}>{entry.count}条</Text>
      </View>
    </Pressable>
  );
}

export function LookbackBookExcerptBlock({
  excerpt,
  listen,
  onPlay,
  onPause,
  onOpen,
}: {
  excerpt: LookbackBookExcerpt;
  listen: { status: PlaybackStatus; currentTimeMs: number };
  onPlay: () => void;
  onPause: () => void;
  onOpen: (id: string) => void;
}) {
  const imageHint = excerpt.extraImageCount > 0 ? `共${excerpt.images.length + excerpt.extraImageCount}张` : null;
  return (
    <View testID={`lookback-book-excerpt-${excerpt.id}`} style={styles.excerpt}>
      {excerpt.clockLabel ? <Text style={styles.clock}>{excerpt.clockLabel}</Text> : null}
      {excerpt.note ? (
        <Text style={styles.note} numberOfLines={LOOKBACK_BOOK_NOTE_LINES}>
          {excerpt.note}
        </Text>
      ) : null}
      <MomentImages images={excerpt.images} testIDPrefix={`lookback-book-image-${excerpt.id}`} />
      {imageHint ? <Text style={styles.meta}>{imageHint}</Text> : null}
      <MomentAudio
        audio={excerpt.audio}
        playbackStatus={listen.status}
        currentTimeMs={listen.currentTimeMs}
        onPlay={onPlay}
        onPause={onPause}
        testIDPrefix={`lookback-book-sound-${excerpt.id}`}
        compact
      />
      <MomentUnknownMedia items={excerpt.unknownMedia} testIDPrefix={`lookback-book-unknown-${excerpt.id}`} />
      <MomentFeeling feeling={excerpt.feeling ?? null} testID={`lookback-book-feeling-${excerpt.id}`} />
      <LookThisHit
        accessibilityLabel={`看这条，${excerpt.note || excerpt.id}`}
        testID={`lookback-book-open-${excerpt.id}`}
        tight
        onPress={() => onOpen(excerpt.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chapter: { gap: 8, marginTop: 8 },
  chapterTitle: { fontSize: 22, color: '#25231F' },
  meta: { fontSize: 14, color: '#53604F' },
  clock: { fontSize: 14, color: '#53604F' },
  note: { fontSize: 20, color: '#25231F' },
  excerpt: {
    gap: 4,
    paddingTop: 4,
    paddingBottom: 12,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: hairline,
  },
  monthHit: { minHeight: 48, justifyContent: 'center' },
  monthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  monthCopy: { flex: 1, flexShrink: 1, minWidth: 0, gap: 2 },
  monthTitle: { fontSize: 20, color: '#25231F' },
  monthCount: { fontSize: 14, color: '#53604F' },
  dayHit: { minHeight: 48, justifyContent: 'center' },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  dayTitle: { flex: 1, flexShrink: 1, minWidth: 0, fontSize: 17, color: '#25231F' },
  dayCount: { fontSize: 14, color: '#53604F' },
});
