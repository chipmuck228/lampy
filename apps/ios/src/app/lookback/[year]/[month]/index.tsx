import { useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { rememberLookbackExpandedMonth } from '../../../../application/lookback-session';
import { pad2 } from '../../../../domain-adapters/calendar';
import { LookbackMessage, LookbackScaffold, lookbackHref } from '../../../../screens/lookback-chrome';

export default function LookbackMonthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string | string[]; month?: string | string[] }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const month = Number(Array.isArray(params.month) ? params.month[0] : params.month);
  const validYear = Number.isInteger(year) && year >= 1 && year <= 9999;
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12;

  useFocusEffect(
    useCallback(() => {
      if (!validYear) return;
      if (validMonth) rememberLookbackExpandedMonth(year, month);
      router.replace(lookbackHref(`/lookback/${year}`));
    }, [month, router, validMonth, validYear, year]),
  );

  return (
    <LookbackScaffold
      title={validYear && validMonth ? `${year}年${month}月` : '没有这个月'}
      path={validYear && validMonth ? `/lookback/${year}/${pad2(month)}` : '/lookback'}
    >
      {validYear ? null : <LookbackMessage>没有这个月。</LookbackMessage>}
    </LookbackScaffold>
  );
}
