import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../../../../application/container';
import type { HistoryDayViewModel } from '../../../../application/history-use-cases';
import { pad2 } from '../../../../domain-adapters/calendar';
import {
  HistoryMomentRow,
  LookbackMessage,
  LookbackScaffold,
  momentHref,
} from '../../../../screens/lookback-chrome';

export default function LookbackDayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    year?: string | string[];
    month?: string | string[];
    day?: string | string[];
  }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const month = Number(Array.isArray(params.month) ? params.month[0] : params.month);
  const day = Number(Array.isArray(params.day) ? params.day[0] : params.day);
  const [view, setView] = useState<HistoryDayViewModel | { invalid: true } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = `/lookback/${year}/${pad2(month)}/${pad2(day)}`;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getHistoryDay(year, month, day))
        .then((next) => {
          if (!cancelled) {
            setView(next);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('这一天暂时读不出来，原来的记录还在。');
        });
      return () => {
        cancelled = true;
      };
    }, [year, month, day]),
  );

  const ready = view && !('invalid' in view) ? view : null;

  return (
    <LookbackScaffold title={ready?.title || `${year}年${month}月${day}日`} path={path}>
      {error ? <LookbackMessage>{error}</LookbackMessage> : null}
      {view && 'invalid' in view ? <LookbackMessage>日历上没有这一天。</LookbackMessage> : null}
      {ready?.isEmpty ? <LookbackMessage>这一天还没有留下什么。</LookbackMessage> : null}
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
    </LookbackScaffold>
  );
}
