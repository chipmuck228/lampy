import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hairline, ink, pageGutter, paper, readingWidth, sage } from './life-page';
import { LifeIcon } from './life-icons';
import { Text, type } from './life-text';
import { usePageMetrics } from './use-page-metrics';

export function settingsEdgePad(inset: number, gutter: number): number {
  return Math.max(inset, gutter);
}

export function SettingsPage({
  title,
  backLabel,
  accessibilityLabel,
  testID,
  pageTestID,
  onBack,
  children,
}: {
  title: string;
  backLabel: string;
  accessibilityLabel: string;
  testID?: string;
  pageTestID?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = usePageMetrics();
  const gutter = pageGutter(width, height);
  const column = readingWidth(width, height);
  const padLeft = settingsEdgePad(insets.left, gutter);
  const padRight = settingsEdgePad(insets.right, gutter);
  return (
    <View style={styles.safe} accessibilityLabel={accessibilityLabel} testID={pageTestID}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            paddingLeft: padLeft,
            paddingRight: padRight,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          testID="account-back"
          onPress={onBack}
          style={styles.backHit}
        >
          <LifeIcon name="back" size={19} color={sage} decorative />
          <Text style={styles.back}>{backLabel}</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        testID={testID ?? 'account-scroll'}
        style={styles.scroll}
        contentContainerStyle={[
          styles.column,
          {
            paddingLeft: padLeft,
            paddingRight: padRight,
            paddingBottom: Math.max(insets.bottom, 44),
          },
        ]}
      >
        <View style={[styles.reading, { maxWidth: column }]}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  header: {
    minHeight: 66,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backHit: {
    minWidth: 70,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  back: { ...type.meta, color: sage },
  title: { ...type.meta, color: ink, textAlign: 'center', flexShrink: 1 },
  headerSpacer: { width: 70, minHeight: 48 },
  scroll: { flex: 1 },
  column: {
    width: '100%',
    alignItems: 'center',
  },
  reading: {
    width: '100%',
  },
});
