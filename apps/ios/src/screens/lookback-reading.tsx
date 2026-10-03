import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './life-text';

import type { LookbackDayEntry } from '../application/lookback-day';
import { feelingAccentColor } from '../application/feeling-accent';
import type { FeelingView } from '../application/feeling';
import {
  lookbackNeighborCaption,
  lookbackNeighborDateLabel,
  lookbackReadingCountLabel,
  lookbackReadingCountPhrase,
  lookbackReadingDayMetaLine,
  lookbackReadingDayTitle,
  lookbackReadingDayWeekday,
  lookbackReadingYearLabel,
  type LookbackPlacedDay,
} from '../application/lookback-reading';
import type { PlaybackStatus } from '../infrastructure/media';
import { hairline } from './life-page';
import {
  lookbackType,
  recentEndInk,
  recentFeelingInk,
  recentInk,
  recentOpenInk,
  recentOlive,
  recentRule,
  recentSage,
  recentWeekdayInk,
  recentYearInk,
} from './recent-visual';
import { LookThisHit } from './life-icons';
import { MomentAudio, MomentUnknownMedia } from './moment-audio';
import { MomentImages } from './moment-images';
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
  const meta = lookbackReadingDayMetaLine(year, month, day, count);
  return (
    <View testID="lookback-reading-header" style={styles.header}>
      <Text style={styles.year} testID="lookback-reading-year">
        {lookbackReadingYearLabel(year)}
      </Text>
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
      <Text style={styles.meta} testID="lookback-reading-meta">
        {meta}
      </Text>
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
  footer,
}: {
  entry: LookbackDayEntry;
  pairImages: boolean;
  expanded: boolean;
  listen: { status: PlaybackStatus; currentTimeMs: number };
  onToggleExpand: () => void;
  onOpen: (id: string) => void;
  onPlay: () => void;
  onPause: () => void;
  footer?: ReactNode;
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
              <Text style={styles.expand}>{expanded ? '收起正文' : '展开正文'}</Text>
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
        markedActions
        progressWhenHeard
        chrome="row"
      />
      <LookbackRecordFoot
        id={entry.id}
        note={entry.note}
        feeling={entry.feeling ?? null}
        onOpen={() => onOpen(entry.id)}
      />
      {footer}
    </View>
  );
}

function LookbackRecordFoot({
  id,
  note,
  feeling,
  onOpen,
}: {
  id: string;
  note: string;
  feeling: FeelingView | null;
  onOpen: () => void;
}) {
  return (
    <View testID={`lookback-reading-foot-${id}`} style={styles.foot}>
      {feeling ? (
        <View
          testID={`lookback-reading-feeling-${id}`}
          accessibilityLabel={`当时的感受，${feeling.label}`}
          style={styles.feeling}
        >
          <View
            testID={`lookback-reading-feeling-${id}-dot`}
            accessible={false}
            importantForAccessibility="no"
            style={[styles.feelingDot, { backgroundColor: feelingAccentColor(feeling) }]}
          />
          <Text style={styles.feelingWord}>{feeling.label}</Text>
        </View>
      ) : (
        <View style={styles.feelingSlot} />
      )}
      <LookThisHit
        caption="阅读完整记录"
        accessibilityLabel={`阅读完整记录，${note || id}`}
        testID={`lookback-book-open-${id}`}
        align="end"
        captionStyle={styles.open}
        onPress={onOpen}
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
      <Text style={styles.meta} testID="lookback-reading-explanation">
        {count == null ? explanation : `${explanation} · ${lookbackReadingCountPhrase(count)}`}
      </Text>
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
      <Text style={styles.expand}>相邻有记录日暂时读不出来。再试一次</Text>
    </Pressable>
  );
}

function LookbackNeighborDayHit({
  direction,
  current,
  day,
  onOpen,
}: {
  direction: 'previous' | 'next';
  current: { year: number; month: number; day: number };
  day: LookbackPlacedDay;
  onOpen: (day: LookbackPlacedDay) => void;
}) {
  const verb = direction === 'previous' ? '前一个记录日' : '后一个记录日';
  const date = lookbackNeighborDateLabel(current, day);
  const trailing = direction === 'next';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lookbackNeighborCaption(direction, current, day)}
      testID={direction === 'previous' ? 'lookback-reading-prev-day' : 'lookback-reading-next-day'}
      onPress={() => onOpen(day)}
      style={[styles.neighborHit, trailing ? styles.neighborHitEnd : styles.neighborHitStart]}
    >
      <Text style={[styles.neighborVerb, trailing ? styles.neighborCopyEnd : styles.neighborCopyStart]}>{verb}</Text>
      <Text style={[styles.neighborDate, trailing ? styles.neighborCopyEnd : styles.neighborCopyStart]}>
        {date}
      </Text>
    </Pressable>
  );
}

export function LookbackEndNote({ text }: { text: string }) {
  return (
    <View testID="lookback-reading-end" style={styles.endNoteWrap} accessible={false}>
      <Text style={styles.endNote}>{text}</Text>
    </View>
  );
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
  if (!previous && !next) return null;
  return (
    <View testID="lookback-reading-neighbors" style={styles.neighbors}>
      {previous ? (
        <LookbackNeighborDayHit direction="previous" current={current} day={previous} onOpen={onOpen} />
      ) : (
        <View style={styles.neighborSlot} />
      )}
      {next ? (
        <LookbackNeighborDayHit direction="next" current={current} day={next} onOpen={onOpen} />
      ) : (
        <View style={styles.neighborSlot} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    marginBottom: 8,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: recentRule,
  },
  year: { ...lookbackType.dayYear, color: recentYearInk },
  dayTitle: { ...lookbackType.dayTitle, color: recentInk },
  meta: { ...lookbackType.dayMeta, color: recentWeekdayInk },
  note: { ...lookbackType.note, color: recentInk },
  expand: { ...lookbackType.expand, color: recentSage },
  open: { ...lookbackType.open, color: recentOpenInk },
  measure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  moment: {
    gap: 8,
    paddingTop: 16,
    paddingBottom: 16,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: hairline,
  },
  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 48,
    width: '100%',
  },
  feeling: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    flexShrink: 1,
  },
  feelingSlot: { minHeight: 0, flexGrow: 1, flexBasis: 48 },
  feelingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  feelingWord: { ...lookbackType.feeling, color: recentFeelingInk, flexShrink: 1 },
  endNoteWrap: { paddingTop: 24, paddingBottom: 8 },
  endNote: {
    ...lookbackType.end,
    color: recentEndInk,
    textAlign: 'center',
    paddingTop: 24,
    paddingBottom: 8,
  },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  neighborVerb: { ...lookbackType.neighbor, color: recentOlive },
  neighbors: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
  },
  neighborSlot: { flex: 1, minWidth: 0 },
  neighborHit: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    justifyContent: 'center',
    gap: 4,
  },
  neighborHitStart: { alignItems: 'flex-start' },
  neighborHitEnd: { alignItems: 'flex-end' },
  neighborCopyStart: { textAlign: 'left' },
  neighborCopyEnd: { textAlign: 'right' },
  neighborDate: { ...lookbackType.neighborDate, color: recentEndInk },
});
