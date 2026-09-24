import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../../../../application/container';
import { HISTORY_PAGE_SIZE, type HistoryUnconfirmedViewModel } from '../../../../application/history-use-cases';
import { pad2 } from '../../../../domain-adapters/calendar';
import {
  HistoryMomentRow,
  LookbackMessage,
  LookbackScaffold,
  lookbackStyles,
  momentHref,
} from '../../../../screens/lookback-chrome';

export default function LookbackMonthUnconfirmedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string | string[]; month?: string | string[] }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const month = Number(Array.isArray(params.month) ? params.month[0] : params.month);
  const [view, setView] = useState<HistoryUnconfirmedViewModel | { invalid: true } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const path = `/lookback/${year}/${pad2(month)}/unconfirmed`;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getHistoryMonthUnconfirmed(year, month, offset))
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
          if (!cancelled) setError('这些记录暂时读不出来，原来的内容还在。');
        });
      return () => {
        cancelled = true;
      };
    }, [year, month, offset]),
  );

  const ready = view && !('invalid' in view) ? view : null;

  return (
    <LookbackScaffold title={ready?.title || `${year}年${month}月，日子未确认`} path={path}>
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view && 'invalid' in view ? <LookbackMessage>没有这个月。</LookbackMessage> : null}
      {ready ? <LookbackMessage>{ready.explanation}</LookbackMessage> : null}
      {ready?.items.map((item) => (
        <HistoryMomentRow
          key={item.id}
          id={item.id}
          note={item.note}
          timeLabel={item.timeLabel}
          recordedFallbackLabel={item.recordedFallbackLabel}
          images={item.images}
          onPress={() => router.push(momentHref(item.id))}
        />
      ))}
      {ready?.hasMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看"
          testID="lookback-month-unconfirmed-more"
          onPress={() => setOffset((current) => current + HISTORY_PAGE_SIZE)}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>继续往下看</Text>
        </Pressable>
      ) : null}
    </LookbackScaffold>
  );
}
