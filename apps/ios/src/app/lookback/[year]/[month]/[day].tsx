import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { getUseCases } from '../../../../application/container';
import { HISTORY_PAGE_SIZE, type HistoryDayViewModel } from '../../../../application/history-use-cases';
import { lookbackBookIntentFromParts } from '../../../../application/lookback-book';
import { lookbackDayEntries } from '../../../../application/lookback-day';
import { writeLookbackBookIntent } from '../../../../application/lookback-session';
import { pad2 } from '../../../../domain-adapters/calendar';
import {
  LookbackMessage,
  LookbackScaffold,
  lookbackStyles,
  momentHref,
} from '../../../../screens/lookback-chrome';
import { LookbackDayMoment } from '../../../../screens/lookback-day';
import {
  firstSearchParam,
  forgetLookbackBookOrigin,
  goToLookbackBookFromDay,
  shouldBackToLookbackBook,
} from '../../../../screens/lookback-origin';

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
  const [view, setView] = useState<HistoryDayViewModel | { invalid: true } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const path = `/lookback/${year}/${pad2(month)}/${pad2(day)}`;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getHistoryDay(year, month, day, offset))
        .then((next) => {
          if (!cancelled) {
            setView((current) => {
              if (offset === 0 || !current || 'invalid' in current || 'invalid' in next) return next;
              return { ...next, items: [...current.items, ...next.items] };
            });
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('这一天暂时读不出来，原来的记录还在。');
        });
      return () => {
        cancelled = true;
      };
    }, [year, month, day, offset]),
  );

  const ready = view && !('invalid' in view) ? view : null;

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
      title={ready?.title || `${year}年${month}月${day}日`}
      path={path}
      onBack={leaveDay}
    >
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view && 'invalid' in view ? <LookbackMessage>日历上没有这一天。</LookbackMessage> : null}
      {ready?.isEmpty ? <LookbackMessage>这一天还没有留下什么。</LookbackMessage> : null}
      {ready
        ? lookbackDayEntries(ready.items).map((entry) => (
            <LookbackDayMoment
              key={entry.id}
              entry={entry}
              onPress={() => router.push(momentHref(entry.id))}
            />
          ))
        : null}
      {ready?.hasMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看"
          testID="lookback-day-more"
          onPress={() => setOffset((current) => current + HISTORY_PAGE_SIZE)}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>继续往下看</Text>
        </Pressable>
      ) : null}
    </LookbackScaffold>
  );
}
