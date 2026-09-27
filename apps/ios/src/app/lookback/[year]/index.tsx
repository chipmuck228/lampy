import { useCallback, useState } from 'react';
import { Pressable, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../../../application/container';
import { lookbackYearPage, shouldShowYearMonthGrid } from '../../../application/lookback-year';
import { pad2 } from '../../../domain-adapters/calendar';
import type { HistoryYearView } from '../../../projections/history-projection';
import {
  LookbackMessage,
  LookbackScaffold,
  lookbackHref,
  lookbackStyles,
} from '../../../screens/lookback-chrome';
import { LookbackYearEntries, LookbackYearMonths } from '../../../screens/lookback-year';

export default function LookbackYearScreen() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const showGrid = shouldShowYearMonthGrid({
    fontScale,
    windowWidth: width,
    horizontalInset: insets.left + insets.right,
  });
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
  const page = ready ? lookbackYearPage(ready) : null;
  const path = `/lookback/${year}`;

  function openMonth(month: number) {
    router.push(lookbackHref(`${path}/${pad2(month)}`));
  }

  return (
    <LookbackScaffold title={ready?.title || `${year}年`} path={path}>
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view && 'invalid' in view ? <LookbackMessage>没有这一年。</LookbackMessage> : null}
      {page?.isEmpty ? <LookbackMessage>这一年还没有留下什么。</LookbackMessage> : null}
      {ready && ready.yearUnconfirmedCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${ready.yearUnconfirmedLabel}，有${ready.yearUnconfirmedCount}条记录`}
          testID={`lookback-year-unconfirmed-${year}`}
          onPress={() => router.push(lookbackHref(`${path}/unconfirmed`))}
          style={lookbackStyles.hit}
        >
          <Text style={lookbackStyles.action}>
            {ready.yearUnconfirmedLabel} · {ready.yearUnconfirmedCount}条
          </Text>
        </Pressable>
      ) : null}
      {page && showGrid ? <LookbackYearMonths page={page} onOpenMonth={openMonth} /> : null}
      {page ? <LookbackYearEntries page={page} onOpenMonth={openMonth} /> : null}
    </LookbackScaffold>
  );
}
