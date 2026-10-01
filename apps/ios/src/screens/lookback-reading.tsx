import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, type } from './life-text';

import type { LookbackDayEntry } from '../application/lookback-day';
import {
  lookbackNeighborCaption,
  lookbackReadingCountLabel,
  lookbackReadingDayTitle,
  lookbackReadingDayWeekday,
  type LookbackPlacedDay,
} from '../application/lookback-reading';
import type { PlaybackStatus } from '../infrastructure/media';
import { hairline, ink, sage } from './life-page';
import { LookThisHit } from './life-icons';
import { MomentAudio, MomentUnknownMedia } from './moment-audio';
import { MomentImages } from './moment-images';
import { RecentFeeling } from './recent-feeling';
import { recentNoteIsTruncated, recentNoteVisibleLineLimit, RECENT_NOTE_PREVIEW_LINES } from './recent-note';

export { RECENT_NOTE_PREVIEW_LINES as LOOKBACK_READING_NOTE_LINES };

export function LookbackReadingHeader({
  year,
  month,
  day,
  count,
}: {
  year: number;
  month: number;
  day: number;
  count: number | null;
}) {
  const weekday = lookbackReadingDayWeekday(year, month, day);
  return (
    <View testID="lookback-reading-header" style={styles.header}>
      <Text
        style={styles.dayTitle}
        accessibilityRole="header"
        testID="lookback-reading-title"
        accessibilityLabel={
          count == null
            ? `${year}年${month}月${day}日，${weekday}`
            : `${year}年${month}月${day}日，${weekday}，${lookbackReadingCountLabel(count)}`
        }
      >
        {lookbackReadingDayTitle(year, month, day)}
      </Text>
      <Text style={styles.meta} testID="lookback-reading-weekday">
        {weekday}
      </Text>
      {count != null ? (
        <Text style={styles.meta} testID="lookback-reading-count">
          {lookbackReadingCountLabel(count)}
        </Text>
      ) : null}
    </View>
  );
}

export function LookbackReadingMoment({
  entry,
  pairImages,
  expanded,
  listen,
  onToggleExpand,
  onOpen,
  onPlay,
  onPause,
}: {
  entry: LookbackDayEntry;
  pairImages: boolean;
  expanded: boolean;
  listen: { status: PlaybackStatus; currentTimeMs: number };
  onToggleExpand: () => void;
  onOpen: (id: string) => void;
  onPlay: () => void;
  onPause: () => void;
}) {
  const [lineCount, setLineCount] = useState(0);
  const truncated = recentNoteIsTruncated(lineCount);
  return (
    <View testID={`lookback-reading-${entry.id}`} style={styles.moment}>
      {entry.clockLabel ? (
        <Text style={styles.meta} testID={`lookback-reading-clock-${entry.id}`}>
          {entry.clockLabel}
        </Text>
      ) : null}
      {entry.recordedLabel ? (
        <Text style={styles.meta} testID={`lookback-reading-recorded-${entry.id}`}>
          {entry.recordedLabel}
        </Text>
      ) : null}
      {entry.note ? (
        <>
          <Text
            style={[styles.note, styles.measure]}
            testID={`lookback-reading-note-measure-${entry.id}`}
            onTextLayout={(event) => setLineCount(event.nativeEvent.lines.length)}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {entry.note}
          </Text>
          <Text
            style={styles.note}
            testID={`lookback-reading-note-${entry.id}`}
            numberOfLines={expanded ? undefined : recentNoteVisibleLineLimit(lineCount)}
          >
            {entry.note}
          </Text>
          {truncated ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? '收起正文' : '展开正文'}
              testID={`lookback-reading-expand-${entry.id}`}
              onPress={onToggleExpand}
              style={styles.hit}
            >
              <Text style={styles.action}>{expanded ? '收起正文' : '展开正文'}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      <MomentImages
        images={entry.images}
        testIDPrefix={`lookback-reading-image-${entry.id}`}
        rhythm={pairImages}
      />
      <MomentUnknownMedia items={entry.unknownMedia} testIDPrefix={`lookback-reading-unknown-${entry.id}`} />
      <MomentAudio
        audio={entry.audio}
        playbackStatus={listen.status}
        currentTimeMs={listen.currentTimeMs}
        onPlay={onPlay}
        onPause={onPause}
        testIDPrefix={`lookback-reading-sound-${entry.id}`}
        compact
      />
      <RecentFeeling feeling={entry.feeling ?? null} testID={`lookback-reading-feeling-${entry.id}`} />
      <LookThisHit
        caption="阅读完整记录"
        accessibilityLabel={`阅读完整记录，${entry.note || entry.id}`}
        testID={`lookback-book-open-${entry.id}`}
        tight
        onPress={() => onOpen(entry.id)}
      />
    </View>
  );
}

export function LookbackUnconfirmedHeader({
  title,
  explanation,
  count,
}: {
  title: string;
  explanation: string;
  count: number | null;
}) {
  return (
    <View testID="lookback-reading-unconfirmed-header" style={styles.header}>
      <Text
        style={styles.dayTitle}
        accessibilityRole="header"
        testID="lookback-reading-title"
        accessibilityLabel={count == null ? title : `${title}，${lookbackReadingCountLabel(count)}`}
      >
        {title}
      </Text>
      <Text style={styles.note} testID="lookback-reading-explanation">
        {explanation}
      </Text>
      {count != null ? (
        <Text style={styles.meta} testID="lookback-reading-count">
          {lookbackReadingCountLabel(count)}
        </Text>
      ) : null}
    </View>
  );
}

export function LookbackNeighborRetry({
  testID,
  onRetry,
}: {
  testID: string;
  onRetry: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="相邻有记录日，再试一次"
      testID={testID}
      onPress={onRetry}
      style={styles.hit}
    >
      <Text style={styles.action}>相邻有记录日暂时读不出来。再试一次</Text>
    </Pressable>
  );
}

export function lookbackNeighborsDirection(
  availableWidth: number,
  captions: string[],
): 'row' | 'column' {
  if (captions.length <= 1 || availableWidth <= 0) return 'column';
  const needed = captions.reduce((sum, caption, index) => {
    return sum + caption.length * type.action.fontSize + (index > 0 ? 8 : 0);
  }, 0);
  return needed <= availableWidth ? 'row' : 'column';
}

export function LookbackReadingNeighbors({
  current,
  previous,
  next,
  onOpen,
}: {
  current: { year: number; month: number; day: number };
  previous: LookbackPlacedDay | null;
  next: LookbackPlacedDay | null;
  onOpen: (day: LookbackPlacedDay) => void;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  if (!previous && !next) return null;
  const previousCaption = previous ? lookbackNeighborCaption('previous', current, previous) : null;
  const nextCaption = next ? lookbackNeighborCaption('next', current, next) : null;
  const direction = lookbackNeighborsDirection(
    availableWidth,
    [previousCaption, nextCaption].filter((caption): caption is string => !!caption),
  );
  return (
    <View
      testID="lookback-reading-neighbors"
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      style={[styles.neighbors, direction === 'row' ? styles.neighborsRow : styles.neighborsColumn]}
    >
      {previous && previousCaption ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previousCaption}
          testID="lookback-reading-prev-day"
          onPress={() => onOpen(previous)}
          style={[styles.hit, direction === 'row' ? styles.neighborHitRow : styles.neighborHitColumn]}
        >
          <Text style={styles.action}>{previousCaption}</Text>
        </Pressable>
      ) : null}
      {next && nextCaption ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextCaption}
          testID="lookback-reading-next-day"
          onPress={() => onOpen(next)}
          style={[styles.hit, direction === 'row' ? styles.neighborHitRow : styles.neighborHitColumn]}
        >
          <Text style={styles.action}>{nextCaption}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 8 },
  dayTitle: { ...type.title, color: ink },
  meta: { ...type.meta, color: '#53604F' },
  note: { ...type.body, color: ink },
  measure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  moment: {
    gap: 8,
    paddingTop: 8,
    paddingBottom: 16,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: hairline,
  },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  action: { ...type.action, color: sage },
  neighbors: { gap: 8, marginTop: 8 },
  neighborsColumn: { flexDirection: 'column', alignItems: 'stretch' },
  neighborsRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'flex-start' },
  neighborHitColumn: { alignSelf: 'stretch' },
  neighborHitRow: { flexShrink: 0 },
});
