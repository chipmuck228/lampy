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
import { LifeIcon } from './life-icons';
import { LeaveFab, leaveFabScrollReserve, useLeaveFabMotion } from './leave-fab';
import { lookbackCatalogToggleLabel } from './lookback-catalog';
import { recentInk, recentKicker, recentRule, recentType } from './recent-visual';
import { RootNavBand, RootReadingLayout } from './root-nav-band';
import { usePageMetrics } from './use-page-metrics';

import type { FeelingView } from '../application/feeling';
import { LOOKBACK_PAGE_GUTTER } from '../application/lookback-month';
import { lookbackLocateIsCurrent, lookbackLocateScrollY, requestLookbackLocate } from '../application/lookback-locate';
import { rememberLookbackScroll, readLookbackScroll, rememberLookbackCatalogScroll } from '../application/lookback-session';
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

export function LookbackCatalogToggle({
  range,
  expanded,
  onPress,
  toggleRef,
}: {
  range: string | null;
  expanded: boolean;
  onPress: () => void;
  toggleRef?: RefObject<View | null>;
}) {
  return (
    <Pressable
      ref={toggleRef}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={lookbackCatalogToggleLabel(expanded)}
      testID="lookback-catalog-toggle"
      onPress={onPress}
      style={styles.catalogToggle}
    >
      <Text style={styles.catalogKicker}>时间目录</Text>
      <View style={styles.catalogRangeRow}>
        <Text style={styles.catalogRange} testID="lookback-catalog-range">
          {range ?? '时间目录'}
        </Text>
        <LifeIcon name={expanded ? 'collapse' : 'expand'} size={16} decorative />
      </View>
    </Pressable>
  );
}

export function LookbackCatalogOverlay({
  children,
  locateKey,
  locateSeq,
  onLocated,
  maxHeight,
}: {
  children: ReactNode;
  locateKey: string | null;
  locateSeq: number;
  onLocated?: () => void;
  maxHeight?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
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
      readOffset: () => offsetRef.current,
      isCurrent: (id: string, seq: number) =>
        lookbackLocateIsCurrent(id, seq, locateKeyRef.current, locateSeqRef.current),
      finishLocate: (id: string, seq: number) => {
        if (lookbackLocateIsCurrent(id, seq, locateKeyRef.current, locateSeqRef.current)) {
          onLocatedRef.current?.();
        }
      },
    }),
    [locateKey, locateSeq],
  );

  return (
    <LookbackLocateContext.Provider value={locate}>
      <View testID="lookback-catalog" style={[styles.catalog, maxHeight != null ? { maxHeight } : null]}>
        {locateKey ? (
          <View testID="lookback-book-locating" accessibilityLabel={locateKey} />
        ) : null}
        <ScrollView
          ref={scrollRef}
          testID="lookback-catalog-scroll"
          style={styles.catalogScroll}
          contentContainerStyle={styles.catalogColumn}
          onScroll={(event) => {
            offsetRef.current = event.nativeEvent.contentOffset.y;
            rememberLookbackCatalogScroll(event.nativeEvent.contentOffset.y);
          }}
          onScrollBeginDrag={() => {
            if (locateKeyRef.current) onLocatedRef.current?.();
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </LookbackLocateContext.Provider>
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
  kicker,
  subtitle,
  headerAction,
  path,
  children,
  footer,
  cover,
  root,
  locateKey = null,
  locateSeq = 0,
  readingLocked = false,
  suppressPathRestore = false,
  pendingRestoreY = null,
  restoreSeq = 0,
  onLocated,
  onRestoreDone,
  onReadingScroll,
  readingAnchorRef,
  holdWindowY = null,
  holdSeq = 0,
  onHoldDone,
  onBack,
  onGoRecent,
  onLeave,
  onFamily,
}: {
  title: string;
  kicker?: string;
  subtitle?: string;
  headerAction?: ReactNode;
  path: string;
  children: ReactNode;
  footer?: ReactNode;
  cover?: ReactNode;
  root?: boolean;
  locateKey?: string | null;
  locateSeq?: number;
  readingLocked?: boolean;
  suppressPathRestore?: boolean;
  pendingRestoreY?: number | null;
  restoreSeq?: number;
  onLocated?: () => void;
  onRestoreDone?: () => void;
  onReadingScroll?: (offsetY: number) => void;
  readingAnchorRef?: RefObject<View | null>;
  holdWindowY?: number | null;
  holdSeq?: number;
  onHoldDone?: () => void;
  onBack?: () => void;
  onGoRecent?: () => void;
  onLeave?: () => void;
  onFamily?: () => void;
}) {
  const router = useRouter();
  const { readingWidth, shortHeight } = useLookbackLayout();
  const leaveFab = useLeaveFabMotion();
  const scrollRef = useRef<ScrollView>(null);
  const restoreOnce = useRef(false);
  const restoredSeqRef = useRef<number | null>(null);
  const locateKeyRef = useRef(locateKey);
  const locateSeqRef = useRef(locateSeq);
  const onLocatedRef = useRef(onLocated);
  const holdSeqRef = useRef(holdSeq);
  useLayoutEffect(() => {
    locateKeyRef.current = locateKey;
    locateSeqRef.current = locateSeq;
    onLocatedRef.current = onLocated;
    holdSeqRef.current = holdSeq;
  });
  useLayoutEffect(() => {
    if (holdWindowY == null || !readingAnchorRef?.current) return undefined;
    const seq = holdSeq;
    const node = readingAnchorRef.current as View & {
      measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
    };
    if (typeof node.measureInWindow !== 'function') return undefined;
    const frame = requestAnimationFrame(() => {
      node.measureInWindow?.((_x, y) => {
        if (seq !== holdSeqRef.current) return;
        const next = lookbackLocateScrollY(readLookbackScroll(path), y, holdWindowY);
        scrollRef.current?.scrollTo({ y: next, animated: false });
        onHoldDone?.();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [holdSeq, holdWindowY, onHoldDone, path, readingAnchorRef]);
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

  const pinHeader = !!(root && onGoRecent);
  const heroPadTop = shortHeight ? 12 : 20;
  const pageHeader = (
    <View
      style={[
        styles.headerWrap,
        { maxWidth: readingWidth, paddingHorizontal: LOOKBACK_PAGE_GUTTER },
      ]}
    >
      <View
        style={[styles.hero, { paddingTop: heroPadTop }]}
        testID="lookback-header"
      >
        <View style={styles.heroCopy}>
          {kicker ? (
            <Text style={styles.kicker} testID="lookback-kicker">
              {kicker}
            </Text>
          ) : null}
          <Text style={styles.title} accessibilityRole="header" testID="lookback-wordmark">
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text style={styles.topMark} testID="lookback-subtitle">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {root ? <View testID="lookback-header-rule" style={styles.headerRule} /> : null}
    </View>
  );
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
      {pinHeader ? null : pageHeader}
      {headerAction}
      {locateKey && !readingLocked ? (
        <View testID="lookback-book-locating" accessibilityLabel={locateKey} />
      ) : null}
      <View
        testID="lookback-reading-tree"
        pointerEvents="auto"
        importantForAccessibility="auto"
        accessibilityElementsHidden={false}
      >
        {children}
        {footer}
      </View>
    </>
  );

  const scrollProps = {
    onContentSizeChange: () => {
      if (pendingRestoreY != null && restoredSeqRef.current !== restoreSeq) {
        restoredSeqRef.current = restoreSeq;
        restoreOnce.current = true;
        scrollRef.current?.scrollTo({ y: pendingRestoreY, animated: false });
        onRestoreDone?.();
        return;
      }
      if (locateKey || suppressPathRestore) {
        restoreOnce.current = true;
        return;
      }
      if (restoreOnce.current) return;
      restoreOnce.current = true;
      scrollRef.current?.scrollTo({ y: readLookbackScroll(path), animated: false });
    },
    onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      rememberLookbackScroll(path, event.nativeEvent.contentOffset.y);
      if (!readingLocked) leaveFab.onScroll(event.nativeEvent.contentOffset.y);
      onReadingScroll?.(event.nativeEvent.contentOffset.y);
    },
    onScrollBeginDrag: () => {
      if (locateKeyRef.current) onLocatedRef.current?.();
      onRestoreDone?.();
      onHoldDone?.();
    },
  };

  const body =
    root && onGoRecent ? (
      <RootReadingLayout
        scrollTestID="lookback-scroll"
        scrollRef={scrollRef}
        contentContainerStyle={[
          styles.column,
          {
            maxWidth: readingWidth,
            paddingTop: 4,
            paddingBottom: onLeave ? leaveFabScrollReserve() : 8,
          },
        ]}
        header={pageHeader}
        onContentSizeChange={scrollProps.onContentSizeChange}
        onScroll={scrollProps.onScroll}
        onScrollBeginDrag={scrollProps.onScrollBeginDrag}
        cover={cover}
        overlay={
          onLeave ? (
            <LeaveFab
              testID="lookback-leave-fab"
              onPress={onLeave}
              available={leaveFab.open && !readingLocked}
              opacity={leaveFab.opacity}
              shift={leaveFab.shift}
            />
          ) : null
        }
        band={
          <RootNavBand here="lookback" onOther={onGoRecent} onFamily={onFamily} />
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
            { maxWidth: readingWidth, paddingTop: heroPadTop },
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
  quiet: { ...type.meta, color: '#5C5851' },
  cell: { minHeight: 44, paddingVertical: 8, gap: 4, flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stack: { gap: 12 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E9' },
  catalog: { alignSelf: 'stretch', backgroundColor: '#F3F0E9' },
  catalogScroll: { flexGrow: 0 },
  catalogColumn: { paddingTop: 4, paddingBottom: 12, gap: 8 },
  catalogToggle: { minHeight: 48, justifyContent: 'center', gap: 4, paddingTop: 4 },
  catalogKicker: { ...recentType.prefix, color: recentKicker },
  catalogRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: recentRule,
    paddingBottom: 8,
  },
  catalogRange: { ...recentType.date, color: recentInk, flexShrink: 1, minWidth: 0 },
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
  headerWrap: { alignSelf: 'center', width: '100%' },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'center',
    width: '100%',
    gap: 12,
    paddingBottom: 17,
  },
  heroCopy: { flex: 1, flexShrink: 1, minWidth: 0 },
  kicker: { ...recentType.kicker, color: recentKicker },
  title: { ...recentType.title, color: recentInk, marginTop: 10, letterSpacing: 1.2 },
  topMark: {
    ...recentType.end,
    color: recentKicker,
    letterSpacing: 1.2,
    marginBottom: 6,
    flexShrink: 0,
  },
  headerRule: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: recentRule,
    marginBottom: 8,
  },
  body: { ...type.action, color: '#5C5851', flexShrink: 1, minWidth: 0 },
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
