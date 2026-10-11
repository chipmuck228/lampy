import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { decideFirstRunGuide, type FirstRunDecision } from '../application/first-run';
import { getUseCases } from '../application/container';
import { homeScreenActions } from '../application/home-screen-actions';
import { leaveHref } from './lookback-origin';
import { createSecureFirstRunStore, type FirstRunStore } from '../infrastructure/first-run-store';
import { paper } from './life-page';
import { FirstRunGuide } from './first-run-guide';

export const FIRST_RUN_FINISH_ERROR = '这次没有记下引导完成。记录还在，可以再试一次。';

export async function finishFirstRunGuide(store: FirstRunStore) {
  try {
    await store.markCompleted();
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: FIRST_RUN_FINISH_ERROR };
  }
}

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
  store,
  readLibrary,
}: {
  children: ReactNode;
  store?: FirstRunStore;
  readLibrary?: () => Promise<{ hasPersonalRecords: boolean; recordsUnknown: boolean }>;
}) {
  const router = useRouter();
  const defaults = useRef({
    store: store ?? createSecureFirstRunStore(),
    readLibrary: readLibrary ?? readFirstRunLibrary,
  });
  const [decision, setDecision] = useState<'pending' | 'show' | 'skip'>('pending');
  const [skipReason, setSkipReason] = useState<FirstRunDecision['reason'] | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const resolvedStore = store ?? defaults.current.store;
    const resolvedRead = readLibrary ?? defaults.current.readLibrary;
    void (async () => {
      let completed = false;
      try {
        completed = await resolvedStore.isCompleted();
      } catch {
        completed = false;
      }
      let library = { hasPersonalRecords: false, recordsUnknown: true };
      try {
        library = await resolvedRead();
      } catch {
        library = { hasPersonalRecords: false, recordsUnknown: true };
      }
      if (!alive) return;
      const next = decideFirstRunGuide({
        completed,
        hasPersonalRecords: library.hasPersonalRecords,
        recordsUnknown: library.recordsUnknown,
      });
      if (__DEV__) {
        console.log('[first-run]', next.reason, {
          completed,
          hasPersonalRecords: library.hasPersonalRecords,
          recordsUnknown: library.recordsUnknown,
        });
      }
      setSkipReason(next.showGuide ? null : next.reason);
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
    return (
      <View testID="first-run-ready" style={{ flex: 1, backgroundColor: paper }}>
        {skipReason ? <View testID={`first-run-skip-${skipReason}`} /> : null}
        {children}
      </View>
    );
  }

  return (
    <FirstRunGuide
      finishError={finishError}
      onFinished={() => {
        void finishFirstRunGuide(store ?? defaults.current.store).then((result) => {
          if (!result.ok) {
            setFinishError(result.message);
            return;
          }
          setFinishError(null);
          setDecision('skip');
          // A shortcut waiting through onboarding owns the next navigation.
          if (!homeScreenActions.snapshot()) router.push(leaveHref('recent'));
        });
      }}
    />
  );
}
