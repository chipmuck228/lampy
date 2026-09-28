import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { lookbackBookHref, lookbackBookIntentFromParts } from '../../../../application/lookback-book';
import { writeLookbackBookIntent } from '../../../../application/lookback-session';
import { firstSearchParam } from '../../../../screens/lookback-origin';

export default function LookbackMonthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    year?: string | string[];
    month?: string | string[];
    o?: string | string[];
  }>();
  const year = Array.isArray(params.year) ? params.year[0] : params.year;
  const month = Array.isArray(params.month) ? params.month[0] : params.month;
  const originToken = firstSearchParam(params.o);

  useEffect(() => {
    const intent = lookbackBookIntentFromParts({ year, month });
    if (intent) writeLookbackBookIntent(intent);
    router.replace(lookbackBookHref(originToken));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, originToken]);

  return null;
}
