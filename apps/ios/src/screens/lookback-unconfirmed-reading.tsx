import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Text } from './life-text';
import { useFocusEffect, useRouter } from 'expo-router';

import { HISTORY_PAGE_SIZE, type HistoryMomentItem, type HistoryUnconfirmedViewModel } from '../application/history-use-cases';
import { lookbackDayEntries } from '../application/lookback-day';
import { keepExpandedIds, restoreLookbackPages, type LookbackReadingScope } from '../application/lookback-reading';
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
  loadPage,
}: {
  scope: LookbackReadingScope;
  path: string;
  fallbackTitle: string;
  moreTestID: string;
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
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const generation = useRef(0);
  const clips = useRecentClipPlayback();
  const clipsRef = useRef(clips);
  useEffect(() => {
    clipsRef.current = clips;
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const request = generation.current + 1;
      generation.current = request;
      const snapshot = readLookbackReadingSnapshot();
      const same = snapshot && snapshot.scope.kind === scope.kind && JSON.stringify(snapshot.scope) === JSON.stringify(scope);
      restoreLookbackPages({
        targetOffset: same ? snapshot.loadedOffset : 0,
        loadPage: async (offset) => {
          const next = await loadPage(offset);
          if ('invalid' in next) throw Object.assign(new Error('invalid'), { invalid: true });
          return { items: next.items, hasMore: next.hasMore };
        },
      })
        .then(async (restored) => {
          if (cancelled || generation.current !== request) return;
          const header = await loadPage(0);
          if (!('invalid' in header)) {
            setTitle(header.title);
            setExplanation(header.explanation);
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
        void clipsRef.current.pause();
      };
    }, [loadPage, scope]),
  );

  return (
    <LookbackScaffold title={title} path={path}>
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {invalid ? <LookbackMessage>没有这一段。</LookbackMessage> : null}
      {explanation ? (
        <LookbackUnconfirmedHeader title={title} explanation={explanation} count={items.length} />
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
      {hasMore || moreError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看"
          testID={moreTestID}
          onPress={() => {
            const offset = loadedOffset + HISTORY_PAGE_SIZE;
            loadPage(offset)
              .then((next) => {
                if ('invalid' in next) return;
                setItems((current) => [...current, ...next.items]);
                setHasMore(next.hasMore);
                setLoadedOffset(offset);
                setMoreError(false);
                patchLookbackReadingSnapshot({ loadedOffset: offset });
              })
              .catch(() => setMoreError(true));
          }}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>
            {moreError ? '后面的记录暂时读不出来。再试一次' : '继续往下看'}
          </Text>
        </Pressable>
      ) : null}
    </LookbackScaffold>
  );
}
