import { useState, type ReactNode, type Ref } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextLayoutEventData,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  NAV_BAND_HERE_SIZE,
  NAV_BAND_HIT,
  NAV_BAND_LEAVE_SIZE,
  chooseNavBandLayout,
  ink,
  navBandItemMinHeight,
  navBandItemMinWidth,
  navBandItemsFor,
  navBandOccupiedWidth,
  paper,
  paperDeep,
  sage,
  shouldUseNavRail,
} from './life-page';
import { usePageMetrics } from './use-page-metrics';

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
  const { width, height, fontScale } = usePageMetrics();
  const [painted, setPainted] = useState<Partial<Record<string, { width: number; height: number }>>>({});
  const hereLabel = here === 'recent' ? '最近' : '回看';
  const otherLabel = here === 'recent' ? '回看' : '最近';
  const items = navBandItemsFor(here, !!onFamily).map((item, index) => ({
    ...item,
    id: (['here', 'other', 'leave', 'family'] as const)[index],
  }));
  const paintedReady = items.every((item) => painted[item.id]);
  const rail = shouldUseNavRail(width, height, fontScale);
  const layout = rail
    ? 'rail'
    : chooseNavBandLayout({
        windowWidth: width,
        fontScale,
        items: items.map((item) => ({
          ...item,
          measuredWidth: paintedReady ? painted[item.id]?.width : undefined,
        })),
      });

  function onPainted(id: string) {
    return (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      const lines = event.nativeEvent.lines;
      if (!lines.length) return;
      const next = {
        width: lines.reduce((max, line) => Math.max(max, line.width), 0),
        height: lines.reduce((sum, line) => sum + line.height, 0),
      };
      if (next.width <= 0 || next.height <= 0) return;
      setPainted((current) => {
        const prev = current[id];
        if (prev && prev.width === next.width && prev.height === next.height) return current;
        return { ...current, [id]: next };
      });
    };
  }

  function itemMin(id: string, label: string, fontSize: number) {
    const measure = painted[id];
    return {
      minWidth: measure
        ? navBandOccupiedWidth({ label, fontSize, measuredWidth: measure.width }, fontScale)
        : navBandItemMinWidth(label, fontSize, fontScale),
      minHeight: measure
        ? Math.max(NAV_BAND_HIT, Math.ceil(measure.height))
        : navBandItemMinHeight(fontSize, fontScale),
    };
  }

  const hereMin = itemMin('here', hereLabel, NAV_BAND_HERE_SIZE);
  const otherMin = itemMin('other', otherLabel, NAV_BAND_HERE_SIZE);
  const leaveMin = itemMin('leave', '留下', NAV_BAND_LEAVE_SIZE);
  const familyMin = itemMin('family', '家庭', NAV_BAND_HERE_SIZE);
  const itemStyle = [
    styles.item,
    layout === 'rail' ? styles.railItem : layout === 'stack' ? styles.stackItem : styles.columnItem,
  ];

  const hereItem = (
    <View testID="root-nav-here-wrap" style={[itemStyle, hereMin]}>
      <Text
        testID="root-nav-here"
        style={styles.here}
        onTextLayout={onPainted('here')}
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
      style={[itemStyle, otherMin]}
    >
      <Text style={styles.go} onTextLayout={onPainted('other')}>
        {otherLabel}
      </Text>
    </Pressable>
  );
  const leaveItem = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="留下"
      testID={here === 'recent' ? 'home-leave' : 'lookback-leave'}
      onPress={onLeave}
      style={[itemStyle, leaveMin]}
    >
      <Text style={styles.leave} onTextLayout={onPainted('leave')}>
        留下
      </Text>
    </Pressable>
  );
  const familyItem = onFamily ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="家庭"
      testID="home-family"
      onPress={onFamily}
      style={[itemStyle, familyMin]}
    >
      <Text style={styles.go} onTextLayout={onPainted('family')}>
        家庭
      </Text>
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
  onScrollBeginDrag,
  onContentSizeChange,
}: {
  accessibilityLabel?: string;
  scrollTestID: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  band: ReactNode;
  children: ReactNode;
  scrollRef?: Ref<ScrollView>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: () => void;
  onContentSizeChange?: () => void;
}) {
  const { width, height, fontScale } = usePageMetrics();
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
          onScrollBeginDrag={onScrollBeginDrag}
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
    flexShrink: 0,
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
  here: { fontSize: 17, color: ink, textAlign: 'center', flexShrink: 0 },
  go: { fontSize: 17, color: sage, textAlign: 'center', flexShrink: 0 },
  leave: { fontSize: 20, color: ink, textAlign: 'center', flexShrink: 0 },
});
