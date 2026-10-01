import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Text } from './life-text';
import { useFocusEffect, useRouter } from 'expo-router';

import type { HistoryMomentItem, HistoryUnconfirmedViewModel } from '../application/history-use-cases';
import { lookbackDayEntries } from '../application/lookback-day';
import {
  keepExpandedIds,
  lookbackMoreInFlightBlocks,
  lookbackMoreOffset,
  lookbackReadingResolvedCount,
  lookbackReadingScopeKey,
  restoreLookbackPages,
  shouldAcceptLookbackMorePage,
  type LookbackMoreRequest,
  type LookbackReadingScope,
} from '../application/lookback-reading';
import {
  patchLookbackReadingSnapshot,
  readLookbackReadingSnapshot,
  rememberLookbackReadingSnapshot,
} from '../application/lookback-session';
import { LookbackMessage, LookbackScaffold, lookbackStyles, momentHref, useLookbackLayout } from './lookback-chrome';
import { LookbackReadingMoment, LookbackUnconfirmedHeader } from './lookback-reading';
import { shouldPairRecentImages } from './moment-images';
import { useRecentClipPlayback } from './use-recent-clip-playback';

export function LookbackUnconfirmedReading({
  scope,
  path,
  fallbackTitle,
  moreTestID,
  count: knownCount,
  loadPage,
}: {
  scope: LookbackReadingScope;
  path: string;
  fallbackTitle: string;
  moreTestID: string;
  count?: number;
  loadPage: (offset: number) => Promise<HistoryUnconfirmedViewModel | { invalid: true }>;
}) {
  const router = useRouter();
  const { readingWidth } = useLookbackLayout();
  const pairImages = shouldPairRecentImages(Math.max(0, readingWidth - 48));
  const [items, setItems] = useState<HistoryMomentItem[]>([]);
  const [title, setTitle] = useState(fallbackTitle);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadedOffset, setLoadedOffset] = useState(0);
  const [moreError, setMoreError] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(knownCount ?? null);
  const [reloadTick, setReloadTick] = useState(0);
  const generation = useRef(0);
  const moreInFlight = useRef<LookbackMoreRequest | null>(null);
  const loadedOffsetRef = useRef(loadedOffset);
  const clips = useRecentClipPlayback();
  const clipsRef = useRef(clips);
  useEffect(() => {
    clipsRef.current = clips;
    loadedOffsetRef.current = loadedOffset;
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const request = generation.current + 1;
      generation.current = request;
      moreInFlight.current = null;
      const snapshot = readLookbackReadingSnapshot();
      const same = snapshot && snapshot.scope.kind === scope.kind && JSON.stringify(snapshot.scope) === JSON.stringify(scope);
      void reloadTick;
      let firstPage: HistoryUnconfirmedViewModel | undefined;
      restoreLookbackPages({
        targetOffset: same ? snapshot.loadedOffset : 0,
        loadPage: async (offset) => {
          const next = await loadPage(offset);
          if ('invalid' in next) throw Object.assign(new Error('invalid'), { invalid: true });
          if (offset === 0) firstPage = next;
          return { items: next.items, hasMore: next.hasMore };
        },
      })
        .then((restored) => {
          if (cancelled || generation.current !== request) return;
          if (firstPage) {
            setTitle(firstPage.title);
            setExplanation(firstPage.explanation);
            const resolved = lookbackReadingResolvedCount({
              known: knownCount,
              totalCount: firstPage.totalCount,
              loadedCount: restored.items.length,
              hasMore: restored.hasMore,
            });
            if (resolved != null) setCount(resolved);
          }
          if (!restored.ok && restored.items.length === 0) {
            setError('这些记录暂时读不出来，原来的内容还在。');
            return;
          }
          setError(null);
          setInvalid(false);
          setItems(restored.items);
          setHasMore(restored.hasMore);
          setLoadedOffset(restored.loadedOffset);
          const nextExpanded = keepExpandedIds(same ? snapshot.expandedIds : [], restored.items.map((item) => item.id));
          setExpandedIds(nextExpanded);
          rememberLookbackReadingSnapshot({
            scope,
            loadedOffset: restored.loadedOffset,
            expandedIds: nextExpanded,
            scrollY: same ? snapshot.scrollY : 0,
          });
        })
        .catch((caught) => {
          if (cancelled || generation.current !== request) return;
          if (caught && typeof caught === 'object' && 'invalid' in caught) {
            setInvalid(true);
            return;
          }
          setError('这些记录暂时读不出来，原来的内容还在。');
        });
      return () => {
        cancelled = true;
        generation.current += 1;
        moreInFlight.current = null;
        void clipsRef.current.pause();
      };
    }, [loadPage, scope, knownCount, reloadTick]),
  );

  async function loadMore() {
    if (!hasMore || moreLoading || moreError) return;
    const request: LookbackMoreRequest = {
      scopeKey: lookbackReadingScopeKey(scope),
      generation: generation.current,
      offset: lookbackMoreOffset(loadedOffset),
    };
    if (lookbackMoreInFlightBlocks(moreInFlight.current, request)) return;
    moreInFlight.current = request;
    setMoreLoading(true);
    try {
      const next = await loadPage(request.offset);
      if (
        'invalid' in next ||
        !shouldAcceptLookbackMorePage({
          request,
          current: {
            scopeKey: lookbackReadingScopeKey(scope),
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

  return (
    <LookbackScaffold title={title} path={path}>
      {error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试打开这些记录"
          testID="lookback-unconfirmed-retry"
          onPress={() => {
            setError(null);
            setReloadTick((current) => current + 1);
          }}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>这些记录暂时读不出来，原来的内容还在。再试一次</Text>
        </Pressable>
      ) : null}
      {invalid ? <LookbackMessage>没有这一段。</LookbackMessage> : null}
      {explanation ? (
        <LookbackUnconfirmedHeader title={title} explanation={explanation} count={count} />
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
      {hasMore && !moreError && !moreLoading ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看"
          testID={moreTestID}
          onPress={() => void loadMore()}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>继续往下看</Text>
        </Pressable>
      ) : null}
      {moreError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看，再试一次"
          testID={moreTestID}
          onPress={() => {
            setMoreError(false);
            void loadMore();
          }}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>后面的记录暂时读不出来。再试一次</Text>
        </Pressable>
      ) : null}
    </LookbackScaffold>
  );
}
