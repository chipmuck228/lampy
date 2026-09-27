import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import {
  BRAND_FADE_MS,
  brandReadyTimeoutMs,
  brandTimeoutGeneration,
  consumeStartupBrand,
  shouldShowStartupBrand,
  shouldSkipBrandFade,
} from '../application/startup-brand';
import { paper } from './life-page';

const mark = require('../../assets/images/splash-icon.png');

export function StartupBrandLayer({ homeSettled }: { homeSettled: boolean }) {
  const [visible, setVisible] = useState(shouldShowStartupBrand);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduceMotion(value);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!visible || homeSettled) return;
    const generation = brandTimeoutGeneration();
    const timer = setTimeout(() => {
      if (generation !== brandTimeoutGeneration()) return;
      consumeStartupBrand();
      setVisible(false);
    }, brandReadyTimeoutMs());
    return () => clearTimeout(timer);
  }, [homeSettled, visible]);

  useEffect(() => {
    if (!visible || !homeSettled) return;
    consumeStartupBrand();
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: shouldSkipBrandFade(reduceMotion) ? 0 : BRAND_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => {
      animation.stop();
    };
  }, [homeSettled, opacity, reduceMotion, visible]);

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
