import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { useDeviceLock } from './device-lock-context';

// A request is qualified by focus, foreground, lock and its own generation.
export function useFamilyPrivateRequest() {
  const lock = useDeviceLock();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const allowed = isFamilyProductEntryOpen() && !lock?.snapshot.locked && active;
  const allowedRef = useRef(allowed);
  useLayoutEffect(() => { allowedRef.current = allowed; }, [allowed]);
  const sequence = useRef(0);
  const focused = useRef(false);
  const enter = useCallback(() => { focused.current = true; }, []);
  const leave = useCallback(() => {
    focused.current = false;
    sequence.current++;
    pauseForegroundAudio();
  }, []);
  const begin = useCallback(() => {
    const request = ++sequence.current;
    return () => focused.current && allowedRef.current && AppState.currentState === 'active' && sequence.current === request;
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') { sequence.current++; pauseForegroundAudio(); }
      setActive(next === 'active');
    });
    return () => { subscription.remove(); leave(); };
  }, [leave]);
  return { allowed, enter, leave, begin };
}
