import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import {
  BRAND_FADE_MS,
  type BrandMotionPref,
  brandReadyTimeoutMs,
  brandTimeoutGeneration,
  consumeStartupBrand,
  shouldShowStartupBrand,
  shouldSkipBrandFade,
  shouldStartBrandExit,
} from '../application/startup-brand';
import { requestStartupOverlayExit, setStartupBrandCovering } from '../application/startup-overlay';
import { paper } from './life-page';

const mark = require('../../assets/images/splash-icon.png');

export function StartupBrandLayer({ homeSettled }: { homeSettled: boolean }) {
  const [visible, setVisible] = useState(shouldShowStartupBrand);
  const [motionPref, setMotionPref] = useState<BrandMotionPref>('pending');
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setMotionPref(value ? 'reduce' : 'allow');
      })
      .catch(() => {
        if (alive) setMotionPref('failed');
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setMotionPref(value ? 'reduce' : 'allow');
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) setStartupBrandCovering(true);
    return () => setStartupBrandCovering(false);
  }, [visible]);

  useEffect(() => {
    void requestStartupOverlayExit();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const generation = brandTimeoutGeneration();
    const timer = setTimeout(() => {
      if (generation !== brandTimeoutGeneration()) return;
      consumeStartupBrand();
      setVisible(false);
    }, brandReadyTimeoutMs());
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible || !homeSettled || !shouldStartBrandExit(motionPref)) return;
    consumeStartupBrand();
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: shouldSkipBrandFade(motionPref) ? 0 : BRAND_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => {
      animation.stop();
    };
  }, [homeSettled, motionPref, opacity, visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.layer, { opacity }]}
      testID="startup-brand-layer"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="进入最近"
        testID="startup-brand-skip"
        onPress={() => {
          consumeStartupBrand();
          setVisible(false);
        }}
        style={styles.hit}
      >
        <Image
          source={mark}
          accessibilityLabel="Lampy"
          testID="startup-brand-mark"
          style={styles.mark}
          resizeMode="contain"
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: paper,
    zIndex: 20,
  },
  hit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 76, height: 76 },
});
