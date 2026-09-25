import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { getUseCases } from '../../application/container';
import type { HistoryYearsView } from '../../projections/history-projection';
import {
  LookbackMessage,
  LookbackScaffold,
  lookbackHref,
  lookbackStyles,
  useLookbackLayout,
} from '../../screens/lookback-chrome';

export default function LookbackIndexScreen() {
  const router = useRouter();
  const { verticalTime } = useLookbackLayout();
  const [view, setView] = useState<HistoryYearsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getHistoryYears())
        .then((next) => {
          if (!cancelled) {
            setView(next);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('回看暂时读不出来，原来的记录还在。');
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <LookbackScaffold title="回看" path="/lookback">
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view?.isEmpty ? (
        <LookbackMessage>还没有可以按时间回看的记录。</LookbackMessage>
      ) : null}
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
      <View style={verticalTime ? lookbackStyles.stack : lookbackStyles.grid}>
        {view?.years.map((year) => (
          <Pressable
            key={year.year}
            accessibilityRole="button"
            accessibilityLabel={`${year.year}年，有${year.momentCount}条记录`}
            testID={`lookback-year-${year.year}`}
            onPress={() => router.push(lookbackHref(`/lookback/${year.year}`))}
            style={lookbackStyles.cell}
          >
            <Text style={lookbackStyles.action}>{year.year}年</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: '#53604F' }}>
              有{year.momentCount}条记录
            </Text>
          </Pressable>
        ))}
      </View>
    </LookbackScaffold>
  );
}
