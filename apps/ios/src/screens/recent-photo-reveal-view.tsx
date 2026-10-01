import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';

import {
  beginRecentPhotoReveal,
  finishRecentPhotoReveal,
  peekRecentPhotoRevealPhase,
  photoRevealMotion,
  recentPhotoRevealViewport,
  subscribeRecentPhotoReveal,
  type PhotoRevealPhase,
} from './recent-photo-reveal';

export function RecentPhotoReveal({
  photoId,
  reduceMotion,
  testID,
  children,
}: {
  photoId: string;
  reduceMotion: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const viewRef = useRef<View>(null);
  const started = useRef(false);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const [phase, setPhase] = useState<PhotoRevealPhase>(() =>
    peekRecentPhotoRevealPhase(photoId, reduceMotion),
  );
  const [opacity] = useState(() => {
    return new Animated.Value(photoRevealMotion(peekRecentPhotoRevealPhase(photoId, reduceMotion), reduceMotion).opacity);
  });
  const [shift] = useState(() => {
    return new Animated.Value(
      photoRevealMotion(peekRecentPhotoRevealPhase(photoId, reduceMotion), reduceMotion).translateY,
    );
  });

  useEffect(() => subscribeRecentPhotoReveal(photoId, setPhase), [photoId]);

  useEffect(() => {
    if (!reduceMotion) return;
    beginRecentPhotoReveal(photoId, true);
  }, [photoId, reduceMotion]);

  useEffect(() => {
    const host = recentPhotoRevealViewport;
    host.register(photoId, (report) => {
      viewRef.current?.measureInWindow((_x, y, _w, height) => {
        if (height > 0) report({ y, height });
      });
    });
    return () => host.unregister(photoId);
  }, [photoId]);

  useEffect(() => {
    const motion = photoRevealMotion(phase, reduceMotion);
    if (phase !== 'revealing' || reduceMotion || started.current) {
      anim.current?.stop();
      anim.current = null;
      opacity.setValue(motion.opacity);
      shift.setValue(motion.translateY);
      if (phase === 'revealing' && (reduceMotion || motion.duration === 0)) {
        finishRecentPhotoReveal(photoId);
      }
      return;
    }
    started.current = true;
    const next = Animated.parallel([
      Animated.timing(opacity, {
        toValue: motion.opacity,
        duration: motion.duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shift, {
        toValue: motion.translateY,
        duration: motion.duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    anim.current = next;
    next.start(({ finished }) => {
      if (anim.current === next) anim.current = null;
      if (finished) setPhase(finishRecentPhotoReveal(photoId));
    });
  }, [opacity, phase, photoId, reduceMotion, shift]);

  useEffect(() => {
    return () => {
      anim.current?.stop();
      anim.current = null;
    };
  }, []);

  return (
    <View ref={viewRef} collapsable={false} style={{ width: '100%' }}>
      <Animated.View
        testID={testID}
        accessible={false}
        collapsable={false}
        style={{
          width: '100%',
          opacity,
          transform: [{ translateY: shift }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
