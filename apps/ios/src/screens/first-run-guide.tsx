import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  FIRST_RUN_SCREENS,
  isFirstRunFinishAction,
  nextFirstRunIndex,
  settleFirstRunMotion,
} from '../application/first-run';
import { ink, inkSoft, isCompactHeight, paper, sage } from './life-page';
import { FirstRunScene } from './first-run-scene';

export function FirstRunGuide({
  onFinished,
  finishError,
}: {
  onFinished: () => void;
  finishError?: string | null;
}) {
  const { width, height } = useWindowDimensions();
  const compact = isCompactHeight(height);
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [pageHeight, setPageHeight] = useState(Math.max(height - 160, 280));
  const [reduceMotion, setReduceMotion] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  const [shift] = useState(() => new Animated.Value(0));
  const screen = FIRST_RUN_SCREENS[index];

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled === true);
      })
      .catch(() => {
        if (!cancelled) setReduceMotion(true);
      });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled === true);
    });
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      shift.setValue(0);
      return;
    }
    opacity.setValue(0);
    shift.setValue(8);
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(shift, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]);
    anim.start();
    return () => {
      anim.stop();
    };
  }, [index, opacity, reduceMotion, shift]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') settleFirstRunMotion({ opacity, shift });
    });
    return () => {
      sub.remove();
      settleFirstRunMotion({ opacity, shift });
    };
  }, [opacity, shift]);

  function moveTo(next: number) {
    indexRef.current = next;
    setIndex(next);
    pager.current?.scrollTo({ y: next * pageHeight, animated: !reduceMotion });
  }

  function onContinue() {
    const current = indexRef.current;
    if (isFirstRunFinishAction(current)) {
      onFinished();
      return;
    }
    moveTo(nextFirstRunIndex(current));
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.max(
      0,
      Math.min(
        Math.round(event.nativeEvent.contentOffset.y / Math.max(pageHeight, 1)),
        FIRST_RUN_SCREENS.length - 1,
      ),
    );
    indexRef.current = next;
    setIndex(next);
  }

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="Lampy 引导">
      <ScrollView
        ref={pager}
        pagingEnabled
        testID="first-run-pager"
        onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
        onMomentumScrollEnd={onScrollEnd}
        showsVerticalScrollIndicator={false}
        accessibilityRole="adjustable"
        accessibilityLabel="引导页，上滑翻页"
        style={styles.pager}
      >
        {FIRST_RUN_SCREENS.map((item) => (
          <View
            key={item.id}
            style={[styles.page, { width, height: pageHeight }]}
            testID={`first-run-${item.id}`}
          >
            <ScrollView
              style={styles.pageScroll}
              contentContainerStyle={[styles.pageCopy, { paddingTop: compact ? 24 : 48 }]}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Animated.View
                style={{
                  opacity: item.id === screen.id ? opacity : 1,
                  transform: [{ translateY: item.id === screen.id ? shift : 0 }],
                }}
              >
                <FirstRunScene id={item.id} />
              </Animated.View>
              <Text style={styles.title} accessibilityRole="header">
                {item.title}
              </Text>
              <Text style={styles.body}>{item.body}</Text>
            </ScrollView>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.progress} testID="first-run-progress">
          {index + 1} / {FIRST_RUN_SCREENS.length}
        </Text>
        {finishError ? (
          <Text style={styles.body} testID="first-run-finish-error">
            {finishError}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={screen.action}
          testID="first-run-continue"
          onPress={onContinue}
          style={styles.hit}
        >
          <Text style={styles.action}>{screen.action}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  pager: { flex: 1 },
  page: { overflow: 'hidden' },
  pageScroll: { flex: 1 },
  pageCopy: { paddingHorizontal: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 28, lineHeight: 36, color: ink },
  body: { fontSize: 17, lineHeight: 26, color: inkSoft },
  footer: { flexShrink: 0, paddingHorizontal: 24, paddingBottom: 16, gap: 8 },
  progress: { fontSize: 15, lineHeight: 22, color: inkSoft },
  action: { fontSize: 20, lineHeight: 28, color: sage },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
