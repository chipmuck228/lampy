import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './life-text';
import { LifeIcon } from './life-icons';
import { hairline, ink, pageGutter, paperDeep, sage } from './life-page';
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
        {
          opacity,
          transform: [{ translateY: shift }],
        },
      ]}
      accessibilityElementsHidden={!available}
      importantForAccessibility={available ? 'yes' : 'no-hide-descendants'}
    >
      <View style={styles.shadow} pointerEvents="box-none" accessible={false}>
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
          <LifeIcon name="plus" size={16} color={sage} decorative />
          <Text style={styles.label}>留下</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end' },
  shadow: {
    shadowColor: ink,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  fab: {
    minHeight: LEAVE_FAB_HIT,
    height: LEAVE_FAB_HIT,
    minWidth: LEAVE_FAB_HIT,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: 24,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontFamily: 'PingFang SC',
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 1.12,
    color: sage,
  },
});
