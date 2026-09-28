import { useCallback, useState } from 'react';
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
import {
  LookbackYearEntries,
  LookbackYearMonths,
  type LookbackYearExpandStatus,
} from '../../../screens/lookback-year';
import {
  firstSearchParam,
  forgetLookbackYearOrigin,
  goToLookbackRootFromYear,
  shouldBackToLookbackRoot,
} from '../../../screens/lookback-origin';

type ExpandState =
  | { month: number; status: 'loading' }
  | { month: number; status: 'ready'; view: HistoryMonthView }
  | { month: number; status: 'error' };

function applyExpandedMonth(
  year: number,
  month: number,
  next: HistoryMonthView | { invalid: true } | 'error',
  setExpand: (state: ExpandState) => void,
) {
  if (readLookbackExpandedMonth(year) !== month) return;
  if (next === 'error' || 'invalid' in next) {
    setExpand({ month, status: 'error' });
    return;
  }
  setExpand({ month, status: 'ready', view: next });
}

function loadExpandedMonth(
  year: number,
  month: number,
  setExpand: (state: ExpandState) => void,
) {
  return getUseCases()
    .then((app) => app.getHistoryMonth(year, month))
    .then((monthView) => {
      applyExpandedMonth(year, month, monthView, setExpand);
    })
    .catch(() => {
      applyExpandedMonth(year, month, 'error', setExpand);
    });
}

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
  const [expand, setExpand] = useState<ExpandState | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(() => readLookbackExpandedMonth(year));
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getHistoryYear(year))
        .then((next) => {
          if (cancelled) return;
          const month = readLookbackExpandedMonth(year);
          setView(next);
          setError(null);
          setExpandedMonth(month);
          if (!month) return;
          return loadExpandedMonth(year, month, (state) => {
            if (!cancelled) setExpand(state);
          });
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
  const filledExpanded =
    page && expandedMonth && page.entries.some((entry) => entry.month === expandedMonth)
      ? expandedMonth
      : null;
  const expandStatus: LookbackYearExpandStatus | null = !filledExpanded
    ? null
    : expand && expand.month === filledExpanded
      ? expand.status === 'ready'
        ? { kind: 'ready', page: lookbackMonthPage(expand.view) }
        : expand.status === 'error'
          ? { kind: 'error' }
          : { kind: 'loading' }
      : { kind: 'loading' };
  const path = `/lookback/${year}`;

  function toggleMonth(month: number) {
    const next = toggleLookbackExpandedMonth(year, month);
    setExpandedMonth(next);
    if (!next) {
      setExpand(null);
      return;
    }
    setExpand((current) =>
      current?.month === next && current.status === 'ready'
        ? current
        : { month: next, status: 'loading' },
    );
    void loadExpandedMonth(year, next, setExpand);
  }

  function retryExpand(month: number) {
    if (readLookbackExpandedMonth(year) !== month) return;
    setExpand({ month, status: 'loading' });
    void loadExpandedMonth(year, month, setExpand);
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
          expand={expandStatus}
          onToggleMonth={toggleMonth}
          onRetryExpand={retryExpand}
          onOpenDay={openDay}
          onOpenDayUnconfirmed={openDayUnconfirmed}
        />
      ) : null}
    </LookbackScaffold>
  );
}
