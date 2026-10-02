import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Text } from '../../../../screens/life-text';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { getUseCases } from '../../../../application/container';
import type { HistoryMomentItem } from '../../../../application/history-use-cases';
import { lookbackBookIntentFromParts } from '../../../../application/lookback-book';
import { lookbackDayEntries } from '../../../../application/lookback-day';
import {
  collectLookbackNeighborDays,
  keepExpandedIds,
  lookbackMoreInFlightBlocks,
  lookbackMoreOffset,
  lookbackReadingCanShowEndNote,
  lookbackReadingEndNote,
  lookbackReadingResolvedCount,
  lookbackReadingScopeKey,
  restoreLookbackPages,
  shouldAcceptLookbackMorePage,
  type LookbackMoreRequest,
  type LookbackPlacedDay,
} from '../../../../application/lookback-reading';
import {
  patchLookbackReadingSnapshot,
  readLookbackReadingSnapshot,
  rememberLookbackReadingSnapshot,
  writeLookbackBookIntent,
} from '../../../../application/lookback-session';
import { pad2 } from '../../../../domain-adapters/calendar';
import {
  LookbackMessage,
  LookbackScaffold,
  lookbackStyles,
  momentHref,
  useLookbackLayout,
} from '../../../../screens/lookback-chrome';
import {
  firstSearchParam,
  forgetLookbackBookOrigin,
  goToLookbackBookFromDay,
  shouldBackToLookbackBook,
} from '../../../../screens/lookback-origin';
import {
  LookbackEndNote,
  LookbackNeighborRetry,
  LookbackReadingHeader,
  LookbackReadingMoment,
  LookbackReadingNeighbors,
} from '../../../../screens/lookback-reading';
import { shouldPairRecentImages } from '../../../../screens/moment-images';
import { useRecentClipPlayback } from '../../../../screens/use-recent-clip-playback';

export default function LookbackDayScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    year?: string | string[];
    month?: string | string[];
    day?: string | string[];
    b?: string | string[];
  }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const month = Number(Array.isArray(params.month) ? params.month[0] : params.month);
  const day = Number(Array.isArray(params.day) ? params.day[0] : params.day);
  const bookToken = firstSearchParam(params.b);
  const { readingWidth } = useLookbackLayout();
  const pairImages = shouldPairRecentImages(Math.max(0, readingWidth - 48));
  const [items, setItems] = useState<HistoryMomentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadedOffset, setLoadedOffset] = useState(0);
  const [moreError, setMoreError] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [neighbors, setNeighbors] = useState<{
    previous: LookbackPlacedDay | null;
    next: LookbackPlacedDay | null;
  }>({ previous: null, next: null });
  const [neighborError, setNeighborError] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [pendingRestoreY, setPendingRestoreY] = useState<number | null>(null);
  const [restoreSeq, setRestoreSeq] = useState(0);
  const generation = useRef(0);
  const neighborGeneration = useRef(0);
  const moreInFlight = useRef<LookbackMoreRequest | null>(null);
  const loadedOffsetRef = useRef(loadedOffset);
  const previousScopeKey = useRef<string | null>(null);
  const clips = useRecentClipPlayback();
  const clipsRef = useRef(clips);
  useEffect(() => {
    clipsRef.current = clips;
    loadedOffsetRef.current = loadedOffset;
  });
  const path = `/lookback/${year}/${pad2(month)}/${pad2(day)}`;
  const scopeKey = lookbackReadingScopeKey({ kind: 'day', year, month, day });

  const refreshNeighbors = useCallback(() => {
    const request = neighborGeneration.current + 1;
    neighborGeneration.current = request;
    setNeighborError(false);
    getUseCases()
      .then(async (app) => {
        const book = await app.getLookbackBook();
        return collectLookbackNeighborDays({
          current: { year, month, day },
          book,
          loadMonth: (nextYear, nextMonth) => app.getHistoryMonth(nextYear, nextMonth),
        });
      })
      .then((next) => {
        if (neighborGeneration.current !== request) return;
        setNeighbors(next);
        setNeighborError(false);
      })
      .catch(() => {
        if (neighborGeneration.current !== request) return;
        setNeighborError(true);
      });
  }, [year, month, day]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const request = generation.current + 1;
      generation.current = request;
      moreInFlight.current = null;
      void reloadTick;
      const snapshot = readLookbackReadingSnapshot();
      const same =
        snapshot?.scope.kind === 'day' &&
        snapshot.scope.year === year &&
        snapshot.scope.month === month &&
        snapshot.scope.day === day;
      let firstPage: { totalCount?: number } | undefined;
      restoreLookbackPages({
        targetOffset: same ? snapshot.loadedOffset : 0,
        loadPage: async (offset) => {
          const app = await getUseCases();
          const next = await app.getHistoryDay(year, month, day, offset);
          if ('invalid' in next) throw Object.assign(new Error('invalid'), { invalid: true });
          if (offset === 0) firstPage = next;
          return { items: next.items, hasMore: next.hasMore };
        },
      })
        .then((restored) => {
          if (cancelled || generation.current !== request) return;
          const resolved = lookbackReadingResolvedCount({
            totalCount: firstPage?.totalCount,
            loadedCount: restored.items.length,
            hasMore: restored.hasMore,
          });
          setCount(resolved);
          if (!restored.ok && restored.items.length === 0) {
            setError('这一天暂时读不出来，原来的记录还在。');
            return;
          }
          setError(null);
          setInvalid(false);
          setItems(restored.items);
          setHasMore(restored.hasMore);
          setLoadedOffset(restored.loadedOffset);
          setMoreError(!restored.ok);
          setEmpty(restored.items.length === 0);
          const nextExpanded = keepExpandedIds(same ? snapshot.expandedIds : [], restored.items.map((item) => item.id));
          setExpandedIds(nextExpanded);
          const switched = previousScopeKey.current != null && previousScopeKey.current !== scopeKey;
          previousScopeKey.current = scopeKey;
          rememberLookbackReadingSnapshot({
            scope: { kind: 'day', year, month, day },
            loadedOffset: restored.loadedOffset,
            expandedIds: nextExpanded,
            scrollY: same ? snapshot.scrollY : 0,
          });
          setRestoreSeq((current) => current + 1);
          setPendingRestoreY(same ? snapshot.scrollY : switched ? 0 : null);
        })
        .catch((caught) => {
          if (cancelled || generation.current !== request) return;
          if (caught && typeof caught === 'object' && 'invalid' in caught) {
            setInvalid(true);
            setError(null);
            return;
          }
          setError('这一天暂时读不出来，原来的记录还在。');
        });
      void refreshNeighbors();
      return () => {
        cancelled = true;
        generation.current += 1;
        neighborGeneration.current += 1;
        moreInFlight.current = null;
        void clipsRef.current.pause();
      };
    }, [year, month, day, reloadTick, scopeKey, refreshNeighbors]),
  );

  async function loadMore(options: { retry?: boolean } = {}) {
    if (!hasMore || moreLoading || (moreError && !options.retry)) return;
    const request: LookbackMoreRequest = {
      scopeKey,
      generation: generation.current,
      offset: lookbackMoreOffset(loadedOffset),
    };
    if (lookbackMoreInFlightBlocks(moreInFlight.current, request)) return;
    moreInFlight.current = request;
    setMoreError(false);
    setMoreLoading(true);
    try {
      const app = await getUseCases();
      const next = await app.getHistoryDay(year, month, day, request.offset);
      if (
        'invalid' in next ||
        !shouldAcceptLookbackMorePage({
          request,
          current: {
            scopeKey,
            generation: generation.current,
            loadedOffset: loadedOffsetRef.current,
          },
        })
      ) {
        return;
      }
      setItems((current) => [...current, ...next.items]);
      setHasMore(next.hasMore);
      setLoadedOffset(request.offset);
      setMoreError(false);
      patchLookbackReadingSnapshot({ loadedOffset: request.offset });
    } catch {
      if (generation.current !== request.generation) return;
      setMoreError(true);
    } finally {
      if (
        moreInFlight.current &&
        moreInFlight.current.scopeKey === request.scopeKey &&
        moreInFlight.current.generation === request.generation &&
        moreInFlight.current.offset === request.offset
      ) {
        moreInFlight.current = null;
      }
      setMoreLoading(false);
    }
  }

  function leaveDay() {
    const intent = lookbackBookIntentFromParts({
      year: String(year),
      month: String(month),
      day: String(day),
    });
    if (intent) writeLookbackBookIntent(intent);
    const openedFromBook = shouldBackToLookbackBook({
      originToken: bookToken,
      navigationState: navigation.getState?.(),
    });
    goToLookbackBookFromDay(router, openedFromBook);
    forgetLookbackBookOrigin(bookToken);
  }

  return (
    <LookbackScaffold
      title="回看"
      path={path}
      onBack={leaveDay}
      pendingRestoreY={pendingRestoreY}
      restoreSeq={restoreSeq}
      onReadingScroll={(offsetY) => {
        patchLookbackReadingSnapshot({ scrollY: offsetY });
      }}
      onRestoreDone={() => setPendingRestoreY(null)}
    >
      {error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试打开这一天"
          testID="lookback-day-retry"
          onPress={() => {
            setError(null);
            setReloadTick((current) => current + 1);
          }}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>这一天暂时读不出来，原来的记录还在。再试一次</Text>
        </Pressable>
      ) : null}
      {invalid ? <LookbackMessage>日历上没有这一天。</LookbackMessage> : null}
      {empty ? <LookbackMessage>这一天还没有留下什么。</LookbackMessage> : null}
      {!invalid && !empty && !error ? (
        <LookbackReadingHeader year={year} month={month} day={day} count={count} />
      ) : null}
      {lookbackDayEntries(items).map((entry) => (
        <LookbackReadingMoment
          key={entry.id}
          entry={entry}
          pairImages={pairImages}
          expanded={expandedIds.includes(entry.id)}
          listen={entry.audio ? clips.card(entry.audio.id) : { status: 'idle', currentTimeMs: 0 }}
          onToggleExpand={() => {
            setExpandedIds((current) => {
              const next = current.includes(entry.id)
                ? current.filter((id) => id !== entry.id)
                : [...current, entry.id];
              patchLookbackReadingSnapshot({ expandedIds: next });
              return next;
            });
          }}
          onOpen={(id) => router.push(momentHref(id))}
          onPlay={() => {
            if (!entry.audio?.uri) return;
            void clips.play(entry.audio.id, entry.audio.uri);
          }}
          onPause={() => {
            void clips.pause();
          }}
        />
      ))}
      {moreError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看，再试一次"
          testID="lookback-day-more"
          onPress={() => void loadMore({ retry: true })}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>后面的记录暂时读不出来。再试一次</Text>
        </Pressable>
      ) : null}
      {hasMore && !moreError && !moreLoading ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看"
          testID="lookback-day-more"
          onPress={() => void loadMore()}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>继续往下看</Text>
        </Pressable>
      ) : null}
      {neighborError ? (
        <LookbackNeighborRetry testID="lookback-day-neighbors-retry" onRetry={() => refreshNeighbors()} />
      ) : (
        <LookbackReadingNeighbors
          current={{ year, month, day }}
          previous={neighbors.previous}
          next={neighbors.next}
          onOpen={(next) =>
            router.replace(`/lookback/${next.year}/${pad2(next.month)}/${pad2(next.day)}` as never)
          }
        />
      )}
      {lookbackReadingCanShowEndNote({
        ready: items.length > 0 && !invalid && !error,
        hasMore,
        moreError,
        moreLoading,
        restorePending: pendingRestoreY != null,
        scopeKind: 'day',
      }) ? (
        <LookbackEndNote text={lookbackReadingEndNote('day') ?? ''} />
      ) : null}
    </LookbackScaffold>
  );
}
