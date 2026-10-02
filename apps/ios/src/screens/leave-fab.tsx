import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './life-text';
import { LifeIcon } from './life-icons';
import { ink, pageGutter, sage } from './life-page';
import { createRecentLeaveFabScroll, recentFabMotion } from './recent-leave-fab';

export const LEAVE_FAB_HIT = 48;
export const LEAVE_FAB_GAP_ABOVE_NAV = 14;
export const LEAVE_FAB_TRAIL = 30;
export const LEAVE_FAB_EDGE = LEAVE_FAB_GAP_ABOVE_NAV;

export function leaveFabScrollReserve(): number {
  return LEAVE_FAB_HIT + LEAVE_FAB_GAP_ABOVE_NAV + LEAVE_FAB_TRAIL;
}

export function leaveFabOverlayPadding(windowWidth: number, windowHeight: number) {
  return {
    paddingBottom: LEAVE_FAB_GAP_ABOVE_NAV,
    paddingRight: pageGutter(windowWidth, windowHeight),
  };
}

export function useLeaveFabMotion() {
  const [open, setOpen] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  const [shift] = useState(() => new Animated.Value(0));
  const openRef = useRef(true);
  const reduceMotionRef = useRef(true);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const scroll = useRef<ReturnType<typeof createRecentLeaveFabScroll> | null>(null);

  const reveal = useCallback((visible: boolean) => {
    if (openRef.current === visible) return;
    openRef.current = visible;
    setOpen(visible);
    anim.current?.stop();
    anim.current = null;
    const motion = recentFabMotion(visible, reduceMotionRef.current);
    if (motion.duration === 0) {
      opacity.setValue(motion.opacity);
      shift.setValue(motion.translateY);
      return;
    }
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
      if (finished) anim.current = null;
    });
  }, [opacity, shift]);

  const revealRef = useRef(reveal);
  useEffect(() => {
    revealRef.current = reveal;
  }, [reveal]);

  useEffect(() => {
    const machine = createRecentLeaveFabScroll((visible) => revealRef.current(visible));
    scroll.current = machine;
    return () => {
      machine.dispose();
      if (scroll.current === machine) scroll.current = null;
      anim.current?.stop();
    };
  }, []);

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
      motion.remove();
    };
  }, []);

  const onScroll = useCallback((offsetY: number) => {
    scroll.current?.onScroll(offsetY);
  }, []);

  return {
    open,
    opacity,
    shift,
    onScroll,
  };
}

export function LeaveFab({
  testID,
  onPress,
  available,
  opacity,
  shift,
}: {
  testID: string;
  onPress: () => void;
  available: boolean;
  opacity: Animated.Value;
  shift: Animated.Value;
}) {
  return (
    <Animated.View
      testID={`${testID}-shell`}
      pointerEvents={available ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        styles.shadow,
        {
          opacity,
          transform: [{ translateY: shift }],
        },
        !available ? styles.hidden : null,
      ]}
      accessibilityElementsHidden={!available}
      importantForAccessibility={available ? 'yes' : 'no-hide-descendants'}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="留下"
        accessibilityElementsHidden={!available}
        importantForAccessibility={available ? 'yes' : 'no-hide-descendants'}
        accessibilityState={{ disabled: !available }}
        testID={testID}
        disabled={!available}
        onPress={onPress}
        style={styles.fab}
      >
        <View
          testID={`${testID}-sheen`}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.sheen}
        />
        <View
          testID={`${testID}-depth`}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.depth}
        />
        <LifeIcon name="plus" size={16} color="#FFFFFF" decorative />
        <Text style={styles.label}>留下</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end' },
  hidden: { opacity: 0 },
  shadow: {
    shadowColor: ink,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  fab: {
    minHeight: LEAVE_FAB_HIT,
    height: LEAVE_FAB_HIT,
    minWidth: LEAVE_FAB_HIT,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: 24,
    backgroundColor: sage,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(243, 240, 233, 0.34)',
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  depth: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 14,
    backgroundColor: 'rgba(37, 35, 31, 0.10)',
  },
  label: {
    fontFamily: 'PingFang SC',
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 1.12,
    color: '#FFFFFF',
  },
});
