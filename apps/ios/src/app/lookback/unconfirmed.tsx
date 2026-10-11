import { tr } from '../../i18n';
import { useCallback } from 'react';

import { getUseCases } from '../../application/container';
import { LookbackUnconfirmedReading } from '../../screens/lookback-unconfirmed-reading';

export default function LookbackUnconfirmedScreen() {
  const loadPage = useCallback(async (offset: number) => {
    const app = await getUseCases();
    return app.getHistoryUnknown(offset);
  }, []);
  return (
    <LookbackUnconfirmedReading
      scope={{ kind: 'unknown' }}
      path="/lookback/unconfirmed"
      fallbackTitle={tr("时间未确认")}
      moreTestID="lookback-unconfirmed-more"
      loadPage={loadPage}
    />
  );
}
