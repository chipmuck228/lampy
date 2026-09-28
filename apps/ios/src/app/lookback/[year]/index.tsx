import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { getUseCases } from '../../../application/container';
import { lookbackMonthPage } from '../../../application/lookback-month';
import { readLookbackExpandedMonth, toggleLookbackExpandedMonth } from '../../../application/lookback-session';
import { lookbackYearPage, shouldShowYearMonthGrid } from '../../../application/lookback-year';
import { pad2 } from '../../../domain-adapters/calendar';
import type { HistoryMonthView, HistoryYearView } from '../../../projections/history-projection';
import {
  LookbackMessage,
  LookbackScaffold,
  lookbackHref,
  lookbackStyles,
} from '../../../screens/lookback-chrome';
import { LookbackYearEntries, LookbackYearMonths } from '../../../screens/lookback-year';
import {
  firstSearchParam,
  forgetLookbackYearOrigin,
  goToLookbackRootFromYear,
  shouldBackToLookbackRoot,
} from '../../../screens/lookback-origin';

export default function LookbackYearScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const showGrid = shouldShowYearMonthGrid({
    fontScale,
    windowWidth: width,
    horizontalInset: insets.left + insets.right,
  });
  const params = useLocalSearchParams<{ year?: string | string[]; y?: string | string[] }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const originToken = firstSearchParam(params.y);
  const [view, setView] = useState<HistoryYearView | { invalid: true } | null>(null);
  const [expandView, setExpandView] = useState<HistoryMonthView | { invalid: true } | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(() => readLookbackExpandedMonth(year));
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setExpandedMonth(readLookbackExpandedMonth(year));
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

  useEffect(() => {
    if (!expandedMonth) return undefined;
    let cancelled = false;
    getUseCases()
      .then((app) => app.getHistoryMonth(year, expandedMonth))
      .then((monthView) => {
        if (!cancelled && readLookbackExpandedMonth(year) === expandedMonth) {
          setExpandView(monthView);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [expandedMonth, year]);

  const ready = view && !('invalid' in view) ? view : null;
  const page = ready ? lookbackYearPage(ready) : null;
  const filledExpanded =
    page && expandedMonth && page.entries.some((entry) => entry.month === expandedMonth)
      ? expandedMonth
      : null;
  const expandReady = expandView && !('invalid' in expandView) ? expandView : null;
  const expandPage =
    filledExpanded && expandReady && expandReady.month === filledExpanded
      ? lookbackMonthPage(expandReady)
      : null;
  const path = `/lookback/${year}`;

  function toggleMonth(month: number) {
    const next = toggleLookbackExpandedMonth(year, month);
    setExpandedMonth(next);
    if (!next) setExpandView(null);
  }

  function openDay(month: number, day: number) {
    router.push(lookbackHref(`${path}/${pad2(month)}/${pad2(day)}`));
  }

  function openDayUnconfirmed(month: number) {
    router.push(lookbackHref(`${path}/${pad2(month)}/unconfirmed`));
  }

  return (
    <LookbackScaffold
      title={ready?.title || `${year}年`}
      path={path}
      onBack={() => {
        const openedFromLookbackRoot = shouldBackToLookbackRoot({
          originToken,
          navigationState: navigation.getState?.(),
        });
        goToLookbackRootFromYear(router, openedFromLookbackRoot);
        forgetLookbackYearOrigin(originToken);
      }}
    >
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
      {page && showGrid ? <LookbackYearMonths page={page} onOpenMonth={toggleMonth} /> : null}
      {page ? (
        <LookbackYearEntries
          page={page}
          expandedMonth={filledExpanded}
          expandPage={expandPage}
          onToggleMonth={toggleMonth}
          onOpenDay={openDay}
          onOpenDayUnconfirmed={openDayUnconfirmed}
        />
      ) : null}
    </LookbackScaffold>
  );
}
