import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Share } from 'react-native';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { nativeQuickActions } from '../../modules/lampy-quick-actions';
import { forgetAllHomeScreenEntries, homeScreenActions, homeScreenLeaveHref, LAMPY_PUBLIC_URL } from '../application/home-screen-actions';
import { useDeviceLock } from './device-lock-context';

/** Mounted outside FirstRunGate, so a cold-launch action can wait for the guide. */
export function HomeScreenActionCapture() {
  useEffect(() => {
    const native = nativeQuickActions();
    let subscription: { remove(): void } | undefined;
    try {
      subscription = native?.addListener('onAction', homeScreenActions.receive);
      const initial = native?.consumePending();
      if (initial) homeScreenActions.receive(initial);
    } catch {
      // A stale development binary must not block ordinary app startup.
      subscription?.remove();
      subscription = undefined;
    }
    const app = AppState.addEventListener('change', state => {
      if (state === 'background') {
        homeScreenActions.cancel();
        // Also cover the gap between router.push and composer mounting.
        forgetAllHomeScreenEntries();
      }
    });
    return () => { subscription?.remove(); app.remove(); };
  }, []);
  return null;
}

/** Mounted only after FirstRunGate exposes the navigator. */
export function HomeScreenActionDispatch() {
  const pending = useSyncExternalStore(homeScreenActions.subscribe, homeScreenActions.snapshot);
  const lock = useDeviceLock();
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const [lifeState, setLifeState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setLifeState);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!pending) return;
    if (lock?.snapshot.locked && lock.message) { homeScreenActions.cancel(); return; }
    if (!navigation?.key || !lock || lock.snapshot.locked || lifeState !== 'active' || AppState.currentState !== 'active') return;
    const action = homeScreenActions.consume(pending.requestId);
    if (!action) return;
    if (action.kind === 'share') {
      // Share only the public introduction, never a draft, album or account.
      void Share.share({ url: LAMPY_PUBLIC_URL }).catch(() => undefined);
      return;
    }
    const href = homeScreenLeaveHref(action.kind);
    if (pathname === '/leave') router.setParams(href.params);
    else router.push(href);
  }, [pending, lock, navigation?.key, lifeState, pathname, router]);
  return null;
}
