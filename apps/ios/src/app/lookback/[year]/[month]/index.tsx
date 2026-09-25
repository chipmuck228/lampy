import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../../../../application/container';
import { pad2 } from '../../../../domain-adapters/calendar';
import type { HistoryMonthView } from '../../../../projections/history-projection';
import {
  DensityBand,
  LookbackMessage,
  LookbackScaffold,
  lookbackHref,
  lookbackStyles,
  useLookbackLayout,
} from '../../../../screens/lookback-chrome';

export default function LookbackMonthScreen() {
  const router = useRouter();
  const { verticalTime } = useLookbackLayout();
  const params = useLocalSearchParams<{ year?: string | string[]; month?: string | string[] }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const month = Number(Array.isArray(params.month) ? params.month[0] : params.month);
  const [view, setView] = useState<HistoryMonthView | { invalid: true } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getHistoryMonth(year, month))
        .then((next) => {
          if (!cancelled) {
            setView(next);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('这个月暂时读不出来，原来的记录还在。');
        });
      return () => {
        cancelled = true;
      };
    }, [year, month]),
  );

  const ready = view && !('invalid' in view) ? view : null;
  const max = ready ? Math.max(1, ...ready.days.map((day) => day.count)) : 1;
  const path = `/lookback/${year}/${pad2(month)}`;

  return (
    <LookbackScaffold title={ready?.title || `${year}年${month}月`} path={path}>
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view && 'invalid' in view ? <LookbackMessage>没有这个月。</LookbackMessage> : null}
      {ready?.isEmpty ? <LookbackMessage>这个月还没有留下什么。</LookbackMessage> : null}
      {ready && ready.dayUnconfirmedCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${ready.dayUnconfirmedLabel}，有${ready.dayUnconfirmedCount}条记录`}
          testID={`lookback-month-unconfirmed-${year}-${pad2(month)}`}
          onPress={() => router.push(lookbackHref(`${path}/unconfirmed`))}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>
            {ready.dayUnconfirmedLabel} · {ready.dayUnconfirmedCount}条
          </Text>
        </Pressable>
      ) : null}
      <View style={verticalTime ? lookbackStyles.stack : lookbackStyles.grid}>
        {ready?.days.map((day) => (
          <Pressable
            key={day.day}
            accessibilityRole="button"
            accessibilityLabel={`${ready.title}${day.day}日，${day.summary}`}
            testID={`lookback-day-${year}-${pad2(month)}-${pad2(day.day)}`}
            onPress={() => router.push(lookbackHref(`${path}/${pad2(day.day)}`))}
            style={lookbackStyles.cell}
          >
            <Text style={lookbackStyles.action}>{day.label}</Text>
            <DensityBand count={day.count} max={max} label={day.summary} />
          </Pressable>
        ))}
      </View>
    </LookbackScaffold>
  );
}
