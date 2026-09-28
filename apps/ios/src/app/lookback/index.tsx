import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { getUseCases } from '../../application/container';
import {
  lookbackBookDayKey,
  lookbackBookExcerpts,
  lookbackBookMonthKey,
  lookbackBookMonthOpenable,
  lookbackBookRemaining,
  type LookbackBookExcerpt,
  type LookbackBookIntent,
  type LookbackBookView,
} from '../../application/lookback-book';
import { lookbackMonthPage, type LookbackMonthPage } from '../../application/lookback-month';
import {
  readLookbackBookOpen,
  rememberLookbackBookOpen,
  takeLookbackBookIntent,
  writeLookbackBookIntent,
} from '../../application/lookback-session';
import { pad2 } from '../../domain-adapters/calendar';
import { isFamilyApiConfigured } from '../../infrastructure/family-config';
import {
  LookbackBookDayRow,
  LookbackBookExcerptBlock,
  LookbackBookMonthRow,
  LookbackBookYearChapter,
} from '../../screens/lookback-book';
import {
  LookbackMessage,
  LookbackScaffold,
  lookbackHref,
  lookbackStyles,
  momentHref,
} from '../../screens/lookback-chrome';
import {
  firstSearchParam,
  forgetLookbackOrigin,
  goToRecentFromLookbackRoot,
  leaveHref,
  lookbackDayHrefFromBook,
  shouldBackToRecent,
} from '../../screens/lookback-origin';
import { useRecentClipPlayback } from '../../screens/use-recent-clip-playback';

type MonthExpand =
  | { year: number; month: number; tag: string; status: 'loading' }
  | { year: number; month: number; tag: string; status: 'error' }
  | { year: number; month: number; tag: string; status: 'ready'; page: LookbackMonthPage };

type DayExcerpt = {
  tag: string;
  day: number;
  dayTotal: number;
  items: LookbackBookExcerpt[];
};

export default function LookbackIndexScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { o } = useLocalSearchParams<{ o?: string | string[] }>();
  const originToken = firstSearchParam(o);
  const [view, setView] = useState<LookbackBookView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expand, setExpand] = useState<MonthExpand | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [excerpts, setExcerpts] = useState<DayExcerpt | null>(null);
  const expandTag = useRef<string | null>(null);
  const excerptTag = useRef<string | null>(null);
  const mounted = useRef(true);
  const clips = useRecentClipPlayback();
  const clipsRef = useRef(clips);
  useEffect(() => {
    clipsRef.current = clips;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const persistOpen = useCallback((next: { year: number; month: number; day?: number } | null) => {
    rememberLookbackBookOpen(next);
  }, []);

  const loadDayRef = useRef<
    (year: number, month: number, day: number, dayTotal: number) => Promise<void>
  >(async () => undefined);

  const loadMonth = useCallback(async (year: number, month: number, day?: number) => {
    const tag = lookbackBookMonthKey(year, month);
    expandTag.current = tag;
    excerptTag.current = null;
    void clipsRef.current.pause();
    setSelectedDay(day ?? null);
    setExcerpts(null);
    setExpand({ year, month, tag, status: 'loading' });
    persistOpen(day ? { year, month, day } : { year, month });
    try {
      const app = await getUseCases();
      const next = await app.getHistoryMonth(year, month);
      if (!mounted.current || expandTag.current !== tag) return;
      if ('invalid' in next) {
        setExpand(null);
        persistOpen(null);
        return;
      }
      const page = lookbackMonthPage(next);
      if (!lookbackBookMonthOpenable({ dayCount: page.entries.length, dayUnconfirmedCount: page.dayUnconfirmedCount })) {
        setExpand(null);
        persistOpen(null);
        return;
      }
      setExpand({ year, month, tag, status: 'ready', page });
      if (day != null) {
        const entry = page.entries.find((item) => item.day === day);
        if (entry) await loadDayRef.current(year, month, entry.day, entry.count);
        else setSelectedDay(null);
      }
    } catch {
      if (!mounted.current || expandTag.current !== tag) return;
      setExpand({ year, month, tag, status: 'error' });
    }
  }, [persistOpen]);

  const loadDay = useCallback(async (year: number, month: number, day: number, dayTotal: number) => {
    const tag = lookbackBookDayKey(year, month, day);
    excerptTag.current = tag;
    void clipsRef.current.pause();
    setSelectedDay(day);
    setExcerpts(null);
    persistOpen({ year, month, day });
    try {
      const app = await getUseCases();
      const next = await app.getHistoryDay(year, month, day, 0);
      if (!mounted.current || excerptTag.current !== tag) return;
      if ('invalid' in next) {
        setExcerpts({ tag, day, dayTotal, items: [] });
        return;
      }
      setExcerpts({ tag, day, dayTotal, items: lookbackBookExcerpts(next.items) });
    } catch {
      if (!mounted.current || excerptTag.current !== tag) return;
      setExcerpts({ tag, day, dayTotal, items: [] });
    }
  }, [persistOpen]);
  useEffect(() => {
    loadDayRef.current = loadDay;
  }, [loadDay]);

  const applyIntent = useCallback(
    async (intent: LookbackBookIntent | null, fallback: { year: number; month: number; day?: number } | null) => {
      if (intent && 'month' in intent) {
        await loadMonth(intent.year, intent.month, 'day' in intent ? intent.day : undefined);
        return;
      }
      if (intent) {
        expandTag.current = null;
        excerptTag.current = null;
        void clipsRef.current.pause();
        setExpand(null);
        setSelectedDay(null);
        setExcerpts(null);
        persistOpen(null);
        return;
      }
      if (fallback) await loadMonth(fallback.year, fallback.month, fallback.day);
    },
    [loadMonth, persistOpen],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let consumed: LookbackBookIntent | null = null;
      let applied = false;
      getUseCases()
        .then((app) => app.getLookbackBook())
        .then(async (next) => {
          if (cancelled || !mounted.current) return;
          consumed = takeLookbackBookIntent();
          if (cancelled || !mounted.current) {
            if (consumed) writeLookbackBookIntent(consumed);
            consumed = null;
            return;
          }
          setView(next);
          setError(null);
          const fallback = consumed ? null : readLookbackBookOpen();
          await applyIntent(consumed, fallback);
          if (!cancelled && mounted.current) applied = true;
          else if (consumed && !applied) writeLookbackBookIntent(consumed);
        })
        .catch(() => {
          if (!cancelled) setError('回看暂时读不出来，原来的记录还在。');
        });
      return () => {
        cancelled = true;
        if (consumed && !applied) writeLookbackBookIntent(consumed);
        void clipsRef.current.pause();
      };
    }, [applyIntent]),
  );

  function toggleMonth(year: number, month: number) {
    if (expand && expand.year === year && expand.month === month) {
      expandTag.current = null;
      excerptTag.current = null;
      void clipsRef.current.pause();
      setExpand(null);
      setSelectedDay(null);
      setExcerpts(null);
      persistOpen(null);
      return;
    }
    void loadMonth(year, month);
  }

  const readyExpand = expand?.status === 'ready' ? expand : null;

  return (
    <LookbackScaffold
      title="回看"
      path="/lookback"
      root
      onGoRecent={() => {
        const openedFromRecent = shouldBackToRecent({
          originToken,
          navigationState: navigation.getState?.(),
        });
        goToRecentFromLookbackRoot(router, openedFromRecent);
        forgetLookbackOrigin(originToken);
      }}
      onLeave={() => router.push(leaveHref('lookback'))}
      onFamily={isFamilyApiConfigured() ? () => router.push('/family') : undefined}
    >
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view?.isEmpty ? <LookbackMessage>还没有可以按时间回看的记录。</LookbackMessage> : null}
      {view && view.unknownCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`时间未确认，有${view.unknownCount}条记录`}
          testID="lookback-unconfirmed"
          onPress={() => router.push(lookbackHref('/lookback/unconfirmed'))}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>时间未确认 · {view.unknownCount}条</Text>
        </Pressable>
      ) : null}
      {view?.years.map((chapter) => (
        <LookbackBookYearChapter key={chapter.year} chapter={chapter}>
          {chapter.yearUnconfirmedCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${chapter.yearUnconfirmedLabel}，有${chapter.yearUnconfirmedCount}条记录`}
              testID={`lookback-book-year-unconfirmed-${chapter.year}`}
              onPress={() => router.push(lookbackHref(`/lookback/${chapter.year}/unconfirmed`))}
              style={lookbackStyles.hit}
            >
              <Text style={lookbackStyles.action}>
                {chapter.yearUnconfirmedLabel} · {chapter.yearUnconfirmedCount}条
              </Text>
            </Pressable>
          ) : null}
          {chapter.months.map((month) => {
            const open = readyExpand?.year === chapter.year && readyExpand.month === month.month;
            const loading = expand?.status === 'loading' && expand.year === chapter.year && expand.month === month.month;
            const failed = expand?.status === 'error' && expand.year === chapter.year && expand.month === month.month;
            return (
              <View key={month.month}>
                <LookbackBookMonthRow
                  year={chapter.year}
                  month={month.month}
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
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${readyExpand.page.dayUnconfirmedLabel}，有${readyExpand.page.dayUnconfirmedCount}条记录`}
                        testID={`lookback-book-day-unconfirmed-${chapter.year}-${pad2(month.month)}`}
                        onPress={() =>
                          router.push(
                            lookbackHref(`/lookback/${chapter.year}/${pad2(month.month)}/unconfirmed`),
                          )
                        }
                        style={lookbackStyles.hit}
                      >
                        <Text style={lookbackStyles.action}>
                          {readyExpand.page.dayUnconfirmedLabel} · {readyExpand.page.dayUnconfirmedCount}条
                        </Text>
                      </Pressable>
                    ) : null}
                    {readyExpand.page.entries.map((entry) => {
                      const selected = selectedDay === entry.day;
                      const dayKey = lookbackBookDayKey(chapter.year, month.month, entry.day);
                      const dayExcerpts = selected && excerpts?.tag === dayKey ? excerpts : null;
                      return (
                        <View key={entry.day} testID={selected ? 'lookback-book-selected-day' : undefined}>
                          <LookbackBookDayRow
                            year={chapter.year}
                            month={month.month}
                            entry={entry}
                            selected={selected}
                            onPress={() => {
                              void loadDay(chapter.year, month.month, entry.day, entry.count);
                            }}
                          />
                          {dayExcerpts
                            ? dayExcerpts.items.map((excerpt) => (
                                <LookbackBookExcerptBlock
                                  key={`${dayKey}-${excerpt.id}`}
                                  excerpt={excerpt}
                                  listen={
                                    excerpt.audio
                                      ? clips.card(excerpt.audio.id)
                                      : { status: 'idle', currentTimeMs: 0 }
                                  }
                                  onPlay={() => {
                                    if (!excerpt.audio?.uri) return;
                                    void clips.play(excerpt.audio.id, excerpt.audio.uri);
                                  }}
                                  onPause={() => {
                                    void clips.pause();
                                  }}
                                  onOpen={(id) => router.push(momentHref(id))}
                                />
                              ))
                            : null}
                          {dayExcerpts && lookbackBookRemaining(dayExcerpts.dayTotal, dayExcerpts.items.length) > 0 ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`这一天还有${lookbackBookRemaining(dayExcerpts.dayTotal, dayExcerpts.items.length)}条`}
                              testID={`lookback-book-day-more-${chapter.year}-${pad2(month.month)}-${pad2(entry.day)}`}
                              onPress={() =>
                                router.push(lookbackDayHrefFromBook(chapter.year, month.month, entry.day))
                              }
                              style={lookbackStyles.hit}
                            >
                              <Text style={lookbackStyles.action}>
                                这一天还有 {lookbackBookRemaining(dayExcerpts.dayTotal, dayExcerpts.items.length)} 条
                              </Text>
                            </Pressable>
                          ) : null}
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
    </LookbackScaffold>
  );
}
