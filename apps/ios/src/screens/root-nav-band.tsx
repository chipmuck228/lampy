import type { ReactNode, Ref } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ink, paper, paperDeep, sage, shouldStackNavBand, shouldUseNavRail } from './life-page';

export function RootNavBand({
  here,
  onOther,
  onLeave,
  onFamily,
}: {
  here: 'recent' | 'lookback';
  onOther: () => void;
  onLeave: () => void;
  onFamily?: () => void;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const rail = shouldUseNavRail(width, height, fontScale);
  const stacked = shouldStackNavBand(width, fontScale);
  const hereLabel = here === 'recent' ? '最近' : '回看';
  const otherLabel = here === 'recent' ? '回看' : '最近';

  return (
    <View
      testID="root-nav-band"
      style={[styles.band, rail && styles.rail, stacked && styles.stacked]}
      accessibilityRole="none"
    >
      <Text
        testID="root-nav-here"
        style={styles.here}
        accessibilityRole="text"
        accessibilityLabel={`${hereLabel}，当前页`}
      >
        {hereLabel}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={otherLabel}
        testID={here === 'recent' ? 'home-lookback' : 'lookback-go-recent'}
        onPress={onOther}
        style={styles.hit}
      >
        <Text style={styles.go}>{otherLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="留下"
        testID={here === 'recent' ? 'home-leave' : 'lookback-leave'}
        onPress={onLeave}
        style={styles.leaveHit}
      >
        <Text style={styles.leave}>留下</Text>
      </Pressable>
      {onFamily ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="家庭"
          testID="home-family"
          onPress={onFamily}
          style={styles.hit}
        >
          <Text style={styles.go}>家庭</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function RootReadingLayout({
  accessibilityLabel,
  scrollTestID,
  contentContainerStyle,
  band,
  children,
  scrollRef,
  onScroll,
  onContentSizeChange,
}: {
  accessibilityLabel?: string;
  scrollTestID: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  band: ReactNode;
  children: ReactNode;
  scrollRef?: Ref<ScrollView>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange?: () => void;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const rail = shouldUseNavRail(width, height, fontScale);

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel={accessibilityLabel}>
      <View style={rail ? styles.row : styles.column}>
        {rail ? band : null}
        <ScrollView
          ref={scrollRef}
          testID={scrollTestID}
          style={styles.scroll}
          contentContainerStyle={contentContainerStyle}
          onScroll={onScroll}
          onContentSizeChange={onContentSizeChange}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {rail ? null : band}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  column: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  scroll: { flex: 1, width: '100%' },
  band: {
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 16,
    backgroundColor: paperDeep,
  },
  rail: {
    width: 112,
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 22,
  },
  stacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  here: { minHeight: 48, fontSize: 17, lineHeight: 24, color: ink, textAlignVertical: 'center' },
  hit: { minWidth: 48, minHeight: 48, justifyContent: 'center', paddingRight: 8 },
  go: { fontSize: 17, lineHeight: 24, color: sage },
  leaveHit: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
  leave: { fontSize: 20, lineHeight: 28, color: ink },
});
