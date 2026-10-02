import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, type } from './life-text';

import {
  LOOKBACK_BOOK_NOTE_LINES,
  lookbackBookDayAccessLabel,
  lookbackBookDayDateLabel,
  lookbackBookDayMetaLabel,
  lookbackBookMonthAccessLabel,
  lookbackCatalogMonthHan,
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
import {
  recentInk,
  recentOlive,
  recentSans,
  recentType,
  recentWeekdayInk,
  recentYearInk,
} from './recent-visual';

const CATALOG_SELECTED = '#EEEEE6';

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
      {children}
    </View>
  );
}

export function LookbackBookMonthRow({
  year,
  month,
  summary,
  expanded,
  onPress,
}: {
  year: number;
  month: number;
  count?: number;
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
        <Text style={styles.monthTitle}>{lookbackCatalogMonthHan(month)}</Text>
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
  return (
    <LookbackCatalogSplitRow
      left={lookbackBookDayDateLabel(month, entry.day)}
      right={lookbackBookDayMetaLabel(year, month, entry.day, entry.count)}
      selected={selected}
      accessibilityLabel={lookbackBookDayAccessLabel(
        year,
        month,
        entry.day,
        entry.summary,
        selected,
      )}
      accessibilityState={{ selected }}
      testID={`lookback-book-day-${year}-${pad2(month)}-${pad2(entry.day)}`}
      onPress={onPress}
    />
  );
}

export function LookbackCatalogNoteRow({
  left,
  right,
  testID,
}: {
  left: string;
  right?: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.noteRow}>
      <Text style={styles.splitLeft}>{left}</Text>
      {right ? <Text style={styles.splitRight}>{right}</Text> : null}
    </View>
  );
}

export function LookbackCatalogSplitRow({
  left,
  right,
  selected,
  onPress,
  testID,
  accessibilityLabel,
  accessibilityState,
}: {
  left: string;
  right?: string;
  selected?: boolean;
  onPress: () => void;
  testID: string;
  accessibilityLabel: string;
  accessibilityState?: { selected?: boolean; expanded?: boolean };
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      style={[styles.splitHit, selected ? styles.daySelected : null]}
    >
      <View style={styles.splitRow}>
        <Text style={styles.splitLeft}>{left}</Text>
        {right ? <Text style={styles.splitRight}>{right}</Text> : null}
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
  chapter: { gap: 2, marginTop: 16 },
  chapterTitle: { ...recentType.year, color: recentYearInk },
  meta: { ...type.meta, color: '#53604F' },
  clock: { ...type.meta, color: '#53604F' },
  note: { ...type.body, color: '#25231F' },
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  monthTitle: {
    fontFamily: recentSans,
    fontSize: 16,
    lineHeight: 22,
    color: recentOlive,
    flexShrink: 1,
    minWidth: 0,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E3D9',
  },
  splitHit: { minHeight: 48, justifyContent: 'center', borderRadius: 4 },
  daySelected: { backgroundColor: CATALOG_SELECTED },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  splitLeft: {
    fontFamily: recentSans,
    fontSize: 15,
    lineHeight: 20,
    color: recentInk,
    flexShrink: 1,
    minWidth: 0,
  },
  splitRight: {
    ...recentType.weekday,
    color: recentWeekdayInk,
    flexShrink: 0,
  },
});
