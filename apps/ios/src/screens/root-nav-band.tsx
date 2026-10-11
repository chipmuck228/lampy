import { tr } from '../i18n';
import { useState, type ReactNode, type Ref } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextLayoutEventData, type ViewStyle } from 'react-native';
import { Text } from './life-text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LifeIcon, type LifeIconName } from './life-icons';
import { leaveFabOverlayPadding } from './leave-fab';
import {
  NAV_BAND_HIT,
  NAV_BAND_ICON_GAP,
  NAV_BAND_ICON_SIZE,
  NAV_BAND_LABEL_SIZE,
  chooseNavBandLayout,
  hairline,
  inkSoft,
  navBandItemMinHeight,
  navBandItemMinWidth,
  navBandItemsFor,
  navBandOccupiedWidth,
  paper,
  sage,
  shouldUseNavRail,
} from './life-page';
import { usePageMetrics } from './use-page-metrics';
import { shouldIgnoreRootNavPress, type RootNavDest } from './root-nav-switch';

type BandDest = RootNavDest | 'family';

const BAND_DESTINATIONS: {
  id: BandDest;
  label: string;
  icon: LifeIconName;
  goTestID: string;
}[] = [
  { id: 'recent', label: tr("最近"), icon: 'recent', goTestID: 'lookback-go-recent' },
  { id: 'lookback', label: tr("回看"), icon: 'lookback', goTestID: 'home-lookback' },
  { id: 'albums', label: tr("生活册"), icon: 'album', goTestID: 'home-albums' },
  { id: 'family', label: tr("家庭"), icon: 'family', goTestID: 'home-family' },
];

export function RootNavBand({
  here,
  onGo,
  onFamily,
}: {
  here: RootNavDest;
  onGo: (dest: RootNavDest) => void;
  onFamily?: () => void;
}) {
  const { width, height } = usePageMetrics();
  const [painted, setPainted] = useState<Partial<Record<string, { width: number; height: number }>>>({});
  const destinations = BAND_DESTINATIONS.filter((item) => item.id !== 'family' || onFamily);
  const items = navBandItemsFor(here, !!onFamily).map((item, index) => ({
    ...item,
    id: destinations[index]?.id ?? item.label,
  }));
  const paintedReady = items.every((item) => painted[item.id]);
  const rail = shouldUseNavRail(width, height);
  const layout = rail
    ? 'rail'
    : chooseNavBandLayout({
        windowWidth: width,
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
        ? navBandOccupiedWidth({ label, fontSize, measuredWidth: measure.width })
        : navBandItemMinWidth(label, fontSize),
      minHeight: measure
        ? Math.max(NAV_BAND_HIT, Math.ceil(measure.height + NAV_BAND_ICON_SIZE + NAV_BAND_ICON_GAP))
        : navBandItemMinHeight(fontSize),
    };
  }

  const itemStyle = [
    styles.item,
    layout === 'rail' ? styles.railItem : layout === 'stack' ? styles.stackItem : styles.columnItem,
  ];

  function renderItem(dest: (typeof BAND_DESTINATIONS)[number]) {
    const selected = dest.id === here;
    const color = selected ? sage : inkSoft;
    const min = itemMin(dest.id, dest.label, NAV_BAND_LABEL_SIZE);
    const inner = (
      <View style={styles.itemInner} accessible={false}>
        <LifeIcon name={dest.icon} size={NAV_BAND_ICON_SIZE} color={color} decorative />
        <Text
          testID={selected && dest.id !== 'family' ? 'root-nav-here' : undefined}
          style={[styles.label, { color }]}
          onTextLayout={onPainted(dest.id)}
          accessible={false}
        >
          {dest.label}
        </Text>
      </View>
    );

    if (selected && dest.id !== 'family') {
      return (
        <View
          key={dest.id}
          testID="root-nav-here-wrap"
          accessible
          accessibilityRole="tab"
          accessibilityLabel={dest.label}
          accessibilityState={{ selected: true }}
          style={[itemStyle, min]}
        >
          {inner}
        </View>
      );
    }

    return (
      <Pressable
        key={dest.id}
        accessibilityRole="tab"
        accessibilityLabel={dest.label}
        accessibilityState={{ selected: false }}
        testID={dest.goTestID}
        onPress={() => {
          if (dest.id === 'family') {
            onFamily?.();
            return;
          }
          if (shouldIgnoreRootNavPress(here, dest.id)) return;
          onGo(dest.id);
        }}
        style={[itemStyle, min]}
      >
        {inner}
      </Pressable>
    );
  }

  const recentItem = renderItem(BAND_DESTINATIONS[0]);
  const lookbackItem = renderItem(BAND_DESTINATIONS[1]);
  const albumsItem = renderItem(BAND_DESTINATIONS[2]);
  const familyItem = onFamily ? renderItem(BAND_DESTINATIONS[3]) : null;

  return (
    <View
      testID="root-nav-band"
      style={[
        styles.band,
        layout === 'rail' ? styles.rail : styles.phoneBand,
        layout === 'stack' && styles.stacked,
        layout === 'grid' && styles.grid,
      ]}
      accessibilityRole="tablist"
    >
      {layout === 'grid' ? (
        <>
          <View testID="root-nav-grid-row-1" style={styles.gridRow}>
            {recentItem}
            {lookbackItem}
          </View>
          <View testID="root-nav-grid-row-2" style={styles.gridRow}>
            {albumsItem}
            {familyItem}
          </View>
        </>
      ) : (
        <>
          {recentItem}
          {lookbackItem}
          {albumsItem}
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
  onScrollLayout,
  overlay,
  header,
  canvas = paper,
  cover,
}: {
  accessibilityLabel?: string;
  scrollTestID: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  band: ReactNode;
  children: ReactNode;
  scrollRef?: Ref<ScrollView>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: () => void;
  onContentSizeChange?: (contentWidth: number, contentHeight: number) => void;
  onScrollLayout?: (event: LayoutChangeEvent) => void;
  overlay?: ReactNode;
  header?: ReactNode;
  canvas?: string;
  cover?: ReactNode;
}) {
  const { width, height } = usePageMetrics();
  const rail = shouldUseNavRail(width, height);
  const overlayPad = leaveFabOverlayPadding(width, height);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: canvas }]} accessibilityLabel={accessibilityLabel}>
      <View style={rail ? styles.row : styles.column}>
        {rail ? band : null}
        <View style={styles.scroll}>
          {header ? (
            <View style={[styles.header, { backgroundColor: canvas }]}>{header}</View>
          ) : null}
          <ScrollView
            ref={scrollRef}
            testID={scrollTestID}
            style={styles.scroll}
            contentContainerStyle={contentContainerStyle}
            onScroll={onScroll}
            onScrollBeginDrag={onScrollBeginDrag}
            onContentSizeChange={onContentSizeChange}
            onLayout={onScrollLayout}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {cover}
          {overlay ? (
            <View testID="root-leave-overlay" pointerEvents="box-none" style={[styles.overlay, overlayPad]}>
              {overlay}
            </View>
          ) : null}
        </View>
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
  header: {
    flexShrink: 0,
    zIndex: 2,
    alignSelf: 'stretch',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  band: {
    alignSelf: 'stretch',
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 16,
    backgroundColor: paper,
  },
  phoneBand: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
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
    overflow: 'visible',
  },
  itemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: NAV_BAND_ICON_GAP,
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
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  label: {
    fontSize: NAV_BAND_LABEL_SIZE,
    lineHeight: 16,
    textAlign: 'center',
    flexShrink: 0,
  },
});
