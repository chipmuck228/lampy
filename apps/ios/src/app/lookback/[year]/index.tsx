import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { lookbackBookHref, lookbackBookIntentFromParts } from '../../../application/lookback-book';
import { writeLookbackBookIntent } from '../../../application/lookback-session';
import { firstSearchParam } from '../../../screens/lookback-origin';

export default function LookbackYearScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string | string[]; o?: string | string[] }>();
  const year = Array.isArray(params.year) ? params.year[0] : params.year;
  const originToken = firstSearchParam(params.o);

  useEffect(() => {
    const intent = lookbackBookIntentFromParts({ year });
    if (intent) writeLookbackBookIntent(intent);
    router.replace(lookbackBookHref(originToken));
    // router is stable enough for this trampoline; listing it retriggers replace every render in tests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, originToken]);

  return null;
}
