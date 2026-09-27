import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { lookbackHref } from '../screens/lookback-chrome';

import { getUseCases } from '../application/container';
import { isFamilyApiConfigured } from '../infrastructure/family-config';
import type { RecentLifeItem, RecentLifeViewModel } from '../application/use-cases';
import { MomentAudio, MomentUnknownMedia } from '../screens/moment-audio';
import { MomentFeeling } from '../screens/moment-feeling';
import { MomentImages } from '../screens/moment-images';
import { useRecentClipPlayback } from '../screens/use-recent-clip-playback';
import type { PlaybackStatus } from '../infrastructure/media';
import {
  clay,
  ink,
  inkSoft,
  isCompactHeight,
  isLargeType,
  DATE_RAIL_WIDTH,
  READING_MAX,
  pageGutter,
  paper,
  recentColumnWidth,
  sage,
  shouldStackRecentDay,
} from '../screens/life-page';
import { StartupBrandLayer } from '../screens/startup-brand-layer';

export default function RecentScreen() {
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const gutter = pageGutter(width, height);
  const compact = isCompactHeight(height);
  const largeType = isLargeType(fontScale);
  const stackChrome = width < 420 || largeType;
  const stackDay = shouldStackRecentDay(width, height, fontScale);
  const columnWidth = recentColumnWidth(width, height, fontScale);
  const [view, setView] = useState<RecentLifeViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clips = useRecentClipPlayback();
  const days = view?.days ?? [];

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getRecentLife())
        .then((next) => {
          if (!cancelled) {
            setView(next);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('最近的记录暂时读不出来，原来的内容还在这台设备上。');
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="最近">
      <StartupBrandLayer homeSettled={view !== null || error !== null} />
      <ScrollView
        testID="recent-scroll"
        style={styles.scroll}
        contentContainerStyle={[
          styles.column,
          {
            maxWidth: columnWidth,
            paddingHorizontal: gutter,
            paddingTop: compact ? 4 : 12,
            paddingBottom: compact ? 20 : 40,
          },
        ]}
      >
        <View style={[styles.chrome, compact && styles.chromeCompact, stackChrome && styles.chromeStacked]}>
          <Text style={styles.wordmark} accessibilityRole="header">
            最近
          </Text>
          <View style={[styles.secondary, stackChrome && styles.secondaryWrapped]}>
            {isFamilyApiConfigured() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="家庭"
                testID="home-family"
                onPress={() => router.push('/family')}
                style={styles.navHit}
              >
                <Text style={styles.nav}>家庭</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="回看"
              testID="home-lookback"
              onPress={() => router.push(lookbackHref('/lookback'))}
              style={styles.navHit}
            >
              <Text style={styles.nav}>回看</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="留下"
            testID="home-leave"
            onPress={() => router.push('/leave')}
            style={styles.leaveHit}
          >
            <Text style={styles.leaveAction}>留下</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {view?.isFirstUse ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>这里，留下自己的生活。</Text>
            <Text style={styles.body}>写一句，拍一张，或留一段声音。以后再回来听见、看见。</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="留下第一条"
              testID="home-leave-first"
              onPress={() => router.push('/leave')}
              style={styles.firstHit}
            >
              <Text style={styles.first}>留下第一条</Text>
            </Pressable>
          </View>
        ) : null}

        {days.map((day) => (
          <View
            key={day.key}
            style={[styles.day, !stackDay && styles.dayRegular]}
            accessibilityLabel={`${day.label}，${day.items.length}条记录`}
          >
            <Text style={[styles.date, !stackDay && styles.dateRail]} accessibilityRole="header">
              {day.label}
            </Text>
            <View style={[styles.dayItems, !stackDay && styles.dayItemsRegular]}>
              {day.items.map((item) => (
                <RecentMoment
                  key={item.id}
                  item={item}
                  listen={
                    item.audio ? clips.card(item.audio.id) : { status: 'idle', currentTimeMs: 0 }
                  }
                  onOpen={() => router.push(`/moment/${encodeURIComponent(item.id)}`)}
                  onPlay={() => {
                    if (!item.audio?.uri) return;
                    void clips.play(item.audio.id, item.audio.uri);
                  }}
                  onPause={() => {
                    void clips.pause();
                  }}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function RecentMoment({
  item,
  listen,
  onOpen,
  onPlay,
  onPause,
}: {
  item: RecentLifeItem;
  listen: { status: PlaybackStatus; currentTimeMs: number };
  onOpen: () => void;
  onPlay: () => void;
  onPause: () => void;
}) {
  const mixed = !!(
    item.audio &&
    (item.note || item.images.length > 0 || (item.unknownMedia?.length ?? 0) > 0 || item.feeling)
  );
  return (
    <View style={[styles.moment, mixed && styles.momentMixed]} testID={`recent-item-${item.id}`}>
      <View style={styles.momentBody}>
        {item.note ? (
          <Text style={styles.note} testID={`recent-note-${item.id}`}>
            {item.note}
          </Text>
        ) : null}
        {item.occurredLabel ? (
          <Text style={styles.occurred} testID={`recent-occurred-${item.id}`}>
            {item.occurredLabel}
          </Text>
        ) : null}
        <MomentImages images={item.images} testIDPrefix={`recent-image-${item.id}`} />
        <MomentUnknownMedia items={item.unknownMedia ?? []} testIDPrefix={`recent-unknown-${item.id}`} />
      </View>
      <MomentAudio
        audio={item.audio}
        playbackStatus={listen.status}
        currentTimeMs={listen.currentTimeMs}
        onPlay={onPlay}
        onPause={onPause}
        testIDPrefix={`recent-sound-${item.id}`}
        compact={!mixed}
        scene={mixed}
      />
      <MomentFeeling feeling={item.feeling} testID={`recent-feeling-${item.id}`} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          [
            item.dateLabel,
            item.occurredLabel,
            item.note,
            '看这条',
          ]
            .filter(Boolean)
            .join('，') || `${item.dateLabel}，一条记录`
        }
        accessibilityHint="打开这条记录"
        testID={`recent-open-${item.id}`}
        onPress={onOpen}
        style={styles.open}
      >
        <Text style={styles.openAction} testID={`recent-open-label-${item.id}`}>
          看这条
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  scroll: { flex: 1, width: '100%' },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'center',
    gap: 40,
  },
  chrome: {
    alignItems: 'flex-start',
    gap: 4,
    paddingBottom: 8,
    minWidth: 0,
  },
  chromeCompact: { paddingBottom: 0 },
  chromeStacked: { alignSelf: 'stretch' },
  wordmark: { fontSize: 28, lineHeight: 36, color: ink, flexShrink: 1 },
  secondary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  secondaryWrapped: { alignSelf: 'stretch' },
  navHit: { minWidth: 48, minHeight: 48, justifyContent: 'center', paddingRight: 12 },
  nav: { fontSize: 17, lineHeight: 24, color: sage },
  leaveHit: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  leaveAction: { fontSize: 20, lineHeight: 28, color: ink },
  empty: { gap: 16, paddingTop: 28, paddingBottom: 8 },
  emptyTitle: { fontSize: 28, lineHeight: 38, color: ink },
  body: { fontSize: 17, lineHeight: 26, color: inkSoft },
  firstHit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  first: { fontSize: 20, lineHeight: 28, color: ink },
  error: { fontSize: 17, lineHeight: 26, color: clay, paddingVertical: 8 },
  day: { gap: 12 },
  dayRegular: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  date: { fontSize: 16, lineHeight: 22, color: sage, paddingBottom: 4 },
  dateRail: { width: DATE_RAIL_WIDTH, flexShrink: 0, paddingTop: 6 },
  dayItems: { gap: 36 },
  dayItemsRegular: { width: READING_MAX, flexShrink: 0 },
  moment: { gap: 8, minHeight: 48 },
  momentMixed: { gap: 16 },
  momentBody: { gap: 8 },
  open: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  openAction: { fontSize: 17, lineHeight: 24, color: sage, minHeight: 48, textAlignVertical: 'center' },
  note: { fontSize: 21, lineHeight: 32, color: ink },
  occurred: { fontSize: 15, lineHeight: 22, color: inkSoft },
});
