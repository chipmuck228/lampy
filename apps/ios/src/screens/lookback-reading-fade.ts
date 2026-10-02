import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** Leaving the current day stays short so the next records can take the page. */
export const LOOKBACK_READING_FADE_OUT_MS = 240;
/** Ready records rise in slowly so the page does not pop. */
export const LOOKBACK_READING_FADE_IN_MS = 640;
export const LOOKBACK_READING_APPEAR_SHIFT = 12;
/** @deprecated Use LOOKBACK_READING_FADE_IN_MS. Kept for older fade-duration checks. */
export const LOOKBACK_READING_FADE_MS = LOOKBACK_READING_FADE_IN_MS;

export function lookbackReadingShouldHoldVisible(input: {
  hadVisibleReading: boolean;
  sameScope: boolean;
}): boolean {
  return input.hadVisibleReading && !input.sameScope;
}

export function lookbackReadingFadeOutDuration(reduceMotion: boolean): number {
  return reduceMotion ? 0 : LOOKBACK_READING_FADE_OUT_MS;
}

export function lookbackReadingFadeInDuration(reduceMotion: boolean): number {
  return reduceMotion ? 0 : LOOKBACK_READING_FADE_IN_MS;
}

export function lookbackReadingFadeDuration(reduceMotion: boolean): number {
  return lookbackReadingFadeInDuration(reduceMotion);
}

export function lookbackReadingAppearShift(reduceMotion: boolean): number {
  return reduceMotion ? 0 : LOOKBACK_READING_APPEAR_SHIFT;
}

export function useLookbackReadingFade() {
  const [opacity] = useState(() => new Animated.Value(1));
  const [shift] = useState(() => new Animated.Value(0));
  const reduceMotionRef = useRef(true);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) reduceMotionRef.current = value === true;
      })
      .catch(() => {
        if (alive) reduceMotionRef.current = true;
      });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      reduceMotionRef.current = value === true;
    });
    return () => {
      alive = false;
      motion?.remove?.();
      anim.current?.stop();
    };
  }, []);

  const play = useCallback(
    (toOpacity: number, toShift: number, duration: number, started: number) => {
      return new Promise<boolean>((resolve) => {
        if (started !== seqRef.current) {
          resolve(false);
          return;
        }
        anim.current?.stop();
        if (duration === 0) {
          opacity.setValue(toOpacity);
          shift.setValue(toShift);
          resolve(started === seqRef.current);
          return;
        }
        const next = Animated.parallel([
          Animated.timing(opacity, {
            toValue: toOpacity,
            duration,
            easing: toOpacity === 0 ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(shift, {
            toValue: toShift,
            duration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);
        anim.current = next;
        next.start(({ finished }) => {
          if (anim.current === next) anim.current = null;
          resolve(finished === true && started === seqRef.current);
        });
      });
    },
    [opacity, shift],
  );

  const begin = useCallback(() => {
    const started = seqRef.current + 1;
    seqRef.current = started;
    return started;
  }, []);

  const hide = useCallback(
    (started: number) => {
      if (started !== seqRef.current) return;
      anim.current?.stop();
      anim.current = null;
      opacity.setValue(0);
      shift.setValue(lookbackReadingAppearShift(reduceMotionRef.current));
    },
    [opacity, shift],
  );

  const prepareAppear = useCallback(
    (started: number) => {
      if (started !== seqRef.current) return;
      anim.current?.stop();
      anim.current = null;
      opacity.setValue(0);
      shift.setValue(lookbackReadingAppearShift(reduceMotionRef.current));
    },
    [opacity, shift],
  );

  const fadeOut = useCallback(
    (started: number) =>
      play(0, 0, lookbackReadingFadeOutDuration(reduceMotionRef.current), started),
    [play],
  );

  const fadeIn = useCallback(
    (started: number) =>
      play(1, 0, lookbackReadingFadeInDuration(reduceMotionRef.current), started),
    [play],
  );

  const settle = useCallback(() => {
    seqRef.current += 1;
    anim.current?.stop();
    anim.current = null;
    opacity.setValue(1);
    shift.setValue(0);
  }, [opacity, shift]);

  return useMemo(
    () => ({ opacity, shift, begin, hide, prepareAppear, fadeOut, fadeIn, settle }),
    [opacity, shift, begin, hide, prepareAppear, fadeOut, fadeIn, settle],
  );
}
