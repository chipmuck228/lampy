import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text, type } from './life-text';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  FIRST_RUN_SCREENS,
  firstRunInnerCanScroll,
  firstRunPageAfterInnerSwipe,
  firstRunPageFromOffset,
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
  const [copyViewH, setCopyViewH] = useState(0);
  const [copyContentH, setCopyContentH] = useState(0);
  const innerScrolls = firstRunInnerCanScroll(copyContentH, copyViewH);
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
      sub?.remove?.();
      settleFirstRunMotion({ opacity, shift });
    };
  }, [opacity, shift]);

  function moveTo(next: number) {
    if (next !== indexRef.current) {
      setCopyViewH(0);
      setCopyContentH(0);
    }
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
    const next = firstRunPageFromOffset(
      event.nativeEvent.contentOffset.y,
      pageHeight,
      FIRST_RUN_SCREENS.length,
    );
    indexRef.current = next;
    setIndex(next);
  }

  function onInnerEndDrag(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = firstRunPageAfterInnerSwipe({
      canScroll: innerScrolls,
      offsetY: event.nativeEvent.contentOffset.y,
      viewHeight: event.nativeEvent.layoutMeasurement.height,
      contentHeight: event.nativeEvent.contentSize.height,
      velocityY: event.nativeEvent.velocity?.y ?? 0,
      index: indexRef.current,
    });
    if (next != null) moveTo(next);
  }

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="Lampy 引导">
      <ScrollView
        ref={pager}
        pagingEnabled
        scrollEnabled={!innerScrolls}
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
              testID={`first-run-copy-${item.id}`}
              style={styles.pageScroll}
              contentContainerStyle={[styles.pageCopy, { paddingTop: compact ? 24 : 48 }]}
              scrollEnabled={innerScrolls && item.id === screen.id}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              onLayout={(event) => {
                if (item.id === screen.id) setCopyViewH(event.nativeEvent.layout.height);
              }}
              onContentSizeChange={(_, contentHeight) => {
                if (item.id === screen.id) setCopyContentH(contentHeight);
              }}
              onScrollEndDrag={item.id === screen.id ? onInnerEndDrag : undefined}
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
  title: { ...type.title, color: ink },
  body: { ...type.body, color: inkSoft },
  footer: { flexShrink: 0, paddingHorizontal: 24, paddingBottom: 16, gap: 8 },
  progress: { ...type.meta, color: inkSoft },
  action: { ...type.action, color: sage },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
