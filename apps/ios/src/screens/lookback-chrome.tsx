import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { findNodeHandle, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { Text, type } from './life-text';
import { RootNavBand, RootReadingLayout } from './root-nav-band';
import { usePageMetrics } from './use-page-metrics';

import type { FeelingView } from '../application/feeling';
import { LOOKBACK_PAGE_GUTTER } from '../application/lookback-month';
import { lookbackLocateIsCurrent, requestLookbackLocate } from '../application/lookback-locate';
import { rememberLookbackScroll, readLookbackScroll } from '../application/lookback-session';
import type { AudioView, ImageView, UnknownMediaView } from '../application/use-cases';
import { MomentAudio, MomentUnknownMedia } from './moment-audio';
import { MomentFeeling } from './moment-feeling';
import { MomentImages } from './moment-images';

export function lookbackHref(path: string): Href {
  return path as Href;
}

export function momentHref(id: string): Href {
  return { pathname: '/moment/[id]', params: { id } } as Href;
}

type LookbackLocateApi = {
  locateKey: string | null;
  generation: number;
  scrollRef: RefObject<ScrollView | null>;
  readOffset: () => number;
  isCurrent: (id: string, seq: number) => boolean;
  finishLocate: (id: string, seq: number) => void;
};

const LookbackLocateContext = createContext<LookbackLocateApi | null>(null);

type MeasurableNode = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
  measureLayout?: (
    relativeTo: number,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail: () => void,
  ) => void;
};

export function LookbackLocateAnchor({ id }: { id: string }) {
  const api = useContext(LookbackLocateContext);
  const node = useRef<View>(null);
  const scrolled = useRef(false);
  const active = !!api && api.locateKey === id;

  useEffect(() => {
    if (!active) scrolled.current = false;
  }, [active]);

  function tryLocate() {
    if (!api || api.locateKey !== id || scrolled.current) return;
    const seq = api.generation;
    const view = node.current as (View & MeasurableNode) | null;
    const scroll = api.scrollRef.current as (ScrollView & MeasurableNode) | null;
    if (!view || !scroll) return;
    const scrollHandle = findNodeHandle(scroll);
    requestLookbackLocate({
      measureAnchorWindow: typeof view.measureInWindow === 'function' ? view.measureInWindow.bind(view) : null,
      measureScrollWindow: typeof scroll.measureInWindow === 'function' ? scroll.measureInWindow.bind(scroll) : null,
      measureAnchorInScroll:
        typeof view.measureLayout === 'function' && scrollHandle != null
          ? (onSuccess, onFail) => {
              view.measureLayout?.(scrollHandle, onSuccess, onFail);
            }
          : undefined,
      readOffset: api.readOffset,
      isCurrent: () => api.isCurrent(id, seq),
      consume: (y) => {
        if (scrolled.current || !api.isCurrent(id, seq)) return;
        scrolled.current = true;
        scroll.scrollTo({ y, animated: false });
        api.finishLocate(id, seq);
      },
    });
  }

  useEffect(() => {
    if (!active || scrolled.current) return undefined;
    const frame = requestAnimationFrame(() => {
      tryLocate();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, api, id]);

  return (
    <View
      ref={node}
      collapsable={false}
      testID={`lookback-book-locate-${id}`}
      onLayout={() => {
        tryLocate();
      }}
    />
  );
}

export function lookbackLayoutFor(width: number, height: number) {
  return {
    readingWidth: Math.min(width, 720),
    verticalTime: width < 600,
    shortHeight: height < 500,
    maxBar: Math.min(width, 720) - 48,
  };
}

export function useLookbackLayout() {
  const { width, height } = usePageMetrics();
  return lookbackLayoutFor(width, height);
}

export function LookbackScaffold({
  title,
  path,
  children,
  footer,
  root,
  locateKey = null,
  locateSeq = 0,
  onLocated,
  onBack,
  onGoRecent,
  onLeave,
  onFamily,
}: {
  title: string;
  path: string;
  children: ReactNode;
  footer?: ReactNode;
  root?: boolean;
  locateKey?: string | null;
  locateSeq?: number;
  onLocated?: () => void;
  onBack?: () => void;
  onGoRecent?: () => void;
  onLeave?: () => void;
  onFamily?: () => void;
}) {
  const router = useRouter();
  const { readingWidth, shortHeight } = useLookbackLayout();
  const scrollRef = useRef<ScrollView>(null);
  const restoreOnce = useRef(false);
  const locateKeyRef = useRef(locateKey);
  const locateSeqRef = useRef(locateSeq);
  const onLocatedRef = useRef(onLocated);
  useLayoutEffect(() => {
    locateKeyRef.current = locateKey;
    locateSeqRef.current = locateSeq;
    onLocatedRef.current = onLocated;
  });
  const locate = useMemo(
    () => ({
      locateKey,
      generation: locateKey ? locateSeq : 0,
      scrollRef,
      readOffset: () => readLookbackScroll(path),
      isCurrent: (id: string, seq: number) =>
        lookbackLocateIsCurrent(id, seq, locateKeyRef.current, locateSeqRef.current),
      finishLocate: (id: string, seq: number) => {
        if (lookbackLocateIsCurrent(id, seq, locateKeyRef.current, locateSeqRef.current)) {
          onLocatedRef.current?.();
        }
      },
    }),
    [locateKey, locateSeq, path],
  );

  useFocusEffect(() => {
    restoreOnce.current = false;
    return undefined;
  });

  const content = (
    <>
      {root ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回原来的位置"
          testID="lookback-back"
          onPress={() => (onBack ? onBack() : router.back())}
          style={styles.backHit}
        >
          <Text style={styles.back}>返回原来的位置</Text>
        </Pressable>
      )}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {locateKey ? (
        <View testID="lookback-book-locating" accessibilityLabel={locateKey} />
      ) : null}
      {children}
      {footer}
    </>
  );

  const scrollProps = {
    onContentSizeChange: () => {
      if (locateKey) {
        restoreOnce.current = true;
        return;
      }
      if (restoreOnce.current) return;
      restoreOnce.current = true;
      scrollRef.current?.scrollTo({ y: readLookbackScroll(path), animated: false });
    },
    onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      rememberLookbackScroll(path, event.nativeEvent.contentOffset.y);
    },
    onScrollBeginDrag: () => {
      if (locateKeyRef.current) onLocatedRef.current?.();
    },
  };

  const body =
    root && onGoRecent && onLeave ? (
      <RootReadingLayout
        scrollTestID="lookback-scroll"
        scrollRef={scrollRef}
        contentContainerStyle={[
          styles.column,
          { maxWidth: readingWidth, paddingTop: shortHeight ? 8 : 16, paddingBottom: 8 },
        ]}
        onContentSizeChange={scrollProps.onContentSizeChange}
        onScroll={scrollProps.onScroll}
        onScrollBeginDrag={scrollProps.onScrollBeginDrag}
        band={
          <RootNavBand here="lookback" onOther={onGoRecent} onLeave={onLeave} onFamily={onFamily} />
        }
      >
        {content}
      </RootReadingLayout>
    ) : (
      <SafeAreaView style={styles.safe} accessible={false}>
        <ScrollView
          ref={scrollRef}
          testID="lookback-scroll"
          style={styles.scroll}
          contentContainerStyle={[
            styles.column,
            { maxWidth: readingWidth, paddingTop: shortHeight ? 8 : 16 },
          ]}
          onContentSizeChange={scrollProps.onContentSizeChange}
          onScroll={scrollProps.onScroll}
          onScrollBeginDrag={scrollProps.onScrollBeginDrag}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      </SafeAreaView>
    );

  return <LookbackLocateContext.Provider value={locate}>{body}</LookbackLocateContext.Provider>;
}

export function DensityBand({ count, max, label }: { count: number; max: number; label: string }) {
  const { maxBar } = useLookbackLayout();
  const width = max <= 0 || count <= 0 ? 0 : Math.max(12, Math.round((count / max) * Math.min(160, maxBar * 0.4)));
  return (
    <View accessible={false} style={styles.bandRow}>
      <View style={[styles.band, { width }]} />
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

export function HistoryMomentRow({
  id,
  note,
  timeLabel,
  recordedFallbackLabel,
  feeling,
  images,
  audio,
  unknownMedia,
  onPress,
}: {
  id: string;
  note: string;
  timeLabel: string;
  recordedFallbackLabel?: string;
  feeling?: FeelingView | null;
  images: ImageView[];
  audio: AudioView | null;
  unknownMedia: UnknownMediaView[];
  onPress: () => void;
}) {
  const summary =
    [
      note,
      ...images.map((image) => image.label),
      audio?.label || '',
      ...unknownMedia.map((item) => item.label),
      feeling ? `当时的感受，${feeling.label}` : '',
    ]
      .filter(Boolean)
      .join('，') || '一条记录';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}，${summary}`}
      testID={`lookback-moment-${id}`}
      hitSlop={8}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={styles.meta}>{timeLabel}</Text>
      {recordedFallbackLabel ? <Text style={styles.fallback}>{recordedFallbackLabel}</Text> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <MomentImages images={images} testIDPrefix={`lookback-image-${id}`} />
      <MomentAudio audio={audio} testIDPrefix={`lookback-sound-${id}`} compact />
      <MomentUnknownMedia items={unknownMedia} testIDPrefix={`lookback-unknown-${id}`} />
      <MomentFeeling feeling={feeling ?? null} testID={`lookback-feeling-${id}`} />
    </Pressable>
  );
}

export function LookbackMessage({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text style={styles.body} testID={testID}>
      {children}
    </Text>
  );
}

export const lookbackStyles = StyleSheet.create({
  hit: { minHeight: 44, justifyContent: 'center' },
  action: { ...type.action, color: '#53604F' },
  cell: { minHeight: 44, paddingVertical: 8, gap: 4, flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stack: { gap: 12 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E9' },
  scroll: { flex: 1, width: '100%' },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'center',
    paddingHorizontal: LOOKBACK_PAGE_GUTTER,
    paddingBottom: 32,
    gap: 16,
  },
  backHit: { minHeight: 44, justifyContent: 'center', flexShrink: 0 },
  back: { ...type.action, color: '#53604F' },
  title: { ...type.title, color: '#25231F', flexShrink: 1, minWidth: 0 },
  body: { ...type.action, color: '#5C5851' },
  meta: { ...type.meta, color: '#53604F' },
  fallback: { ...type.meta, color: '#5C5851' },
  note: { ...type.body, color: '#25231F' },
  row: {
    gap: 4,
    paddingVertical: 8,
    minHeight: 44,
    flexGrow: 0,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  band: { height: 6, borderRadius: 3, backgroundColor: '#8A9384' },
});
