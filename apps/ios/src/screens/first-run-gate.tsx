import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { decideFirstRunGuide } from '../application/first-run';
import { getUseCases } from '../application/container';
import { leaveHref } from './lookback-origin';
import { createSecureFirstRunStore, type FirstRunStore } from '../infrastructure/first-run-store';
import { paper } from './life-page';
import { FirstRunGuide } from './first-run-guide';

export async function readFirstRunLibrary() {
  try {
    const recent = await (await getUseCases()).getRecentLife();
    return {
      hasPersonalRecords: recent.items.length > 0 || recent.isFirstUse === false,
      recordsUnknown: false,
    };
  } catch {
    return { hasPersonalRecords: false, recordsUnknown: true };
  }
}

export function FirstRunGate({
  children,
  store = createSecureFirstRunStore(),
  readLibrary = readFirstRunLibrary,
}: {
  children: ReactNode;
  store?: FirstRunStore;
  readLibrary?: () => Promise<{ hasPersonalRecords: boolean; recordsUnknown: boolean }>;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<'pending' | 'show' | 'skip'>('pending');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const completed = await store.isCompleted();
      const library = await readLibrary();
      if (!alive) return;
      const next = decideFirstRunGuide({
        completed,
        hasPersonalRecords: library.hasPersonalRecords,
        recordsUnknown: library.recordsUnknown,
      });
      setDecision(next.showGuide ? 'show' : 'skip');
    })();
    return () => {
      alive = false;
    };
  }, [readLibrary, store]);

  if (decision === 'pending') {
    return <View testID="first-run-pending" style={{ flex: 1, backgroundColor: paper }} />;
  }
  if (decision === 'skip') {
    return <View testID="first-run-ready" style={{ flex: 1 }}>{children}</View>;
  }

  return (
    <FirstRunGuide
      onFinished={() => {
        void store.markCompleted().then(() => {
          setDecision('skip');
          router.push(leaveHref('recent'));
        });
      }}
    />
  );
}
