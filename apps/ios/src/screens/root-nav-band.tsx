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

import {
  chooseNavBandLayout,
  ink,
  navBandItemsFor,
  paper,
  paperDeep,
  sage,
  shouldUseNavRail,
} from './life-page';

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
  const layout = rail
    ? 'rail'
    : chooseNavBandLayout({
        windowWidth: width,
        fontScale,
        items: navBandItemsFor(here, !!onFamily),
      });
  const hereLabel = here === 'recent' ? '最近' : '回看';
  const otherLabel = here === 'recent' ? '回看' : '最近';
  const itemStyle = [
    styles.item,
    layout === 'rail' ? styles.railItem : layout === 'stack' ? styles.stackItem : styles.columnItem,
  ];

  const hereItem = (
    <View testID="root-nav-here-wrap" style={itemStyle}>
      <Text
        testID="root-nav-here"
        style={styles.here}
        accessibilityRole="text"
        accessibilityLabel={`${hereLabel}，当前页`}
      >
        {hereLabel}
      </Text>
    </View>
  );
  const otherItem = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={otherLabel}
      testID={here === 'recent' ? 'home-lookback' : 'lookback-go-recent'}
      onPress={onOther}
      style={itemStyle}
    >
      <Text style={styles.go}>{otherLabel}</Text>
    </Pressable>
  );
  const leaveItem = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="留下"
      testID={here === 'recent' ? 'home-leave' : 'lookback-leave'}
      onPress={onLeave}
      style={itemStyle}
    >
      <Text style={styles.leave}>留下</Text>
    </Pressable>
  );
  const familyItem = onFamily ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="家庭"
      testID="home-family"
      onPress={onFamily}
      style={itemStyle}
    >
      <Text style={styles.go}>家庭</Text>
    </Pressable>
  ) : null;

  return (
    <View
      testID="root-nav-band"
      style={[
        styles.band,
        layout === 'rail' && styles.rail,
        layout === 'stack' && styles.stacked,
        layout === 'grid' && styles.grid,
      ]}
      accessibilityRole="none"
    >
      {layout === 'grid' ? (
        <>
          <View testID="root-nav-grid-row-1" style={styles.gridRow}>
            {hereItem}
            {otherItem}
          </View>
          <View testID="root-nav-grid-row-2" style={styles.gridRow}>
            {leaveItem}
            {familyItem}
          </View>
        </>
      ) : (
        <>
          {hereItem}
          {otherItem}
          {leaveItem}
          {familyItem}
        </>
      )}
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
  scroll: { flex: 1, minWidth: 0 },
  band: {
    alignSelf: 'stretch',
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 16,
    backgroundColor: paperDeep,
  },
  rail: {
    width: 112,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 22,
  },
  stacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
  },
  grid: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    alignSelf: 'stretch',
  },
  item: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
  },
  columnItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: 'center',
  },
  stackItem: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  railItem: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'flex-start',
  },
  here: { fontSize: 17, lineHeight: 24, color: ink, textAlign: 'center' },
  go: { fontSize: 17, lineHeight: 24, color: sage, textAlign: 'center' },
  leave: { fontSize: 20, lineHeight: 28, color: ink, textAlign: 'center' },
});
