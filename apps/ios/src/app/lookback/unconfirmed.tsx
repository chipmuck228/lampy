import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { getUseCases } from '../../application/container';
import { HISTORY_PAGE_SIZE, type HistoryUnconfirmedViewModel } from '../../application/history-use-cases';
import {
  HistoryMomentRow,
  LookbackMessage,
  LookbackScaffold,
  lookbackStyles,
  momentHref,
} from '../../screens/lookback-chrome';

export default function LookbackUnconfirmedScreen() {
  const router = useRouter();
  const [view, setView] = useState<HistoryUnconfirmedViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getHistoryUnknown(offset))
        .then((next) => {
          if (!cancelled) {
            setView((current) =>
              offset === 0 || !current
                ? next
                : { ...next, items: [...current.items, ...next.items] },
            );
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('这些记录暂时读不出来，原来的内容还在。');
        });
      return () => {
        cancelled = true;
      };
    }, [offset]),
  );

  return (
    <LookbackScaffold title={view?.title || '时间未确认'} path="/lookback/unconfirmed">
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view ? <LookbackMessage>{view.explanation}</LookbackMessage> : null}
      {view?.items.map((item) => (
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
      {view?.hasMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="继续往下看"
          testID="lookback-unconfirmed-more"
          onPress={() => setOffset((current) => current + HISTORY_PAGE_SIZE)}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>继续往下看</Text>
        </Pressable>
      ) : null}
    </LookbackScaffold>
  );
}
