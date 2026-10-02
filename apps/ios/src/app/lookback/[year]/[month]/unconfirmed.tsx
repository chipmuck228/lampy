import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { getUseCases } from '../../../../application/container';
import { pad2 } from '../../../../domain-adapters/calendar';
import { LookbackUnconfirmedReading } from '../../../../screens/lookback-unconfirmed-reading';

export default function LookbackMonthUnconfirmedScreen() {
  const params = useLocalSearchParams<{ year?: string | string[]; month?: string | string[] }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const month = Number(Array.isArray(params.month) ? params.month[0] : params.month);
  const loadPage = useCallback(
    async (offset: number) => {
      const app = await getUseCases();
      return app.getHistoryMonthUnconfirmed(year, month, offset);
    },
    [year, month],
  );
  return (
    <LookbackUnconfirmedReading
      scope={{ kind: 'month-unconfirmed', year, month }}
      path={`/lookback/${year}/${pad2(month)}/unconfirmed`}
      fallbackTitle={`${year}年${month}月，日子未确认`}
      moreTestID="lookback-month-unconfirmed-more"
      loadPage={loadPage}
    />
  );
}
