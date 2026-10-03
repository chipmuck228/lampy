import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './life-text';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  FIRST_RUN_COPY_FADE_DELAY_MS,
  FIRST_RUN_COPY_FADE_MS,
  FIRST_RUN_PHOTO_FADE_MS,
  FIRST_RUN_SCREENS,
  firstRunBodyLines,
  firstRunCanStartEnterMotion,
  firstRunCopyAllowsInnerScroll,
  firstRunCopyColumnWidth,
  firstRunFrameChanged,
  firstRunPageAfterInnerSwipe,
  firstRunPageFromOffset,
  firstRunPagerOffset,
  firstRunParkedPageOpacity,
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
  type FirstRunMotionDelay,
  type FirstRunPhotoReady,
} from '../application/first-run';
import { FIRST_RUN_MARK, FIRST_RUN_SANS, FIRST_RUN_SERIF, loadFirstRunFonts } from './first-run-fonts';
import { isCompactHeight, pageGutter } from './life-page';
import { FirstRunScene, firstRunPhotoBox } from './first-run-scene';

const mark = require('../../assets/images/splash-icon.png');

const PAPER = '#f8f6ef';
const TITLE = '#25231F';
const TITLE_ACCENT = '#53604F';
const BODY = '#5C5851';
const STEP = '#d7d9ce';
const STEP_FILLED = '#788672';
const BACK = '#5C5851';
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
  const photoBox = firstRunPhotoBox(layoutWidth, layoutHeight);
  const copyWidth = firstRunCopyColumnWidth(photoBox.width, layoutWidth, layoutHeight);
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [copyMeasures, setCopyMeasures] = useState<FirstRunCopyMeasures>({});
  const copyMeasuresRef = useRef<FirstRunCopyMeasures>({});
  const screen = FIRST_RUN_SCREENS[index];
  const innerScrolls = firstRunCopyAllowsInnerScroll(copyMeasures[screen.id]);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [fontsReady, setFontsReady] = useState(false);
  const [photoReady, setPhotoReady] = useState<Record<string, FirstRunPhotoReady>>({});
  const [opacity] = useState(() => new Animated.Value(1));
  const [shift] = useState(() => new Animated.Value(0));
  const [photoOpacity] = useState(() => new Animated.Value(1));
  const motionGen = useRef(0);
  const copyDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayHandle: FirstRunMotionDelay = copyDelay;
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    let cancelled = false;
    loadFirstRunFonts()
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontsReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const pagePhotoReady = photoReady[screen.id] ?? 'pending';

  useEffect(() => {
    const gen = ++motionGen.current;
    if (!firstRunShouldAnimatePage(reduceMotion, appStateRef.current)) {
      settleFirstRunMotion({ opacity, shift, photoOpacity, delay: delayHandle });
      return;
    }
    if (!firstRunCanStartEnterMotion(pagePhotoReady)) {
      photoOpacity.setValue(0);
      opacity.setValue(0);
      shift.setValue(0);
      return;
    }
    photoOpacity.setValue(0);
    opacity.setValue(0);
    shift.setValue(0);
    if (pagePhotoReady === 'failed') {
      settleFirstRunMotion({ opacity, shift, delay: delayHandle });
      return;
    }
    const photo = Animated.timing(photoOpacity, {
      toValue: 1,
      duration: FIRST_RUN_PHOTO_FADE_MS,
      useNativeDriver: true,
    });
    photo.start(({ finished }) => {
      if (!finished || gen !== motionGen.current) return;
    });
    copyDelay.current = setTimeout(() => {
      if (gen !== motionGen.current) return;
      Animated.timing(opacity, {
        toValue: 1,
        duration: FIRST_RUN_COPY_FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || gen !== motionGen.current) return;
      });
    }, FIRST_RUN_COPY_FADE_DELAY_MS);
    return () => {
      photo.stop();
      if (copyDelay.current != null) {
        clearTimeout(copyDelay.current);
        copyDelay.current = null;
      }
    };
  }, [delayHandle, index, opacity, pagePhotoReady, photoOpacity, reduceMotion, shift]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
      if (state !== 'active') {
        motionGen.current += 1;
        setLeavingId(null);
        settleFirstRunMotion({ opacity, shift, photoOpacity, delay: delayHandle });
      }
    });
    return () => {
      sub?.remove?.();
      motionGen.current += 1;
      settleFirstRunMotion({ opacity, shift, photoOpacity, delay: delayHandle });
    };
  }, [delayHandle, opacity, photoOpacity, shift]);

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

  function recordPhotoReady(id: string, next: FirstRunPhotoReady) {
    setPhotoReady((current) => (current[id] === next ? current : { ...current, [id]: next }));
  }

  function moveTo(next: number) {
    if (next === indexRef.current) return;
    motionGen.current += 1;
    if (copyDelay.current != null) {
      clearTimeout(copyDelay.current);
      copyDelay.current = null;
    }
    photoOpacity.stopAnimation();
    opacity.stopAnimation();
    shift.stopAnimation();
    photoOpacity.setValue(0);
    opacity.setValue(0);
    shift.setValue(0);
    setLeavingId(FIRST_RUN_SCREENS[indexRef.current].id);
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
    setLeavingId(null);
    const next = firstRunPageFromOffset(
      event.nativeEvent.contentOffset.y,
      frameRef.current.height,
      FIRST_RUN_SCREENS.length,
    );
    if (next === indexRef.current) return;
    motionGen.current += 1;
    photoOpacity.stopAnimation();
    opacity.stopAnimation();
    shift.stopAnimation();
    if (copyDelay.current != null) {
      clearTimeout(copyDelay.current);
      copyDelay.current = null;
    }
    photoOpacity.setValue(0);
    opacity.setValue(0);
    shift.setValue(0);
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

  const serif = fontsReady ? FIRST_RUN_SERIF : 'Songti SC';
  const sans = fontsReady ? FIRST_RUN_SANS : undefined;
  const markFace = fontsReady ? FIRST_RUN_MARK : undefined;

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="Lampy 引导">
      <View style={[styles.header, { height: compact ? 53 : 61, paddingHorizontal: gutter }]} testID="first-run-mark-row">
        <Image source={mark} accessibilityLabel="Lampy" style={styles.markIcon} resizeMode="contain" />
        <Text style={[styles.markWord, markFace ? { fontFamily: markFace } : null]}>Lampy</Text>
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
          {FIRST_RUN_SCREENS.map((item) => {
            const active = item.id === screen.id;
            const parked = firstRunParkedPageOpacity(active, item.id === leavingId);
            return (
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
                    },
                  ]}
                  scrollEnabled={firstRunCopyAllowsInnerScroll(copyMeasures[item.id]) && active}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  onLayout={(event) => {
                    recordCopyMeasure(item.id, { viewH: event.nativeEvent.layout.height });
                  }}
                  onContentSizeChange={(_, contentHeight) => {
                    if (typeof contentHeight !== 'number') return;
                    recordCopyMeasure(item.id, { contentH: contentHeight });
                  }}
                  onScrollEndDrag={active ? onInnerEndDrag : undefined}
                >
                  <Animated.View style={{ opacity: parked == null ? photoOpacity : parked }}>
                    <FirstRunScene
                      id={item.id}
                      photo={item.photo}
                      photoAlt={item.photoAlt}
                      photoNote={item.photoNote}
                      photoWidth={photoBox.width}
                      photoHeight={photoBox.height}
                      noteFontFamily={serif}
                      onPhotoReady={(next) => recordPhotoReady(item.id, next)}
                    />
                  </Animated.View>
                  <Animated.View
                    testID={`first-run-copy-block-${item.id}`}
                    style={{
                      opacity: parked == null ? opacity : parked,
                      transform: [{ translateY: parked == null ? shift : 0 }],
                      marginTop: compact ? 16 : 22,
                      width: copyWidth,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <View accessibilityRole="header" accessibilityLabel={item.title}>
                      {item.titleLines.map((line, lineIndex) => (
                        <Text
                          key={line}
                          style={[
                            styles.title,
                            compact ? styles.titleCompact : null,
                            { fontFamily: serif },
                            lineIndex === item.titleAccentIndex ? styles.titleAccent : null,
                          ]}
                        >
                          {line}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.bodyBlock}>
                      {firstRunBodyLines(item.body).map((line) => (
                        <Text key={line} style={[styles.body, sans ? { fontFamily: sans } : null]}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  </Animated.View>
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      </View>
      <View style={[styles.footer, { paddingHorizontal: gutter, width: '100%' }]}>
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
              <Text style={[styles.back, sans ? { fontFamily: sans } : null]}>上一屏</Text>
            </Pressable>
          ) : null}
        </View>
        {finishError ? (
          <Text style={[styles.body, sans ? { fontFamily: sans } : null]} testID="first-run-finish-error">
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
          <Text style={[styles.action, sans ? { fontFamily: sans } : null]}>{screen.action}</Text>
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
    fontSize: 31,
    lineHeight: 45,
    fontWeight: '500',
    letterSpacing: 0.4,
    color: TITLE,
  },
  titleAccent: { color: TITLE_ACCENT },
  titleCompact: { fontSize: 28, lineHeight: 40 },
  bodyBlock: { marginTop: 14 },
  body: {
    fontSize: 16,
    lineHeight: 27,
    letterSpacing: 0.2,
    color: BODY,
  },
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
  back: { fontSize: 15, lineHeight: 22, color: BACK },
  backHit: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'flex-end' },
  action: { fontSize: 16, lineHeight: 22, color: ACTION, letterSpacing: 1.2 },
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
