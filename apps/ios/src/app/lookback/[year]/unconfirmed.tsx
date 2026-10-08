import { tr } from '../../../i18n';
import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { getUseCases } from '../../../application/container';
import { LookbackUnconfirmedReading } from '../../../screens/lookback-unconfirmed-reading';

export default function LookbackYearUnconfirmedScreen() {
  const params = useLocalSearchParams<{ year?: string | string[] }>();
  const year = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const loadPage = useCallback(
    async (offset: number) => {
      const app = await getUseCases();
      return app.getHistoryYearUnconfirmed(year, offset);
    },
    [year],
  );
  return (
    <LookbackUnconfirmedReading
      scope={{ kind: 'year-unconfirmed', year }}
      path={`/lookback/${year}/unconfirmed`}
      fallbackTitle={tr("{0}年，月份未确认", [year])}
      moreTestID="lookback-year-unconfirmed-more"
      loadPage={loadPage}
    />
  );
}
