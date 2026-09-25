import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../../../application/container';
import { pad2 } from '../../../domain-adapters/calendar';
import type { HistoryYearView } from '../../../projections/history-projection';
import {
  DensityBand,
  LookbackMessage,
  LookbackScaffold,
  lookbackHref,
  lookbackStyles,
  useLookbackLayout,
} from '../../../screens/lookback-chrome';

export default function LookbackYearScreen() {
  const router = useRouter();
  const { verticalTime } = useLookbackLayout();
  const params = useLocalSearchParams<{ year?: string | string[] }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const [view, setView] = useState<HistoryYearView | { invalid: true } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getHistoryYear(year))
        .then((next) => {
          if (!cancelled) {
            setView(next);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('这一年暂时读不出来，原来的记录还在。');
        });
      return () => {
        cancelled = true;
      };
    }, [year]),
  );

  const ready = view && !('invalid' in view) ? view : null;
  const max = ready ? Math.max(1, ...ready.months.map((month) => month.count)) : 1;

  return (
    <LookbackScaffold title={ready?.title || `${year}年`} path={`/lookback/${year}`}>
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view && 'invalid' in view ? <LookbackMessage>没有这一年。</LookbackMessage> : null}
      {ready ? (
        <LookbackMessage>
          有记录的月份留下痕迹，安静的月份仍占着位置。不会把记录时间当成发生时间。
        </LookbackMessage>
      ) : null}
      {ready && ready.yearUnconfirmedCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${ready.yearUnconfirmedLabel}，有${ready.yearUnconfirmedCount}条记录`}
          testID={`lookback-year-unconfirmed-${year}`}
          onPress={() => router.push(lookbackHref(`/lookback/${year}/unconfirmed`))}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>
            {ready.yearUnconfirmedLabel} · {ready.yearUnconfirmedCount}条
          </Text>
        </Pressable>
      ) : null}
      <View style={verticalTime ? lookbackStyles.stack : lookbackStyles.grid}>
        {ready?.months.map((month) => (
          <Pressable
            key={month.month}
            accessibilityRole="button"
            accessibilityLabel={`${month.label}，${month.summary}`}
            testID={`lookback-month-${year}-${pad2(month.month)}`}
            onPress={() => router.push(lookbackHref(`/lookback/${year}/${pad2(month.month)}`))}
            style={lookbackStyles.cell}
          >
            <Text style={lookbackStyles.action}>{month.label}</Text>
            <DensityBand count={month.count} max={max} label={month.summary} />
          </Pressable>
        ))}
      </View>
    </LookbackScaffold>
  );
}
