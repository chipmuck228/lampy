import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getUseCases } from '../application/container';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import { leaveHref, lookbackRootHrefFromRecent } from '../screens/lookback-origin';
import { RootNavBand, RootReadingLayout } from '../screens/root-nav-band';
import type { RecentLifeViewModel } from '../application/use-cases';
import { LifeIconButton } from '../screens/life-icons';
import { shouldPairRecentImages } from '../screens/moment-images';
import { RecentMoment } from '../screens/recent-moment';
import {
  consumeJustSavedMomentId,
  echoCallbackIsCurrent,
  isRecentForeground,
  nextEchoSeq,
  peekJustSavedMomentId,
  SAVE_ECHO_FADE_MS,
  SAVE_ECHO_START_OPACITY,
  shouldRevealSaveEcho,
  shouldSkipSaveEchoFade,
} from '../screens/recent-save-echo';
import { useRecentClipPlayback } from '../screens/use-recent-clip-playback';
import {
  clay,
  ink,
  inkSoft,
  isCompactHeight,
  DATE_RAIL_WIDTH,
  READING_MAX,
  hairline,
  pageGutter,
  paper,
  recentColumnWidth,
  recentImageColumnWidth,
  sage,
  shouldShowSameDayRule,
  shouldStackRecentDay,
} from '../screens/life-page';
import { StartupBrandLayer } from '../screens/startup-brand-layer';
import { usePageMetrics } from '../screens/use-page-metrics';

export default function RecentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = usePageMetrics();
  const gutter = pageGutter(width, height);
  const compact = isCompactHeight(height);
  const stackDay = shouldStackRecentDay(width, height, fontScale);
  const columnWidth = recentColumnWidth(width, height, fontScale);
  const pairImages = shouldPairRecentImages(
    fontScale,
    recentImageColumnWidth(width, height, fontScale, insets.left, insets.right),
  );
  const [view, setView] = useState<RecentLifeViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [echoId, setEchoId] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [echoOpacity] = useState(() => new Animated.Value(1));
  const echoAnim = useRef<Animated.CompositeAnimation | null>(null);
  const echoSeq = useRef(0);
  const clips = useRecentClipPlayback();
  const days = view?.days ?? [];
  const reduceMotionRef = useRef(reduceMotion);
  const itemIdsRef = useRef<string[]>([]);
  const loadReadyRef = useRef(false);

  const settleEcho = useCallback(() => {
    echoSeq.current = nextEchoSeq(echoSeq.current);
    echoAnim.current?.stop();
    echoAnim.current = null;
    echoOpacity.setValue(1);
  }, [echoOpacity]);

  const revealEcho = useCallback(
    (id: string, skipFade: boolean) => {
      const seq = nextEchoSeq(echoSeq.current);
      echoSeq.current = seq;
      echoAnim.current?.stop();
      echoAnim.current = null;
      setEchoId(id);
      if (skipFade) {
        echoOpacity.setValue(1);
        return;
      }
      echoOpacity.setValue(SAVE_ECHO_START_OPACITY);
      const anim = Animated.timing(echoOpacity, {
        toValue: 1,
        duration: SAVE_ECHO_FADE_MS,
        useNativeDriver: true,
      });
      echoAnim.current = anim;
      anim.start(({ finished }) => {
        if (!echoCallbackIsCurrent(seq, echoSeq.current)) return;
        if (!finished) echoOpacity.setValue(1);
        echoAnim.current = null;
      });
    },
    [echoOpacity],
  );

  const tryRevealPending = useCallback(
    (itemIds: string[], loadReady: boolean) => {
      const pending = peekJustSavedMomentId();
      if (
        shouldRevealSaveEcho({
          momentId: pending,
          itemIds,
          loadReady,
          foreground: isRecentForeground(AppState.currentState),
        })
      ) {
        consumeJustSavedMomentId();
        revealEcho(pending as string, shouldSkipSaveEchoFade(reduceMotionRef.current));
        return;
      }
      if (pending && loadReady && !itemIds.includes(pending)) consumeJustSavedMomentId();
    },
    [revealEcho],
  );

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  useEffect(() => {
    itemIdsRef.current = view?.items.map((item) => item.id) ?? [];
    loadReadyRef.current = view !== null;
  }, [view]);

  useEffect(() => {
    if (reduceMotion) settleEcho();
  }, [reduceMotion, settleEcho]);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduceMotion(value === true);
      })
      .catch(() => {
        if (alive) setReduceMotion(true);
      });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduceMotion(value === true);
    });
    const app = AppState.addEventListener('change', (state) => {
      if (isRecentForeground(state)) {
        tryRevealPending(itemIdsRef.current, loadReadyRef.current);
        return;
      }
      settleEcho();
    });
    return () => {
      alive = false;
      motion.remove();
      app.remove();
      settleEcho();
    };
  }, [settleEcho, tryRevealPending]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getRecentLife())
        .then((next) => {
          if (cancelled) return;
          setView(next);
          setError(null);
          tryRevealPending(
            next.items.map((item) => item.id),
            true,
          );
        })
        .catch(() => {
          if (!cancelled) setError('最近的记录暂时读不出来，原来的内容还在这台设备上。');
        });
      return () => {
        cancelled = true;
        settleEcho();
      };
    }, [settleEcho, tryRevealPending]),
  );

  return (
    <View style={styles.safe}>
      <StartupBrandLayer homeSettled={view !== null || error !== null} />
      <RootReadingLayout
        accessibilityLabel="最近"
        scrollTestID="recent-scroll"
        contentContainerStyle={[
          styles.column,
          {
            maxWidth: columnWidth,
            paddingHorizontal: gutter,
            paddingTop: compact ? 4 : 12,
            paddingBottom: 8,
          },
        ]}
        band={
          <RootNavBand
            here="recent"
            onOther={() => router.push(lookbackRootHrefFromRecent())}
            onLeave={() => router.push(leaveHref('recent'))}
            onFamily={isFamilyProductEntryOpen() ? () => router.push('/family') : undefined}
          />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.wordmark} accessibilityRole="header">
            最近
          </Text>
          <LifeIconButton
            name="settings"
            label="本机设置"
            testID="home-account"
            onPress={() => router.push('/account')}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {view?.isFirstUse && !error ? (
          <View style={styles.empty} testID="recent-empty">
            <Text style={styles.emptyTitle}>这里，留下自己的生活。</Text>
            <Text style={styles.body}>写一句，拍一张，或留一段声音。以后再回来听见、看见。</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="留下第一条"
              testID="home-leave-first"
              onPress={() => router.push(leaveHref('recent'))}
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
              {day.items.map((item, index) => (
                <View key={item.id}>
                  {shouldShowSameDayRule(index) ? (
                    <View testID={`recent-day-rule-${item.id}`} style={styles.sameDayRule} />
                  ) : null}
                  <RecentMoment
                    item={item}
                    pairImages={pairImages}
                    echoOpacity={echoOpacity}
                    echoing={echoId === item.id}
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
                </View>
              ))}
            </View>
          </View>
        ))}
      </RootReadingLayout>
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
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  wordmark: { fontSize: 28, color: ink, flex: 1, flexShrink: 1, minWidth: 0 },
  empty: { gap: 16, paddingTop: 28, paddingBottom: 8 },
  emptyTitle: { fontSize: 28, lineHeight: 38, color: ink },
  body: { fontSize: 17, lineHeight: 26, color: inkSoft },
  firstHit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  first: { fontSize: 20, lineHeight: 28, color: ink },
  error: { fontSize: 17, lineHeight: 26, color: clay, paddingVertical: 8 },
  day: { gap: 12 },
  dayRegular: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  date: { fontSize: 16, color: sage, paddingBottom: 4, minWidth: 0 },
  dateRail: { width: DATE_RAIL_WIDTH, flexShrink: 0, paddingTop: 6 },
  dayItems: { gap: 32 },
  dayItemsRegular: { width: READING_MAX, flexShrink: 0 },
  sameDayRule: {
    width: 72,
    height: StyleSheet.hairlineWidth,
    backgroundColor: hairline,
    marginTop: -16,
    marginBottom: 16,
  },
});
