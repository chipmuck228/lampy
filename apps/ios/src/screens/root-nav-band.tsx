import { personalAlbumsAvailable, personalRecordsOnly } from '../application/mobile-capabilities';
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
  navBandItemMinHeight,
  navBandItemMinWidth,
  navBandItemsFor,
  navBandOccupiedWidth,
  paper,
  sage,
  isRegularWidth,
  ROOT_NAV_MAX_WIDTH,
  ROOT_NAV_REGULAR_HEIGHT,
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
  { id: 'family', label: tr("家庭"), icon: 'family', goTestID: 'home-family' },
  { id: 'albums', label: tr("生活册"), icon: 'album', goTestID: 'home-albums' },
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
  const destinations = BAND_DESTINATIONS.filter((item) => (item.id !== 'family' || (onFamily && !personalRecordsOnly())) && (item.id !== 'albums' || personalAlbumsAvailable()));
  const items = navBandItemsFor(here, !!onFamily).map((item, index) => ({
    ...item,
    id: destinations[index]?.id ?? item.label,
  }));
  const paintedReady = items.every((item) => painted[item.id]);
  const compact = isRegularWidth(width, height);
  const layout = chooseNavBandLayout({
        windowWidth: compact ? ROOT_NAV_MAX_WIDTH : width,
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
    layout === 'stack' ? styles.stackItem : styles.columnItem,
  ];

  function renderItem(dest: (typeof BAND_DESTINATIONS)[number]) {
    const selected = dest.id === here;
    const color = sage;
    const min = itemMin(dest.id, dest.label, NAV_BAND_LABEL_SIZE);
    const inner = (
      <View style={[styles.itemInner, compact && styles.compactInner]} accessible={false}>
        <LifeIcon name={dest.icon} size={NAV_BAND_ICON_SIZE} color={color} decorative />
        <Text
          testID={selected ? 'root-nav-here' : undefined}
          style={[styles.label, { color }, selected && {fontWeight:'600'}]}
          onTextLayout={onPainted(dest.id)}
          accessible={false}
        >
          {dest.label}
        </Text>
        {compact && selected ? <View testID="root-nav-selection-rule" style={styles.selectionRule} accessible={false} /> : null}
      </View>
    );

    if (selected) {
      return (
        <View
          key={dest.id}
          testID="root-nav-here-wrap"
          accessible
          accessibilityRole="tab"
          accessibilityLabel={dest.label}
          accessibilityState={{ selected: true }}
          style={[itemStyle, min, compact && styles.compactItem]}
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
        style={[itemStyle, min, compact && styles.compactItem]}
      >
        {inner}
      </Pressable>
    );
  }

  const recentItem = renderItem(BAND_DESTINATIONS[0]);
  const lookbackItem = renderItem(BAND_DESTINATIONS[1]);
  const albumsItem = personalAlbumsAvailable() ? renderItem(BAND_DESTINATIONS[3]) : null;
  const familyItem = onFamily && !personalRecordsOnly() ? renderItem(BAND_DESTINATIONS[2]) : null;

  return (
    <View
      testID="root-nav-band"
      style={[
        styles.band,
        styles.phoneBand,
        compact && styles.compactBand,
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
            {familyItem}
            {albumsItem}
          </View>
        </>
      ) : (
        <>
          {recentItem}
          {lookbackItem}
          {familyItem}
          {albumsItem}
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
  const overlayPad = leaveFabOverlayPadding(width, height);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: canvas }]} accessibilityLabel={accessibilityLabel}>
      <View style={styles.column}>
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
        {band}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  column: { flex: 1 },
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
  compactBand: {
    width: '100%',
    maxWidth: ROOT_NAV_MAX_WIDTH,
    alignSelf: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  compactItem: { minHeight: ROOT_NAV_REGULAR_HEIGHT - 16 },
  compactInner: { paddingBottom: 8 },
  selectionRule: {
    position: 'absolute',
    bottom: 0,
    width: 24,
    height: 2,
    backgroundColor: sage,
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
  label: {
    fontSize: NAV_BAND_LABEL_SIZE,
    lineHeight: 16,
    textAlign: 'center',
    flexShrink: 0,
  },
});
