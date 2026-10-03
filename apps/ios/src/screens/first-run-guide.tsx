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
  prevFirstRunIndex,
  settleFirstRunMotion,
} from '../application/first-run';
import { hairline, ink, inkSoft, isCompactHeight, pageGutter, paper, paperDeep, readingWidth, sage } from './life-page';
import { FirstRunScene, firstRunPhotoBox } from './first-run-scene';

export function FirstRunGuide({
  onFinished,
  finishError,
}: {
  onFinished: () => void;
  finishError?: string | null;
}) {
  const { width, height } = useWindowDimensions();
  const compact = isCompactHeight(height);
  const gutter = pageGutter(width, height);
  const column = readingWidth(width, height);
  const photoBox = firstRunPhotoBox(width, height);
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
  const [photoOpacity] = useState(() => new Animated.Value(1));
  const motionGen = useRef(0);
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
    const gen = ++motionGen.current;
    if (reduceMotion) {
      settleFirstRunMotion({ opacity, shift, photoOpacity });
      return;
    }
    photoOpacity.setValue(0.65);
    opacity.setValue(0);
    shift.setValue(10);
    const anim = Animated.parallel([
      Animated.timing(photoOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(shift, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (!finished || gen !== motionGen.current) return;
    });
    return () => {
      anim.stop();
    };
  }, [index, opacity, photoOpacity, reduceMotion, shift]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        motionGen.current += 1;
        settleFirstRunMotion({ opacity, shift, photoOpacity });
      }
    });
    return () => {
      sub?.remove?.();
      motionGen.current += 1;
      settleFirstRunMotion({ opacity, shift, photoOpacity });
    };
  }, [opacity, photoOpacity, shift]);

  function moveTo(next: number) {
    if (next === indexRef.current) return;
    motionGen.current += 1;
    settleFirstRunMotion({ opacity, shift, photoOpacity });
    setCopyViewH(0);
    setCopyContentH(0);
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

  function onBack() {
    const current = indexRef.current;
    if (current <= 0) return;
    moveTo(prevFirstRunIndex(current));
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = firstRunPageFromOffset(
      event.nativeEvent.contentOffset.y,
      pageHeight,
      FIRST_RUN_SCREENS.length,
    );
    if (next === indexRef.current) return;
    motionGen.current += 1;
    settleFirstRunMotion({ opacity, shift, photoOpacity });
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
              contentContainerStyle={[
                styles.pageCopy,
                {
                  paddingTop: compact ? 16 : 28,
                  paddingHorizontal: gutter,
                  maxWidth: column + gutter * 2,
                },
              ]}
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
              <Text style={styles.mark} accessibilityRole="header">
                Lampy
              </Text>
              <Animated.View style={{ opacity: item.id === screen.id ? photoOpacity : 1 }}>
                <FirstRunScene
                  id={item.id}
                  photo={item.photo}
                  photoAlt={item.photoAlt}
                  photoNote={item.photoNote}
                  photoWidth={photoBox.width}
                  photoHeight={photoBox.height}
                />
              </Animated.View>
              <Animated.View
                style={{
                  opacity: item.id === screen.id ? opacity : 1,
                  transform: [{ translateY: item.id === screen.id ? shift : 0 }],
                  gap: 12,
                }}
              >
                <Text style={styles.title} accessibilityRole="header">
                  {item.title}
                </Text>
                <Text style={styles.body}>{item.body}</Text>
              </Animated.View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingHorizontal: gutter, maxWidth: column + gutter * 2, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.footerTop}>
          <Text style={styles.progress} testID="first-run-progress">
            {index + 1} / {FIRST_RUN_SCREENS.length}
          </Text>
          {index > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="上一屏"
              testID="first-run-back"
              onPress={onBack}
              style={styles.backHit}
            >
              <Text style={styles.back}>上一屏</Text>
            </Pressable>
          ) : null}
        </View>
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
          style={styles.actionHit}
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
  page: { overflow: 'hidden', alignItems: 'center' },
  pageScroll: { flex: 1, width: '100%' },
  pageCopy: { gap: 18, flexGrow: 1, width: '100%', alignSelf: 'center' },
  mark: { ...type.action, color: ink, letterSpacing: 0.8 },
  title: { ...type.title, color: ink },
  body: { ...type.body, color: inkSoft },
  footer: { flexShrink: 0, paddingBottom: 16, gap: 8 },
  footerTop: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progress: { ...type.meta, color: inkSoft },
  back: { ...type.meta, color: sage },
  backHit: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'flex-end' },
  action: { ...type.action, color: sage, letterSpacing: 1 },
  actionHit: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
});
