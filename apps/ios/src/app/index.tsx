import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../screens/life-text';
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
  recentDayAccessLabel,
  recentDayHeading,
  recentEndInk,
  recentInk,
  recentInkSoft,
  recentKicker,
  recentOlive,
  recentPaper,
  recentRule,
  recentHairline,
  recentSettings,
  recentType,
  recentWeekdayInk,
} from '../screens/recent-visual';
import { createRecentLeaveFabScroll, recentFabMotion } from '../screens/recent-leave-fab';
import {
  acceptRecentEchoLoad,
  beginRecentEchoFocus,
  createSaveEchoFocusGate,
  echoCallbackIsCurrent,
  endRecentEchoFocus,
  isRecentForeground,
  nextEchoSeq,
  rejectRecentEchoLoad,
  SAVE_ECHO_FADE_MS,
  SAVE_ECHO_START_OPACITY,
  shouldSkipSaveEchoFade,
  tryConsumeSaveEcho,
} from '../screens/recent-save-echo';
import { useRecentClipPlayback } from '../screens/use-recent-clip-playback';
import {
  clay,
  isCompactHeight,
  pageGutter,
  recentColumnWidth,
  recentImageColumnWidth,
  shouldShowSameDayRule,
} from '../screens/life-page';
import { StartupBrandLayer } from '../screens/startup-brand-layer';
import { usePageMetrics } from '../screens/use-page-metrics';

export default function RecentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = usePageMetrics();
  const gutter = pageGutter(width, height);
  const compact = isCompactHeight(height);
  const columnWidth = recentColumnWidth(width, height);
  const pairImages = shouldPairRecentImages(
    recentImageColumnWidth(width, height, insets.left, insets.right),
  );
  const [view, setView] = useState<RecentLifeViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [echoId, setEchoId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [echoOpacity] = useState(() => new Animated.Value(1));
  const [fabOpacity] = useState(() => new Animated.Value(1));
  const [fabShift] = useState(() => new Animated.Value(0));
  const [fabOpen, setFabOpen] = useState(true);
  const echoAnim = useRef<Animated.CompositeAnimation | null>(null);
  const fabAnim = useRef<Animated.CompositeAnimation | null>(null);
  const echoSeq = useRef(0);
  const clips = useRecentClipPlayback();
  const days = view?.days ?? [];
  const reduceMotionRef = useRef(reduceMotion);
  const echoGate = useRef(createSaveEchoFocusGate());
  const fabOpenRef = useRef(true);
  const fabScroll = useRef<ReturnType<typeof createRecentLeaveFabScroll> | null>(null);
  const revealFabRef = useRef<(visible: boolean) => void>(() => undefined);

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

  const openLookback = useCallback(() => {
    router.push(lookbackRootHrefFromRecent());
  }, [router]);

  const revealFab = useCallback(
    (visible: boolean) => {
      if (fabOpenRef.current === visible) return;
      fabOpenRef.current = visible;
      setFabOpen(visible);
      fabAnim.current?.stop();
      fabAnim.current = null;
      const motion = recentFabMotion(visible, reduceMotionRef.current);
      if (motion.duration === 0) {
        fabOpacity.setValue(motion.opacity);
        fabShift.setValue(motion.translateY);
        return;
      }
      const next = Animated.parallel([
        Animated.timing(fabOpacity, {
          toValue: motion.opacity,
          duration: motion.duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fabShift, {
          toValue: motion.translateY,
          duration: motion.duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
      fabAnim.current = next;
      next.start(({ finished }) => {
        if (finished) fabAnim.current = null;
      });
    },
    [fabOpacity, fabShift],
  );

  const onRecentScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabScroll.current?.onScroll(event.nativeEvent.contentOffset.y);
  }, []);

  const tryRevealPending = useCallback(() => {
    const id = tryConsumeSaveEcho(echoGate.current, AppState.currentState);
    if (id) revealEcho(id, shouldSkipSaveEchoFade(reduceMotionRef.current));
  }, [revealEcho]);

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  useEffect(() => {
    revealFabRef.current = revealFab;
  }, [revealFab]);

  useEffect(() => {
    const scroll = createRecentLeaveFabScroll((visible) => revealFabRef.current(visible));
    fabScroll.current = scroll;
    return () => {
      scroll.dispose();
      if (fabScroll.current === scroll) fabScroll.current = null;
      fabAnim.current?.stop();
    };
  }, []);

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
        tryRevealPending();
        return;
      }
      settleEcho();
    });
    return () => {
      alive = false;
      motion.remove();
      app.remove();
      settleEcho();
      fabAnim.current?.stop();
    };
  }, [settleEcho, tryRevealPending]);

  useFocusEffect(
    useCallback(() => {
      const request = beginRecentEchoFocus(echoGate.current);
      getUseCases()
        .then((app) => app.getRecentLife())
        .then((next) => {
          if (!acceptRecentEchoLoad(
            echoGate.current,
            request,
            next.items.map((item) => item.id),
          )) {
            return;
          }
          setView(next);
          setError(null);
          tryRevealPending();
        })
        .catch(() => {
          if (!rejectRecentEchoLoad(echoGate.current, request)) return;
          setError('最近的记录暂时读不出来，原来的内容还在这台设备上。');
        });
      return () => {
        endRecentEchoFocus(echoGate.current);
        settleEcho();
      };
    }, [settleEcho, tryRevealPending]),
  );

  return (
    <View style={styles.safe}>
      <StartupBrandLayer homeSettled={view !== null || error !== null} />
      <RootReadingLayout
        accessibilityLabel="刚刚留下的生活"
        scrollTestID="recent-scroll"
        canvas={recentPaper}
        onScroll={onRecentScroll}
        header={
          <View
            testID="recent-header"
            style={[
              styles.hero,
              {
                maxWidth: columnWidth,
                paddingHorizontal: gutter,
                paddingTop: compact ? 12 : 20,
              },
            ]}
          >
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow} testID="recent-eyebrow">
                LAMPY · 生活记录
              </Text>
              <Text style={styles.wordmark} accessibilityRole="header" testID="recent-wordmark">
                刚刚留下的生活
              </Text>
            </View>
            <LifeIconButton
              name="settings"
              label="本机设置"
              testID="home-account"
              color={recentSettings}
              size={20}
              onPress={() => router.push('/account')}
            />
          </View>
        }
        contentContainerStyle={[
          styles.column,
          {
            maxWidth: columnWidth,
            paddingHorizontal: gutter,
            paddingTop: 4,
            paddingBottom: 92,
          },
        ]}
        band={
          <RootNavBand
            here="recent"
            onOther={openLookback}
            onFamily={isFamilyProductEntryOpen() ? () => router.push('/family') : undefined}
          />
        }
        overlay={
          <Animated.View
            pointerEvents={fabOpen ? 'box-none' : 'none'}
            style={[
              styles.fabWrap,
              {
                opacity: fabOpacity,
                transform: [{ translateY: fabShift }],
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="留下"
              accessibilityElementsHidden={!fabOpen}
              importantForAccessibility={fabOpen ? 'yes' : 'no-hide-descendants'}
              testID="recent-leave-fab"
              onPress={() => router.push(leaveHref('recent'))}
              style={styles.fab}
            >
              <Text style={styles.fabLabel}>＋ 留下</Text>
            </Pressable>
          </Animated.View>
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {view?.isFirstUse && !error ? (
          <View style={styles.empty} testID="recent-empty">
            <Text style={styles.emptyTitle}>这里，留下自己的生活。</Text>
            <Text style={styles.body} testID="recent-empty-hint">
              {'写一句，\n拍一张，\n或留一段声音。'}
            </Text>
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

        {days.map((day, dayIndex) => (
          <View
            key={day.key}
            style={[styles.day, dayIndex > 0 && styles.nextDay]}
            accessibilityLabel={recentDayAccessLabel(
              recentDayHeading(day.key, day.label, new Date().getFullYear()),
              day.items.length,
            )}
          >
            <RecentDayHeading dayKey={day.key} label={day.label} />
            <View style={styles.dayItems}>
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
                    expanded={expandedIds.includes(item.id)}
                    listen={
                      item.audio ? clips.card(item.audio.id) : { status: 'idle', currentTimeMs: 0 }
                    }
                    onToggleExpand={() => {
                      setExpandedIds((current) =>
                        current.includes(item.id)
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id],
                      );
                    }}
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
        {days.length > 0 ? (
          <View style={styles.endNote} testID="recent-end-note">
            <Text style={styles.endCopy}>每一个平常的日子，</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="都在这里，打开回看"
              testID="recent-end-lookback"
              hitSlop={12}
              onPress={openLookback}
              style={styles.endHit}
            >
              <Text style={styles.endLink}>都在这里</Text>
            </Pressable>
            <Text style={styles.endCopy}>。</Text>
          </View>
        ) : null}
      </RootReadingLayout>
    </View>
  );
}

function RecentDayHeading({ dayKey, label }: { dayKey: string; label: string }) {
  const heading = recentDayHeading(dayKey, label, new Date().getFullYear());
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionCopy}>
        <View style={styles.sectionDateRow}>
          <Text style={styles.sectionDate} accessibilityRole="header">
            {heading.date}
          </Text>
          {heading.weekday ? <Text style={styles.sectionDot}>·</Text> : null}
          {heading.weekday ? <Text style={styles.sectionWeekday}>{heading.weekday}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: recentPaper },
  scroll: { flex: 1, width: '100%' },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'center',
    gap: 0,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'center',
    width: '100%',
    paddingBottom: 17,
    gap: 12,
  },
  heroCopy: { flex: 1, flexShrink: 1, minWidth: 0 },
  eyebrow: { ...recentType.kicker, color: recentKicker },
  wordmark: { ...recentType.title, color: recentInk, marginTop: 10, letterSpacing: 1.2 },
  fabWrap: { alignItems: 'flex-end' },
  fab: {
    minHeight: 48,
    height: 48,
    minWidth: 48,
    paddingLeft: 13,
    paddingRight: 17,
    borderRadius: 50,
    backgroundColor: recentOlive,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 5,
  },
  fabLabel: { ...recentType.fab, color: '#FFFFFF' },
  empty: { gap: 16, paddingTop: 28, paddingBottom: 8 },
  emptyTitle: { ...recentType.title, color: recentInk },
  body: { ...recentType.note, color: recentInkSoft },
  firstHit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  first: { ...recentType.expand, color: recentInk },
  error: { ...recentType.note, color: clay, paddingVertical: 8 },
  day: { overflow: 'visible' },
  nextDay: { marginTop: 28 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: recentRule,
    paddingTop: 22,
    marginTop: 6,
    marginBottom: 8,
  },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionDateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 6,
  },
  sectionDate: { ...recentType.date, color: recentInk },
  sectionDot: { ...recentType.weekday, color: recentWeekdayInk },
  sectionWeekday: { ...recentType.weekday, color: recentWeekdayInk },
  dayItems: { gap: 0 },
  sameDayRule: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: recentHairline,
  },
  endNote: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 18,
  },
  endCopy: {
    ...recentType.end,
    color: recentEndInk,
  },
  endHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  endLink: {
    ...recentType.end,
    color: recentOlive,
    textDecorationLine: 'underline',
  },
});
