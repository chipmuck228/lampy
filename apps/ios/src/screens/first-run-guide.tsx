import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './life-text';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  FIRST_RUN_SCREENS,
  firstRunBodyLines,
  firstRunCopyAllowsInnerScroll,
  firstRunFrameChanged,
  firstRunPageAfterInnerSwipe,
  firstRunPageFromOffset,
  firstRunPagerOffset,
  firstRunProgressLabel,
  firstRunShouldAnimatePage,
  firstRunShouldInvalidateCopyMeasures,
  invalidateFirstRunCopyMeasures,
  isFirstRunFinishAction,
  nextFirstRunIndex,
  prevFirstRunIndex,
  rememberFirstRunCopyMeasure,
  settleFirstRunMotion,
  type FirstRunCopyMeasures,
} from '../application/first-run';
import { isCompactHeight, pageGutter, readingWidth } from './life-page';
import { FirstRunScene, firstRunPhotoBox } from './first-run-scene';

const mark = require('../../assets/images/splash-icon.png');

const PAPER = '#f8f6ef';
const TITLE = '#353b32';
const TITLE_ACCENT = '#899480';
const BODY = '#838a7c';
const STEP = '#d7d9ce';
const STEP_FILLED = '#788672';
const BACK = '#848c7d';
const ACTION = '#414d3d';
const ACTION_FILL = '#e8ebe1';
const ACTION_LINE = '#d1d7ca';
const MARK = '#ae895b';

export function FirstRunGuide({
  onFinished,
  finishError,
}: {
  onFinished: () => void;
  finishError?: string | null;
}) {
  const { width, height } = useWindowDimensions();
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const frameRef = useRef({ width: 0, height: 0 });
  const pageWidth = frame.width;
  const pageHeight = frame.height;
  const layoutWidth = pageWidth > 0 ? pageWidth : width;
  const layoutHeight = pageHeight > 0 ? pageHeight : height;
  const compact = isCompactHeight(layoutHeight);
  const gutter = pageGutter(layoutWidth, layoutHeight);
  const column = readingWidth(layoutWidth, layoutHeight);
  const photoBox = firstRunPhotoBox(layoutWidth, layoutHeight);
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [copyMeasures, setCopyMeasures] = useState<FirstRunCopyMeasures>({});
  const copyMeasuresRef = useRef<FirstRunCopyMeasures>({});
  const screen = FIRST_RUN_SCREENS[index];
  const innerScrolls = firstRunCopyAllowsInnerScroll(copyMeasures[screen.id]);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  const [shift] = useState(() => new Animated.Value(0));
  const [photoOpacity] = useState(() => new Animated.Value(1));
  const motionGen = useRef(0);
  const appStateRef = useRef(AppState.currentState);

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
    if (!firstRunShouldAnimatePage(reduceMotion, appStateRef.current)) {
      settleFirstRunMotion({ opacity, shift, photoOpacity });
      return;
    }
    photoOpacity.setValue(0);
    opacity.setValue(0);
    shift.setValue(13);
    const anim = Animated.parallel([
      Animated.timing(photoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 580, useNativeDriver: true }),
      Animated.timing(shift, { toValue: 0, duration: 580, useNativeDriver: true }),
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
      appStateRef.current = state;
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

  function alignPager(nextIndex: number, nextPageHeight: number, animated: boolean) {
    if (nextPageHeight <= 0) return;
    pager.current?.scrollTo({ y: firstRunPagerOffset(nextIndex, nextPageHeight), animated });
  }

  function onFrameLayout(event: { nativeEvent: { layout: { width: number; height: number } } }) {
    const next = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
    const prev = frameRef.current;
    if (!firstRunFrameChanged(prev, next)) return;
    if (firstRunShouldInvalidateCopyMeasures(prev, next)) {
      copyMeasuresRef.current = invalidateFirstRunCopyMeasures();
      setCopyMeasures(copyMeasuresRef.current);
    }
    frameRef.current = next;
    setFrame(next);
    alignPager(indexRef.current, next.height, false);
  }

  function recordCopyMeasure(id: string, patch: Partial<{ viewH: number; contentH: number }>) {
    setCopyMeasures((current) => {
      const next = rememberFirstRunCopyMeasure(current, id, {
        viewH: patch.viewH ?? current[id]?.viewH ?? 0,
        contentH: patch.contentH ?? current[id]?.contentH ?? 0,
      });
      copyMeasuresRef.current = next;
      return next;
    });
  }

  function moveTo(next: number) {
    if (next === indexRef.current) return;
    motionGen.current += 1;
    settleFirstRunMotion({ opacity, shift, photoOpacity });
    indexRef.current = next;
    setIndex(next);
    alignPager(next, frameRef.current.height, !reduceMotion);
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
      frameRef.current.height,
      FIRST_RUN_SCREENS.length,
    );
    if (next === indexRef.current) return;
    motionGen.current += 1;
    settleFirstRunMotion({ opacity, shift, photoOpacity });
    indexRef.current = next;
    setIndex(next);
  }

  function onInnerEndDrag(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const current = indexRef.current;
    const currentId = FIRST_RUN_SCREENS[current]?.id;
    const next = firstRunPageAfterInnerSwipe({
      canScroll: firstRunCopyAllowsInnerScroll(currentId ? copyMeasuresRef.current[currentId] : undefined),
      offsetY: event.nativeEvent.contentOffset.y,
      viewHeight: event.nativeEvent.layoutMeasurement.height,
      contentHeight: event.nativeEvent.contentSize.height,
      velocityY: event.nativeEvent.velocity?.y ?? 0,
      index: current,
    });
    if (next != null) moveTo(next);
  }

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="Lampy 引导">
      <View style={[styles.header, { height: compact ? 53 : 61, paddingHorizontal: gutter }]} testID="first-run-mark-row">
        <Image source={mark} accessibilityLabel="Lampy" style={styles.markIcon} resizeMode="contain" />
        <Text style={styles.markWord}>Lampy</Text>
      </View>
      <View testID="first-run-frame" collapsable={false} style={styles.frame} onLayout={onFrameLayout}>
        <ScrollView
          ref={pager}
          pagingEnabled
          scrollEnabled={!innerScrolls}
          testID="first-run-pager"
          onLayout={onFrameLayout}
          onMomentumScrollEnd={onScrollEnd}
          showsVerticalScrollIndicator={false}
          accessibilityRole="adjustable"
          accessibilityLabel="引导页，上滑翻页"
          style={styles.pager}
        >
          {FIRST_RUN_SCREENS.map((item) => (
            <View
              key={item.id}
              style={[
                styles.page,
                {
                  width: pageWidth > 0 ? pageWidth : '100%',
                  height: pageHeight > 0 ? pageHeight : '100%',
                },
              ]}
              testID={`first-run-${item.id}`}
            >
              <ScrollView
                testID={`first-run-copy-${item.id}`}
                style={styles.pageScroll}
                contentContainerStyle={[
                  styles.pageCopy,
                  {
                    paddingTop: compact ? 8 : 12,
                    paddingHorizontal: gutter,
                    maxWidth: column + gutter * 2,
                  },
                ]}
                scrollEnabled={firstRunCopyAllowsInnerScroll(copyMeasures[item.id]) && item.id === screen.id}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                onLayout={(event) => {
                  recordCopyMeasure(item.id, { viewH: event.nativeEvent.layout.height });
                }}
                onContentSizeChange={(_, contentHeight) => {
                  if (typeof contentHeight !== 'number') return;
                  recordCopyMeasure(item.id, { contentH: contentHeight });
                }}
                onScrollEndDrag={item.id === screen.id ? onInnerEndDrag : undefined}
              >
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
                    marginTop: compact ? 16 : 23,
                    alignSelf: 'stretch',
                  }}
                >
                  <Text
                    style={[styles.title, compact ? styles.titleCompact : null]}
                    accessibilityRole="header"
                    accessibilityLabel={item.title}
                  >
                    {item.titleLines.map((line, lineIndex) => (
                      <Text
                        key={line}
                        style={lineIndex === item.titleAccentIndex ? styles.titleAccent : undefined}
                      >
                        {lineIndex > 0 ? '\n' : ''}
                        {line}
                      </Text>
                    ))}
                  </Text>
                  <Text style={[styles.body, compact ? styles.bodyCompact : null]}>
                    {firstRunBodyLines(item.body).map((line, lineIndex) => (
                      <Text key={line}>
                        {lineIndex > 0 ? '\n' : ''}
                        {line}
                      </Text>
                    ))}
                  </Text>
                </Animated.View>
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      </View>
      <View style={[styles.footer, { paddingHorizontal: gutter, maxWidth: column + gutter * 2, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.footerTop}>
          <View
            style={styles.steps}
            testID="first-run-progress"
            accessibilityRole="adjustable"
            accessibilityLabel={firstRunProgressLabel(index, FIRST_RUN_SCREENS.length)}
          >
            {FIRST_RUN_SCREENS.map((item, step) => (
              <View
                key={item.id}
                testID={`first-run-step-${step}`}
                style={[styles.step, step <= index ? styles.stepFilled : null]}
              />
            ))}
          </View>
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
  safe: { flex: 1, backgroundColor: PAPER },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  markIcon: { width: 16, height: 16, tintColor: MARK },
  markWord: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -1.1,
    color: TITLE,
  },
  frame: { flex: 1, width: '100%', overflow: 'hidden' },
  pager: { flex: 1, width: '100%' },
  page: { overflow: 'hidden', alignItems: 'center' },
  pageScroll: { flex: 1, width: '100%' },
  pageCopy: { flexGrow: 1, width: '100%', alignSelf: 'center', alignItems: 'flex-start' },
  title: {
    fontFamily: 'Songti SC',
    fontSize: 30,
    lineHeight: 44,
    fontWeight: '500',
    letterSpacing: 0.6,
    color: TITLE,
  },
  titleAccent: { color: TITLE_ACCENT },
  titleCompact: { fontSize: 25, lineHeight: 34 },
  body: {
    fontFamily: 'Songti SC',
    fontSize: 11,
    lineHeight: 20,
    letterSpacing: 0.22,
    color: BODY,
    marginTop: 14,
  },
  bodyCompact: { fontSize: 10, lineHeight: 16, marginTop: 9 },
  footer: { flexShrink: 0, paddingBottom: 16, gap: 12 },
  footerTop: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { width: 22, height: 2, backgroundColor: STEP },
  stepFilled: { backgroundColor: STEP_FILLED },
  back: { fontSize: 11, lineHeight: 16, color: BACK },
  backHit: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'flex-end' },
  action: { fontSize: 13, lineHeight: 18, color: ACTION, letterSpacing: 1.6 },
  actionHit: {
    minHeight: 48,
    height: 55,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ACTION_FILL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ACTION_LINE,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
});
