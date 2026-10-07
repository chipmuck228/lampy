import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  findNodeHandle,
  Pressable,
  View,
} from 'react-native';
import { Text } from '../../screens/life-text';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getUseCases } from '../../application/container';
import { toApplicationError } from '../../application/errors';
import { ALBUM_READ_FAILED } from '../../application/life-album';
import type { HistoryMomentItem } from '../../application/history-use-cases';
import {
  lookbackBookLocateId,
  lookbackBookMonthOpenable,
  lookbackBookResponseIsCurrent,
  type LookbackBookIntent,
  type LookbackBookView,
} from '../../application/lookback-book';
import { lookbackDayEntries } from '../../application/lookback-day';
import { nextLookbackLocateSeq } from '../../application/lookback-locate';
import { lookbackMonthPage, type LookbackMonthPage } from '../../application/lookback-month';
import {
  chooseDefaultLookbackScope,
  collectLookbackNeighborDays,
  keepExpandedIds,
  lookbackCatalogRangeCaption,
  lookbackMoreOffset,
  lookbackReadingCanShowEndNote,
  lookbackReadingEndNote,
  lookbackReadingResolvedCount,
  lookbackReadingRestoreY,
  lookbackReadingScopeKey,
  lookbackScopesEqual,
  restoreLookbackPages,
  shouldAcceptLookbackMorePage,
  type LookbackMoreRequest,
  type LookbackPlacedDay,
  type LookbackReadingScope,
  type LookbackReadingSnapshot,
} from '../../application/lookback-reading';
import {
  patchLookbackReadingSnapshot,
  readLookbackBookOpen,
  readLookbackReadingSnapshot,
  rememberLookbackBookOpen,
  rememberLookbackReadingSnapshot,
  takeLookbackBookIntent,
  writeLookbackBookIntent,
} from '../../application/lookback-session';
import { pad2 } from '../../domain-adapters/calendar';
import { isFamilyProductEntryOpen } from '../../infrastructure/family-config';
import {
  LookbackBookDayRow,
  LookbackBookMonthRow,
  LookbackBookYearChapter,
  LookbackCatalogNoteRow,
  LookbackCatalogSplitRow,
} from '../../screens/lookback-book';
import {
  LookbackCatalogOverlay,
  LookbackCatalogToggle,
  LookbackLocateAnchor,
  LookbackMessage,
  LookbackScaffold,
  lookbackStyles,
  momentHref,
  useLookbackLayout,
} from '../../screens/lookback-chrome';
import { lookbackCatalogChromeHeight, lookbackCatalogMaxHeight } from '../../screens/lookback-catalog';
import { LifeAlbumCollectAction, LifeAlbumCollectBanner } from '../../screens/life-album-collect';
import { shouldUseNavRail } from '../../screens/life-page';
import { usePageMetrics } from '../../screens/use-page-metrics';
import {
  lookbackCollectIsReady,
  shouldApplyLookbackCollectResult,
} from '../../screens/lookback-collect';
import {
  collectAlbumIdFromParam,
  firstSearchParam,
  forgetLookbackOrigin,
  goToRecentFromLookbackRoot,
  leaveHref,
  lookbackParamsWithoutCollect,
  shouldBackToRecent,
} from '../../screens/lookback-origin';
import {
  LookbackEndNote,
  LookbackNeighborRetry,
  LookbackReadingHeader,
  LookbackReadingMoment,
  LookbackReadingNeighbors,
  LookbackUnconfirmedHeader,
} from '../../screens/lookback-reading';
import {
  lookbackReadingShouldHoldVisible,
  useLookbackReadingFade,
} from '../../screens/lookback-reading-fade';
import { shouldPairRecentImages } from '../../screens/moment-images';
import { useRecentClipPlayback } from '../../screens/use-recent-clip-playback';

type MonthExpand =
  | { year: number; month: number; status: 'loading' }
  | { year: number; month: number; status: 'error' }
  | { year: number; month: number; status: 'ready'; page: LookbackMonthPage };

type ReadingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; retry: 'scope' | 'search' }
  | { status: 'invalid' }
  | { status: 'empty' }
  | {
      status: 'ready';
      items: HistoryMomentItem[];
      hasMore: boolean;
      loadedOffset: number;
      moreError?: boolean;
      moreLoading?: boolean;
    };

function focusRef(node: View | null) {
  const handle = findNodeHandle(node);
  if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
}

function persistSnapshot(next: LookbackReadingSnapshot | null) {
  rememberLookbackReadingSnapshot(next);
  if (next?.scope.kind === 'day') {
    rememberLookbackBookOpen({
      year: next.scope.year,
      month: next.scope.month,
      day: next.scope.day,
    });
  }
}

export default function LookbackIndexScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const lookbackParams = useLocalSearchParams<{ o?: string | string[]; collect?: string | string[] }>();
  const originToken = firstSearchParam(lookbackParams.o);
  const collectAlbumId = collectAlbumIdFromParam(lookbackParams.collect);
  const { readingWidth } = useLookbackLayout();
  const insets = useSafeAreaInsets();
  const { width, height } = usePageMetrics();
  const pairImages = shouldPairRecentImages(Math.max(0, readingWidth - 48));
  const [view, setView] = useState<LookbackBookView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [expand, setExpand] = useState<MonthExpand | null>(null);
  const [scope, setScope] = useState<LookbackReadingScope | null>(null);
  const [reading, setReading] = useState<ReadingState>({ status: 'idle' });
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [neighbors, setNeighbors] = useState<{
    previous: LookbackPlacedDay | null;
    next: LookbackPlacedDay | null;
  }>({ previous: null, next: null });
  const [neighborError, setNeighborError] = useState(false);
  const [scopeCount, setScopeCount] = useState<number | null>(null);
  const [unconfirmedCopy, setUnconfirmedCopy] = useState<{ title: string; explanation: string } | null>(
    null,
  );
  const [locateKey, setLocateKey] = useState<string | null>(null);
  const [locateSeq, setLocateSeq] = useState(0);
  const [catalogLocateKey, setCatalogLocateKey] = useState<string | null>(null);
  const [catalogLocateSeq, setCatalogLocateSeq] = useState(0);
  const [pendingRestoreY, setPendingRestoreY] = useState<number | null>(null);
  const [restoreSeq, setRestoreSeq] = useState(0);
  const [holdWindowY, setHoldWindowY] = useState<number | null>(null);
  const [holdSeq, setHoldSeq] = useState(0);
  const [collectAlbum, setCollectAlbum] = useState<{ id: string; name: string } | null>(null);
  const [collectMissingId, setCollectMissingId] = useState<string | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectedIds, setCollectedIds] = useState<string[]>([]);
  const [collectBusyId, setCollectBusyId] = useState<string | null>(null);
  const [collectFailedIds, setCollectFailedIds] = useState<string[]>([]);
  const [collectEpoch, setCollectEpoch] = useState(collectAlbumId);
  const collectTargetRef = useRef<string | null>(collectAlbumId);
  const collectLoadedRef = useRef<string | null>(null);
  const collectOpRef = useRef(0);
  if (collectEpoch !== collectAlbumId) {
    setCollectEpoch(collectAlbumId);
    setCollectAlbum(null);
    setCollectedIds([]);
    setCollectBusyId(null);
    setCollectFailedIds([]);
    setCollectMissingId(null);
    setCollectError(null);
  }
  const locateSeqRef = useRef(0);
  const catalogLocateSeqRef = useRef(0);
  const expandGeneration = useRef(0);
  const readingGeneration = useRef(0);
  const moreInFlight = useRef<LookbackMoreRequest | null>(null);
  const mounted = useRef(true);
  const changeDayRef = useRef<View>(null);
  const readingTitleRef = useRef<View>(null);
  const clips = useRecentClipPlayback();
  const readingFade = useLookbackReadingFade();
  const clipsRef = useRef(clips);
  const catalogOpenRef = useRef(catalogOpen);
  const scopeRef = useRef(scope);
  const readingRef = useRef(reading);
  const expandedIdsRef = useRef(expandedIds);
  const scrollYRef = useRef(0);
  const viewRef = useRef(view);
  const expandRef = useRef(expand);
  const holdSeqRef = useRef(0);
  useEffect(() => {
    clipsRef.current = clips;
  });
  useEffect(() => {
    catalogOpenRef.current = catalogOpen;
    scopeRef.current = scope;
    readingRef.current = reading;
    expandedIdsRef.current = expandedIds;
    viewRef.current = view;
    expandRef.current = expand;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const beginLocate = useCallback((id: string) => {
    locateSeqRef.current = nextLookbackLocateSeq(locateSeqRef.current);
    setLocateSeq(locateSeqRef.current);
    setLocateKey(id);
  }, []);

  const clearLocate = useCallback(() => {
    setLocateKey(null);
  }, []);

  const beginCatalogLocate = useCallback((id: string) => {
    catalogLocateSeqRef.current = nextLookbackLocateSeq(catalogLocateSeqRef.current);
    setCatalogLocateSeq(catalogLocateSeqRef.current);
    setCatalogLocateKey(id);
  }, []);

  const clearCatalogLocate = useCallback(() => {
    setCatalogLocateKey(null);
  }, []);

  const writeCurrentSnapshot = useCallback(() => {
    const current = scopeRef.current;
    const page = readingRef.current;
    if (!current || page.status !== 'ready') return;
    persistSnapshot({
      scope: current,
      loadedOffset: page.loadedOffset,
      expandedIds: expandedIdsRef.current,
      scrollY: scrollYRef.current,
    });
  }, []);

  useLayoutEffect(() => {
    collectTargetRef.current = collectAlbumId;
    collectLoadedRef.current = null;
    collectOpRef.current += 1;
  }, [collectAlbumId]);

  const fetchCollectMembership = useCallback((albumId: string, generation: number) => {
    getUseCases()
      .then((app) => app.getAlbum(albumId))
      .then((view) => {
        if (
          !shouldApplyLookbackCollectResult({
            targetId: collectTargetRef.current,
            requestAlbumId: albumId,
            generation,
            currentGeneration: collectOpRef.current,
          })
        ) {
          return;
        }
        collectLoadedRef.current = view.album.id;
        setCollectAlbum({ id: view.album.id, name: view.album.name });
        setCollectedIds(view.album.entries.map((entry) => entry.momentId));
        setCollectBusyId(null);
        setCollectMissingId(null);
        setCollectError(null);
      })
      .catch((error) => {
        if (
          !shouldApplyLookbackCollectResult({
            targetId: collectTargetRef.current,
            requestAlbumId: albumId,
            generation,
            currentGeneration: collectOpRef.current,
          })
        ) {
          return;
        }
        collectLoadedRef.current = null;
        setCollectAlbum(null);
        setCollectedIds([]);
        setCollectBusyId(null);
        if (toApplicationError(error).code === 'ALBUM_NOT_FOUND') {
          setCollectMissingId(albumId);
          setCollectError(null);
          return;
        }
        setCollectMissingId(null);
        setCollectError(ALBUM_READ_FAILED);
      });
  }, []);

  const refreshCollectMembership = useCallback(() => {
    const albumId = collectTargetRef.current;
    if (!albumId) return;
    const generation = collectOpRef.current + 1;
    collectOpRef.current = generation;
    fetchCollectMembership(albumId, generation);
  }, [fetchCollectMembership]);

  useEffect(() => {
    if (!collectAlbumId) return;
    fetchCollectMembership(collectAlbumId, collectOpRef.current);
  }, [collectAlbumId, fetchCollectMembership]);

  const loadPageForScope = useCallback(async (target: LookbackReadingScope, offset: number) => {
    const app = await getUseCases();
    if (target.kind === 'day') {
      const next = await app.getHistoryDay(target.year, target.month, target.day, offset);
      if ('invalid' in next) throw Object.assign(new Error('invalid'), { invalid: true });
      return {
        items: next.items,
        hasMore: next.hasMore,
        invalid: false as const,
        title: next.title,
        empty: next.isEmpty,
        totalCount: next.totalCount,
      };
    }
    if (target.kind === 'unknown') {
      const next = await app.getHistoryUnknown(offset);
      return {
        items: next.items,
        hasMore: next.hasMore,
        title: next.title,
        explanation: next.explanation,
        totalCount: next.totalCount,
      };
    }
    if (target.kind === 'year-unconfirmed') {
      const next = await app.getHistoryYearUnconfirmed(target.year, offset);
      if ('invalid' in next) throw Object.assign(new Error('invalid'), { invalid: true });
      return {
        items: next.items,
        hasMore: next.hasMore,
        title: next.title,
        explanation: next.explanation,
        totalCount: next.totalCount,
      };
    }
    const next = await app.getHistoryMonthUnconfirmed(target.year, target.month, offset);
    if ('invalid' in next) throw Object.assign(new Error('invalid'), { invalid: true });
    return {
      items: next.items,
      hasMore: next.hasMore,
      title: next.title,
      explanation: next.explanation,
      totalCount: next.totalCount,
    };
  }, []);

  const loadNeighbors = useCallback(async (day: LookbackPlacedDay, book: LookbackBookView, generation: number) => {
    setNeighborError(false);
    try {
      const app = await getUseCases();
      const next = await collectLookbackNeighborDays({
        current: day,
        book,
        currentMonth: expand?.status === 'ready' ? {
          year: expand.year,
          month: expand.month,
          title: expand.page.title,
          days: expand.page.entries.map((entry) => ({
            day: entry.day,
            label: entry.label,
            count: entry.count,
            status: 'filled' as const,
            summary: entry.summary,
          })),
          dayUnconfirmedCount: expand.page.dayUnconfirmedCount,
          dayUnconfirmedLabel: expand.page.dayUnconfirmedLabel,
          isEmpty: expand.page.isEmpty,
        } : null,
        loadMonth: (year, month) => app.getHistoryMonth(year, month),
      });
      if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
      setNeighbors(next);
      setNeighborError(false);
    } catch {
      if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
      setNeighborError(true);
    }
  }, [expand]);

  const loadScope = useCallback(async (
    target: LookbackReadingScope,
    options: {
      snapshot?: LookbackReadingSnapshot | null;
      locate?: boolean;
      keepPlayer?: boolean;
      preserveChrome?: boolean;
      count?: number;
    } = {},
  ) => {
    const generation = readingGeneration.current + 1;
    readingGeneration.current = generation;
    const same = scopeRef.current && lookbackScopesEqual(scopeRef.current, target);
    const hold = lookbackReadingShouldHoldVisible({
      hadVisibleReading: readingRef.current.status === 'ready' || readingRef.current.status === 'empty',
      sameScope: !!same,
    });
    const fadeStarted = readingFade.begin();
    const fadeOutDone = hold ? readingFade.fadeOut(fadeStarted) : Promise.resolve(true);
    if (!hold) readingFade.hide(fadeStarted);
    if (!options.keepPlayer || !same) void clipsRef.current.pause();
    if (!options.preserveChrome) {
      setCatalogOpen(false);
      setCatalogLocateKey(null);
    }
    setPendingRestoreY(null);
    if (!hold) {
      setScope(target);
      setReading({ status: 'loading' });
      if (!same) {
        setExpandedIds([]);
        setNeighbors({ previous: null, next: null });
        setNeighborError(false);
        setUnconfirmedCopy(null);
        if (options.count == null) setScopeCount(null);
      }
      if (options.count != null) setScopeCount(options.count);
    }
    moreInFlight.current = null;
    if (target.kind === 'day') {
      rememberLookbackBookOpen({ year: target.year, month: target.month, day: target.day });
    }
    const reveal = async () => {
      await fadeOutDone;
      if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return false;
      readingFade.prepareAppear(fadeStarted);
      return true;
    };
    const appear = () => {
      requestAnimationFrame(() => {
        if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
        void readingFade.fadeIn(fadeStarted);
      });
    };
    const showNext = () => {
      setScope(target);
      if (!same) {
        setExpandedIds([]);
        setNeighbors({ previous: null, next: null });
        setNeighborError(false);
        setUnconfirmedCopy(null);
        if (options.count == null) setScopeCount(null);
      }
      if (options.count != null) setScopeCount(options.count);
    };
    try {
      let firstPage:
        | { title?: string; explanation?: string; totalCount?: number }
        | undefined;
      const restored = await restoreLookbackPages({
        targetOffset: options.snapshot?.loadedOffset ?? 0,
        loadPage: async (offset) => {
          const page = await loadPageForScope(target, offset);
          if (offset === 0) firstPage = page;
          return { items: page.items, hasMore: page.hasMore };
        },
      });
      if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
      if (!(await reveal())) return;
      if (hold) showNext();
      if (target.kind !== 'day' && firstPage?.title && firstPage.explanation) {
        setUnconfirmedCopy({ title: firstPage.title, explanation: firstPage.explanation });
      }
      const resolvedCount = lookbackReadingResolvedCount({
        known: options.count,
        totalCount: firstPage?.totalCount,
        loadedCount: restored.items.length,
        hasMore: restored.hasMore,
      });
      if (resolvedCount != null) setScopeCount(resolvedCount);
      if (!restored.ok && restored.items.length === 0) {
        setReading({ status: 'error', retry: 'scope' });
        if (options.snapshot) persistSnapshot(options.snapshot);
        appear();
        return;
      }
      if (restored.items.length === 0) {
        setReading({ status: 'empty' });
        setExpandedIds([]);
        persistSnapshot({
          scope: target,
          loadedOffset: 0,
          expandedIds: [],
          scrollY: 0,
        });
        setRestoreSeq((current) => current + 1);
        setPendingRestoreY(0);
        if (options.locate && target.kind === 'day') beginLocate(lookbackBookLocateId(target));
        appear();
        return;
      }
      const presentIds = restored.items.map((item) => item.id);
      const nextExpanded = keepExpandedIds(options.snapshot?.expandedIds ?? (same ? expandedIdsRef.current : []), presentIds);
      setExpandedIds(nextExpanded);
      setReading({
        status: 'ready',
        items: restored.items,
        hasMore: restored.hasMore,
        loadedOffset: restored.loadedOffset,
        moreError: !restored.ok,
      });
      persistSnapshot({
        scope: target,
        loadedOffset: restored.loadedOffset,
        expandedIds: nextExpanded,
        scrollY: options.snapshot?.scrollY ?? 0,
      });
      const restoreY = lookbackReadingRestoreY({
        snapshotScrollY: options.snapshot?.scrollY,
        restoredOk: restored.ok,
      });
      if (restoreY != null) {
        setRestoreSeq((current) => current + 1);
        setPendingRestoreY(restoreY);
      } else if (!same || options.locate) {
        setRestoreSeq((current) => current + 1);
        setPendingRestoreY(0);
      }
      if (options.locate && target.kind === 'day') beginLocate(lookbackBookLocateId(target));
      if (target.kind === 'day' && viewRef.current) {
        void loadNeighbors({ ...target, count: options.count ?? 0 }, viewRef.current, generation);
      }
      requestAnimationFrame(() => focusRef(readingTitleRef.current));
      appear();
    } catch (caught) {
      if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
      if (!(await reveal())) return;
      if (hold) showNext();
      if (caught && typeof caught === 'object' && 'invalid' in caught) {
        setReading({ status: 'invalid' });
        appear();
        return;
      }
      setReading({ status: 'error', retry: 'scope' });
      if (options.snapshot) persistSnapshot(options.snapshot);
      appear();
    }
  }, [beginLocate, loadNeighbors, loadPageForScope, readingFade]);

  const runDefault = useCallback(async (book: LookbackBookView) => {
    const generation = readingGeneration.current + 1;
    readingGeneration.current = generation;
    const fadeStarted = readingFade.begin();
    readingFade.hide(fadeStarted);
    setReading({ status: 'loading' });
    try {
      const app = await getUseCases();
      const choice = await chooseDefaultLookbackScope({
        book,
        loadMonth: (year, month) => app.getHistoryMonth(year, month),
      });
      if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
      if (choice.kind === 'empty') {
        setScope(null);
        setReading({ status: 'idle' });
        readingFade.settle();
        return;
      }
      if (choice.kind === 'catalog') {
        setScope(null);
        setReading({ status: 'idle' });
        setCatalogOpen(true);
        readingFade.settle();
        return;
      }
      if (choice.kind === 'unknown') {
        await loadScope({ kind: 'unknown' }, { count: book.unknownCount });
        return;
      }
      if (choice.kind === 'month-failed') {
        setReading({ status: 'error', retry: 'search' });
        requestAnimationFrame(() => {
          if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
          void readingFade.fadeIn(fadeStarted);
        });
        return;
      }
      await loadScope(choice, { count: choice.count });
    } catch {
      if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
      setReading({ status: 'error', retry: 'search' });
      requestAnimationFrame(() => {
        if (!mounted.current || !lookbackBookResponseIsCurrent(readingGeneration.current, generation)) return;
        void readingFade.fadeIn(fadeStarted);
      });
    }
  }, [loadScope, readingFade]);

  const loadMonth = useCallback(async (year: number, month: number, locate = false, quiet = false) => {
    const generation = expandGeneration.current + 1;
    expandGeneration.current = generation;
    if (!quiet) setExpand({ year, month, status: 'loading' });
    try {
      const app = await getUseCases();
      const next = await app.getHistoryMonth(year, month);
      if (!mounted.current || !lookbackBookResponseIsCurrent(expandGeneration.current, generation)) return;
      if ('invalid' in next) {
        if (!quiet) setExpand(null);
        return;
      }
      const page = lookbackMonthPage(next);
      if (!lookbackBookMonthOpenable({ dayCount: page.entries.length, dayUnconfirmedCount: page.dayUnconfirmedCount })) {
        if (!quiet) setExpand(null);
        return;
      }
      setExpand({ year, month, status: 'ready', page });
      if (locate) beginCatalogLocate(lookbackBookLocateId({ year, month }));
    } catch {
      if (!mounted.current || !lookbackBookResponseIsCurrent(expandGeneration.current, generation)) return;
      if (!quiet) setExpand({ year, month, status: 'error' });
    }
  }, [beginCatalogLocate]);

  const cancelHold = useCallback(() => {
    holdSeqRef.current += 1;
    setHoldSeq(holdSeqRef.current);
    setHoldWindowY(null);
  }, []);

  const holdReadingThen = useCallback((run: () => void) => {
    const seq = holdSeqRef.current + 1;
    holdSeqRef.current = seq;
    setHoldSeq(seq);
    setHoldWindowY(null);
    const node = readingTitleRef.current as (View & {
      measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
    }) | null;
    if (typeof node?.measureInWindow === 'function') {
      node.measureInWindow((_x, y) => {
        if (seq !== holdSeqRef.current) return;
        setHoldWindowY(y);
      });
    }
    run();
  }, []);

  const openCatalog = useCallback(() => {
    void clipsRef.current.pause();
    const current = scopeRef.current;
    holdReadingThen(() => {
      setCatalogOpen(true);
      if (current?.kind === 'day') {
        void loadMonth(current.year, current.month);
        beginCatalogLocate(lookbackBookLocateId(current));
      } else if (current?.kind === 'month-unconfirmed') {
        void loadMonth(current.year, current.month, true);
      } else if (current?.kind === 'year-unconfirmed') {
        beginCatalogLocate(lookbackBookLocateId({ year: current.year }));
      }
      requestAnimationFrame(() => focusRef(changeDayRef.current));
    });
  }, [beginCatalogLocate, holdReadingThen, loadMonth]);

  const closeCatalog = useCallback((focusToggle = true) => {
    holdReadingThen(() => {
      setCatalogOpen(false);
      setCatalogLocateKey(null);
      if (focusToggle) requestAnimationFrame(() => focusRef(changeDayRef.current));
    });
  }, [holdReadingThen]);

  const toggleCollect = useCallback(async (momentId: string) => {
    const albumId = collectTargetRef.current;
    if (!lookbackCollectIsReady(albumId, collectLoadedRef.current) || catalogOpenRef.current) return;
    if (collectBusyId === momentId) return;
    const generation = collectOpRef.current + 1;
    collectOpRef.current = generation;
    setCollectBusyId(momentId);
    setCollectFailedIds((current) => current.filter((id) => id !== momentId));
    try {
      const app = await getUseCases();
      const already = collectedIds.includes(momentId);
      const next = already
        ? await app.withdrawAlbumEntry({ albumId, momentId })
        : await app.collectAlbumEntry({ albumId, momentId });
      if (
        !shouldApplyLookbackCollectResult({
          targetId: collectTargetRef.current,
          requestAlbumId: albumId,
          generation,
          currentGeneration: collectOpRef.current,
        })
      ) {
        return;
      }
      setCollectedIds(next.album.entries.map((entry) => entry.momentId));
    } catch {
      if (
        !shouldApplyLookbackCollectResult({
          targetId: collectTargetRef.current,
          requestAlbumId: albumId,
          generation,
          currentGeneration: collectOpRef.current,
        })
      ) {
        return;
      }
      setCollectFailedIds((current) => (current.includes(momentId) ? current : [...current, momentId]));
    } finally {
      if (
        shouldApplyLookbackCollectResult({
          targetId: collectTargetRef.current,
          requestAlbumId: albumId,
          generation,
          currentGeneration: collectOpRef.current,
        })
      ) {
        setCollectBusyId(null);
      }
    }
  }, [collectBusyId, collectedIds]);

  const loadScopeRef = useRef(loadScope);
  const runDefaultRef = useRef(runDefault);
  const loadMonthRef = useRef(loadMonth);
  useEffect(() => {
    loadScopeRef.current = loadScope;
    runDefaultRef.current = runDefault;
    loadMonthRef.current = loadMonth;
  });

  const applyIntent = useCallback(
    async (
      intent: LookbackBookIntent | null,
      snapshot: LookbackReadingSnapshot | null,
      book: LookbackBookView,
    ) => {
      if (intent && 'day' in intent) {
        await loadScopeRef.current(
          { kind: 'day', year: intent.year, month: intent.month, day: intent.day },
          {
            snapshot:
              snapshot && snapshot.scope.kind === 'day' && snapshot.scope.day === intent.day
                ? snapshot
                : null,
            locate: true,
          },
        );
        return;
      }
      if (intent && 'month' in intent) {
        setCatalogOpen(true);
        await loadMonthRef.current(intent.year, intent.month, true);
        return;
      }
      if (intent) {
        setCatalogOpen(true);
        setExpand(null);
        beginCatalogLocate(lookbackBookLocateId(intent));
        return;
      }
      if (snapshot) {
        await loadScopeRef.current(snapshot.scope, { snapshot });
        return;
      }
      const leftover = readLookbackBookOpen();
      if (leftover?.day != null) {
        await loadScopeRef.current(
          { kind: 'day', year: leftover.year, month: leftover.month, day: leftover.day },
        );
        return;
      }
      await runDefaultRef.current(book);
    },
    [beginCatalogLocate],
  );

  const bookLoadGeneration = useRef(0);
  const pendingBookIntent = useRef<LookbackBookIntent | null>(null);
  const loadBookRef = useRef<(mode?: 'open' | 'refocus') => Promise<void> | void>(() => undefined);

  const loadBook = useCallback((mode: 'open' | 'refocus' = 'open') => {
    const generation = ++bookLoadGeneration.current;
    pendingBookIntent.current = null;
    return getUseCases()
      .then((app) => app.getLookbackBook())
      .then(async (next) => {
        if (generation !== bookLoadGeneration.current || !mounted.current) return;
        const consumed = takeLookbackBookIntent();
        pendingBookIntent.current = consumed;
        if (generation !== bookLoadGeneration.current || !mounted.current) return;
        setView(next);
        viewRef.current = next;
        setError(null);
        if (mode === 'refocus' && !consumed) {
          const current = scopeRef.current;
          const page = readingRef.current;
          if (current && (page.status === 'ready' || page.status === 'empty' || page.status === 'error')) {
            const snapshot =
              page.status === 'ready'
                ? {
                    scope: current,
                    loadedOffset: page.loadedOffset,
                    expandedIds: expandedIdsRef.current,
                    scrollY: scrollYRef.current,
                  }
                : readLookbackReadingSnapshot();
            await loadScope(current, {
              snapshot,
              keepPlayer: true,
              preserveChrome: true,
            });
            const opened = expandRef.current;
            if (
              generation === bookLoadGeneration.current &&
              mounted.current &&
              opened &&
              (opened.status === 'ready' || opened.status === 'error')
            ) {
              await loadMonthRef.current(opened.year, opened.month, false, true);
            }
            if (generation === bookLoadGeneration.current && mounted.current) {
              pendingBookIntent.current = null;
            }
            return;
          }
        }
        const snapshot = consumed ? null : readLookbackReadingSnapshot();
        await applyIntent(consumed, snapshot, next);
        if (generation === bookLoadGeneration.current && mounted.current) {
          pendingBookIntent.current = null;
        }
      })
      .catch(() => {
        if (generation !== bookLoadGeneration.current || !mounted.current) return;
        setError('回看暂时读不出来，原来的记录还在。');
      });
  }, [applyIntent, loadScope]);
  useEffect(() => {
    loadBookRef.current = loadBook;
  });

  useFocusEffect(
    useCallback(() => {
      refreshCollectMembership();
      void loadBookRef.current(viewRef.current ? 'refocus' : 'open');
      return () => {
        bookLoadGeneration.current += 1;
        readingGeneration.current += 1;
        moreInFlight.current = null;
        writeCurrentSnapshot();
        const leftover = pendingBookIntent.current;
        pendingBookIntent.current = null;
        if (leftover) writeLookbackBookIntent(leftover);
        void clipsRef.current.pause();
      };
    }, [refreshCollectMembership, writeCurrentSnapshot]),
  );

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!catalogOpenRef.current) return false;
      closeCatalog();
      return true;
    });
    const remove = navigation.addListener('beforeRemove', (event) => {
      if (!catalogOpenRef.current) return;
      event.preventDefault();
      closeCatalog();
    });
    return () => {
      back.remove();
      remove();
    };
  }, [closeCatalog, navigation]);

  function toggleMonth(year: number, month: number) {
    if (expand && expand.year === year && expand.month === month && expand.status === 'ready') {
      expandGeneration.current += 1;
      setExpand(null);
      return;
    }
    void loadMonth(year, month);
  }

  async function loadMore() {
    if (reading.status !== 'ready' || !reading.hasMore || reading.moreLoading || !scope) return;
    const generation = readingGeneration.current;
    const offset = lookbackMoreOffset(reading.loadedOffset);
    const request = { scopeKey: lookbackReadingScopeKey(scope), generation, offset };
    if (moreInFlight.current) return;
    moreInFlight.current = request;
    setReading((current) => (current.status === 'ready' ? { ...current, moreLoading: true } : current));
    try {
      const page = await loadPageForScope(scope, offset);
      const current = readingRef.current;
      const currentScope = scopeRef.current;
      if (
        !mounted.current ||
        current.status !== 'ready' ||
        !currentScope ||
        !shouldAcceptLookbackMorePage({
          request,
          current: {
            scopeKey: lookbackReadingScopeKey(currentScope),
            generation: readingGeneration.current,
            loadedOffset: current.loadedOffset,
          },
        })
      ) {
        return;
      }
      setReading({
        ...current,
        items: [...current.items, ...page.items],
        hasMore: page.hasMore,
        loadedOffset: offset,
        moreError: false,
        moreLoading: false,
      });
      patchLookbackReadingSnapshot({ loadedOffset: offset });
    } catch {
      if (
        !mounted.current ||
        !lookbackBookResponseIsCurrent(readingGeneration.current, generation) ||
        !scopeRef.current ||
        lookbackReadingScopeKey(scopeRef.current) !== request.scopeKey
      ) {
        return;
      }
      setReading((current) =>
        current.status === 'ready' ? { ...current, moreError: true, moreLoading: false } : current,
      );
    } finally {
      if (
        moreInFlight.current &&
        moreInFlight.current.scopeKey === request.scopeKey &&
        moreInFlight.current.generation === request.generation &&
        moreInFlight.current.offset === request.offset
      ) {
        moreInFlight.current = null;
      }
    }
  }

  const readyExpand = expand?.status === 'ready' ? expand : null;
  const readyReading = reading.status === 'ready' ? reading : null;
  const selectedDay = scope?.kind === 'day' ? scope : null;
  const emptyLibrary = !!view?.isEmpty && !error && reading.status === 'idle' && !scope;

  const catalogMax = lookbackCatalogMaxHeight({
    windowHeight: height,
    insetTop: insets.top,
    insetBottom: insets.bottom,
    headerHeight: lookbackCatalogChromeHeight(height < 500),
    rail: shouldUseNavRail(width, height),
  });
  const catalog = catalogOpen ? (
    <LookbackCatalogOverlay
      locateKey={catalogLocateKey}
      locateSeq={catalogLocateSeq}
      onLocated={clearCatalogLocate}
      maxHeight={catalogMax}
    >
        {view?.years.map((chapter) => (
          <LookbackBookYearChapter key={chapter.year} chapter={chapter}>
            <LookbackLocateAnchor id={lookbackBookLocateId({ year: chapter.year })} />
            {chapter.yearUnconfirmedCount > 0 ? (
              <LookbackCatalogSplitRow
                left={chapter.yearUnconfirmedLabel}
                right={`${chapter.yearUnconfirmedCount}条`}
                accessibilityLabel={`${chapter.yearUnconfirmedLabel}，有${chapter.yearUnconfirmedCount}条记录`}
                testID={`lookback-book-year-unconfirmed-${chapter.year}`}
                onPress={() =>
                  void loadScope(
                    { kind: 'year-unconfirmed', year: chapter.year },
                    { count: chapter.yearUnconfirmedCount },
                  )
                }
              />
            ) : null}
            {chapter.months.map((month) => {
              const open = readyExpand?.year === chapter.year && readyExpand.month === month.month;
              const loading = expand?.status === 'loading' && expand.year === chapter.year && expand.month === month.month;
              const failed = expand?.status === 'error' && expand.year === chapter.year && expand.month === month.month;
              return (
                <View key={month.month}>
                  <LookbackLocateAnchor id={lookbackBookLocateId({ year: chapter.year, month: month.month })} />
                  <LookbackBookMonthRow
                    year={chapter.year}
                    month={month.month}
                    count={month.count}
                    summary={month.summary}
                    expanded={!!open || !!loading}
                    onPress={() => toggleMonth(chapter.year, month.month)}
                  />
                  {loading ? (
                    <Text testID="lookback-book-month-loading" style={lookbackStyles.action}>
                      这个月正在读出来。
                    </Text>
                  ) : null}
                  {failed ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="重试打开这个月"
                      testID="lookback-book-month-retry"
                      onPress={() => void loadMonth(chapter.year, month.month)}
                      style={lookbackStyles.hit}
                    >
                      <Text style={lookbackStyles.action}>这个月暂时读不出来，原来的记录还在。再试一次</Text>
                    </Pressable>
                  ) : null}
                  {open ? (
                    <View testID={`lookback-book-expand-${chapter.year}-${pad2(month.month)}`}>
                      {readyExpand.page.dayUnconfirmedCount > 0 ? (
                        <LookbackCatalogSplitRow
                          left={readyExpand.page.dayUnconfirmedLabel}
                          right={`${readyExpand.page.dayUnconfirmedCount}条`}
                          accessibilityLabel={`${readyExpand.page.dayUnconfirmedLabel}，有${readyExpand.page.dayUnconfirmedCount}条记录`}
                          testID={`lookback-book-day-unconfirmed-${chapter.year}-${pad2(month.month)}`}
                          onPress={() =>
                            void loadScope(
                              {
                                kind: 'month-unconfirmed',
                                year: chapter.year,
                                month: month.month,
                              },
                              { count: readyExpand.page.dayUnconfirmedCount },
                            )
                          }
                        />
                      ) : null}
                      {readyExpand.page.entries.map((entry) => {
                        const selected =
                          selectedDay?.year === chapter.year &&
                          selectedDay.month === month.month &&
                          selectedDay.day === entry.day;
                        return (
                          <View key={entry.day} testID={selected ? 'lookback-book-selected-day' : undefined}>
                            <LookbackBookDayRow
                              year={chapter.year}
                              month={month.month}
                              entry={entry}
                              selected={!!selected}
                              onPress={() => {
                                if (selected) {
                                  closeCatalog();
                                  return;
                                }
                                void loadScope(
                                  { kind: 'day', year: chapter.year, month: month.month, day: entry.day },
                                  { count: entry.count, keepPlayer: false, locate: true },
                                );
                              }}
                            />
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </LookbackBookYearChapter>
        ))}
        {view && view.unknownCount > 0 ? (
          <>
            <LookbackCatalogNoteRow left="时间未确认" right="按已知范围保留" />
            <LookbackCatalogSplitRow
              left="时间未确认"
              right={`${view.unknownCount}条`}
              accessibilityLabel={`时间未确认，有${view.unknownCount}条记录`}
              testID="lookback-unconfirmed"
              onPress={() => void loadScope({ kind: 'unknown' }, { count: view.unknownCount })}
            />
          </>
        ) : null}
    </LookbackCatalogOverlay>
  ) : null;

  return (
    <LookbackScaffold
      title="回看"
      kicker="LAMPY · 时间里的记录"
      subtitle="慢慢看"
      path="/lookback"
      root
      locateKey={catalogOpen ? null : locateKey}
      locateSeq={locateSeq}
      readingLocked={catalogOpen}
      suppressPathRestore
      pendingRestoreY={pendingRestoreY}
      restoreSeq={restoreSeq}
      onLocated={clearLocate}
      onRestoreDone={() => setPendingRestoreY(null)}
      readingAnchorRef={readingTitleRef}
      holdWindowY={holdWindowY}
      holdSeq={holdSeq}
      onHoldDone={cancelHold}
      onReadingScroll={(offsetY) => {
        if (catalogOpenRef.current) return;
        scrollYRef.current = offsetY;
        if (scopeRef.current && readingRef.current.status === 'ready') {
          patchLookbackReadingSnapshot({ scrollY: offsetY });
        }
      }}
      headerAction={
        <>
          {collectAlbumId ? (
            <LifeAlbumCollectBanner
              name={collectAlbum?.id === collectAlbumId ? collectAlbum.name : undefined}
              missing={collectMissingId === collectAlbumId}
              loading={!collectAlbum && collectMissingId !== collectAlbumId && !collectError}
              error={collectError}
              onExit={() => {
                const kept = lookbackParamsWithoutCollect(lookbackParams);
                router.setParams({
                  collect: undefined,
                  ...(kept.o ? { o: kept.o } : {}),
                });
              }}
            />
          ) : null}
          {view && !emptyLibrary ? (
            <View>
              <LookbackCatalogToggle
                range={lookbackCatalogRangeCaption(scope)}
                expanded={catalogOpen}
                toggleRef={changeDayRef}
                onPress={() => {
                  if (catalogOpenRef.current) closeCatalog();
                  else openCatalog();
                }}
              />
              {catalog}
            </View>
          ) : null}
        </>
      }
      onGoRecent={() => {
        if (catalogOpenRef.current) closeCatalog();
        const openedFromRecent = shouldBackToRecent({
          originToken,
          navigationState: navigation.getState?.(),
        });
        goToRecentFromLookbackRoot(router, openedFromRecent);
        forgetLookbackOrigin(originToken);
      }}
      onGoAlbums={() => {
        if (catalogOpenRef.current) closeCatalog();
        writeCurrentSnapshot();
        router.dismissTo('/albums');
      }}
      onLeave={() => router.push(leaveHref('lookback'))}
      onFamily={isFamilyProductEntryOpen() ? () => router.push('/family') : undefined}
    >
      {error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试打开回看"
          testID="lookback-book-retry"
          onPress={() => {
            void loadBook();
          }}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>回看暂时读不出来，原来的记录还在。再试一次</Text>
        </Pressable>
      ) : null}
      {emptyLibrary ? (
        <View testID="lookback-empty">
          <LookbackMessage>日子会慢慢留在这里。</LookbackMessage>
          <LookbackMessage>先留下一点，以后再回来看看。</LookbackMessage>
        </View>
      ) : null}
      <Animated.View
        testID="lookback-reading-fade"
        style={{
          opacity: readingFade.opacity,
          transform: [{ translateY: readingFade.shift }],
        }}
      >
      {reading.status === 'loading' ? (
        <LookbackMessage testID="lookback-reading-loading">这一天正在读出来。</LookbackMessage>
      ) : null}
      {reading.status === 'error' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试打开回看"
          testID="lookback-reading-retry"
          onPress={() => {
            if (reading.retry === 'search' && view) void runDefault(view);
            else if (scope) void loadScope(scope, { snapshot: readLookbackReadingSnapshot() });
          }}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>这一天暂时读不出来，原来的记录还在。再试一次</Text>
        </Pressable>
      ) : null}
      {reading.status === 'invalid' ? <LookbackMessage>日历上没有这一天。</LookbackMessage> : null}
      {reading.status === 'empty' ? (
        <LookbackMessage testID="lookback-reading-empty">这一天还没有留下什么。</LookbackMessage>
      ) : null}
      <View ref={readingTitleRef} collapsable={false}>
        {selectedDay && (readyReading || reading.status === 'empty' || reading.status === 'error') ? (
          <>
            <LookbackLocateAnchor id={lookbackBookLocateId(selectedDay)} />
            <LookbackReadingHeader
              year={selectedDay.year}
              month={selectedDay.month}
              day={selectedDay.day}
              count={reading.status === 'empty' ? 0 : scopeCount}
            />
          </>
        ) : null}
        {scope && scope.kind !== 'day' && unconfirmedCopy ? (
          <LookbackUnconfirmedHeader
            title={unconfirmedCopy.title}
            explanation={unconfirmedCopy.explanation}
            count={scopeCount}
          />
        ) : null}
      </View>
      {readyReading
        ? lookbackDayEntries(readyReading.items).map((entry, index) => (
            <LookbackReadingMoment
              key={entry.id}
              entry={entry}
              pairImages={pairImages}
              expanded={expandedIds.includes(entry.id)}
              listen={
                entry.audio
                  ? clips.card(entry.audio.id)
                  : { status: 'idle', currentTimeMs: 0 }
              }
              onToggleExpand={() => {
                setExpandedIds((current) => {
                  const next = current.includes(entry.id)
                    ? current.filter((id) => id !== entry.id)
                    : [...current, entry.id];
                  patchLookbackReadingSnapshot({ expandedIds: next });
                  return next;
                });
              }}
              onOpen={(id) => {
                writeCurrentSnapshot();
                router.push(momentHref(id));
              }}
              onPlay={() => {
                if (!entry.audio?.uri) return;
                void clips.play(entry.audio.id, entry.audio.uri);
              }}
              onPause={() => {
                void clips.pause();
              }}
              footer={
                lookbackCollectIsReady(collectAlbumId, collectAlbum?.id) && !catalogOpen ? (
                  <LifeAlbumCollectAction
                    collected={collectedIds.includes(entry.id)}
                    busy={collectBusyId === entry.id}
                    disabled={!!collectBusyId && collectBusyId !== entry.id}
                    error={collectFailedIds.includes(entry.id)}
                    testID={`life-album-collect-${entry.id}`}
                    onPress={() => {
                      void toggleCollect(entry.id);
                    }}
                  />
                ) : null
              }
            />
          ))
        : null}
      {readyReading?.moreError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看，再试一次"
          testID="lookback-reading-more-retry"
          onPress={() => void loadMore()}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>后面的记录暂时读不出来。再试一次</Text>
        </Pressable>
      ) : null}
      {readyReading?.hasMore && !readyReading.moreError && !readyReading.moreLoading ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看"
          testID="lookback-reading-more"
          onPress={() => void loadMore()}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>继续往下看</Text>
        </Pressable>
      ) : null}
      {selectedDay && readyReading && neighborError ? (
        <LookbackNeighborRetry
          testID="lookback-reading-neighbors-retry"
          onRetry={() => {
            if (!viewRef.current) return;
            void loadNeighbors(
              { ...selectedDay, count: scopeCount ?? 0 },
              viewRef.current,
              readingGeneration.current,
            );
          }}
        />
      ) : null}
      {selectedDay && readyReading && !neighborError ? (
        <LookbackReadingNeighbors
          current={selectedDay}
          previous={neighbors.previous}
          next={neighbors.next}
          onOpen={(day) =>
            void loadScope(
              { kind: 'day', year: day.year, month: day.month, day: day.day },
              { count: day.count, locate: true },
            )
          }
        />
      ) : null}
      {lookbackReadingCanShowEndNote({
        ready: !!readyReading,
        hasMore: !!readyReading?.hasMore,
        moreError: readyReading?.moreError,
        moreLoading: readyReading?.moreLoading,
        restorePending: pendingRestoreY != null,
        scopeKind: scope?.kind,
      }) ? (
        <LookbackEndNote text={lookbackReadingEndNote(scope?.kind) ?? ''} />
      ) : null}
      </Animated.View>
    </LookbackScaffold>
  );
}
