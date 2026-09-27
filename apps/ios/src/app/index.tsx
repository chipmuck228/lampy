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
import { useSoundPlayer } from '../screens/use-sound-player';
import {
  clay,
  ink,
  inkSoft,
  isCompactHeight,
  isRegularWidth,
  DATE_RAIL_WIDTH,
  READING_MAX,
  pageColumnWidth,
  pageGutter,
  paper,
  sage,
} from '../screens/life-page';
import { groupRecentDays } from '../screens/recent-days';

export default function RecentScreen() {
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const columnWidth = pageColumnWidth(width, height);
  const gutter = pageGutter(width, height);
  const regular = isRegularWidth(width, height);
  const compact = isCompactHeight(height);
  const stackChrome = width < 420 || fontScale >= 1.3;
  const [view, setView] = useState<RecentLifeViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const sound = useSoundPlayer();
  const days = view ? groupRecentDays(view.items) : [];

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
        <View style={[styles.top, compact && styles.topCompact, stackChrome && styles.topStacked]}>
          <Text style={styles.wordmark} accessibilityRole="header">
            最近
          </Text>
          <View style={[styles.actions, stackChrome && styles.actionsWrapped]}>
            {isFamilyApiConfigured() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="家庭"
                testID="home-family"
                hitSlop={8}
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
              hitSlop={8}
              onPress={() => router.push(lookbackHref('/lookback'))}
              style={styles.navHit}
            >
              <Text style={styles.nav}>回看</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="留下"
              testID="home-leave"
              hitSlop={8}
              onPress={() => router.push('/leave')}
              style={styles.navHit}
            >
              <Text style={styles.nav}>留下</Text>
            </Pressable>
          </View>
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
            style={[styles.day, regular && styles.dayRegular]}
            accessibilityLabel={`${day.dateLabel}，${day.items.length}条记录`}
          >
            <Text style={[styles.date, regular && styles.dateRail]} accessibilityRole="header">
              {day.dateLabel}
            </Text>
            <View style={styles.dayItems}>
              {day.items.map((item) => (
                <RecentMoment
                  key={item.id}
                  item={item}
                  playingId={playingId}
                  sound={sound}
                  onOpen={() => router.push(`/moment/${encodeURIComponent(item.id)}`)}
                  onPlay={() => {
                    if (!item.audio?.uri) return;
                    setPlayingId(item.audio.id);
                    void sound.play(item.audio.uri);
                  }}
                  onPause={() => {
                    void sound.pause();
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
  playingId,
  sound,
  onOpen,
  onPlay,
  onPause,
}: {
  item: RecentLifeItem;
  playingId: string | null;
  sound: ReturnType<typeof useSoundPlayer>;
  onOpen: () => void;
  onPlay: () => void;
  onPause: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        [
          item.dateLabel,
          item.note,
          ...item.images.map((image) => image.label),
          item.audio?.label || '',
          ...(item.unknownMedia ?? []).map((media) => media.label),
          item.feeling ? `当时的感受，${item.feeling.label}` : '',
        ]
          .filter(Boolean)
          .join('，') || `${item.dateLabel}，一条记录`
      }
      testID={`recent-item-${item.id}`}
      onPress={onOpen}
      style={styles.moment}
    >
      {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
      <MomentImages images={item.images} testIDPrefix={`recent-image-${item.id}`} />
      <MomentUnknownMedia items={item.unknownMedia ?? []} testIDPrefix={`recent-unknown-${item.id}`} />
      <MomentAudio
        audio={item.audio}
        playbackStatus={playingId === item.audio?.id ? (sound.failed ? 'unavailable' : sound.status) : 'idle'}
        currentTimeMs={playingId === item.audio?.id ? sound.currentTimeMs : 0}
        onPlay={onPlay}
        onPause={onPause}
        testIDPrefix={`recent-sound-${item.id}`}
        compact
      />
      <MomentFeeling feeling={item.feeling} testID={`recent-feeling-${item.id}`} />
    </Pressable>
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
    gap: 28,
  },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 44,
  },
  topCompact: { marginBottom: 0 },
  topStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  wordmark: { fontSize: 28, lineHeight: 36, color: ink, flexShrink: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, minWidth: 0 },
  actionsWrapped: { alignSelf: 'stretch' },
  navHit: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  nav: { fontSize: 18, lineHeight: 24, color: sage },
  empty: { gap: 12, paddingTop: 32, paddingBottom: 16 },
  emptyTitle: { fontSize: 26, lineHeight: 34, color: ink },
  body: { fontSize: 17, lineHeight: 26, color: inkSoft },
  firstHit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  first: { fontSize: 20, lineHeight: 28, color: sage },
  error: { fontSize: 16, lineHeight: 24, color: clay },
  day: { gap: 16 },
  dayRegular: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  date: { fontSize: 16, lineHeight: 22, color: sage },
  dateRail: { width: DATE_RAIL_WIDTH, paddingTop: 4 },
  dayItems: { flex: 1, maxWidth: READING_MAX, gap: 28 },
  moment: { gap: 10, minHeight: 44 },
  note: { fontSize: 21, lineHeight: 30, color: ink },
});
