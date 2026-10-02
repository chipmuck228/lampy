import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ink, isCompactHeight, pageGutter, paper, readingWidth, sage } from './life-page';
import { LifeIcon } from './life-icons';
import { Text, type } from './life-text';
import { usePageMetrics } from './use-page-metrics';

export function SettingsPage({
  title,
  accessibilityLabel,
  testID,
  onBack,
  children,
}: {
  title: string;
  accessibilityLabel: string;
  testID?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = usePageMetrics();
  const gutter = pageGutter(width, height);
  const compact = isCompactHeight(height);
  const column = readingWidth(width, height);
  return (
    <SafeAreaView style={styles.safe} accessibilityLabel={accessibilityLabel}>
      <ScrollView
        testID={testID ?? 'account-scroll'}
        contentContainerStyle={[
          styles.column,
          {
            paddingHorizontal: gutter,
            paddingTop: compact ? 8 : 16,
            paddingBottom: Math.max(insets.bottom, 24),
            maxWidth: column + gutter * 2,
          },
        ]}
      >
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            testID="account-back"
            onPress={onBack}
            style={styles.backHit}
          >
            <LifeIcon name="back" size={20} color={sage} decorative />
            <Text style={styles.back}>返回</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  column: {
    width: '100%',
    alignSelf: 'center',
    gap: 0,
  },
  top: { gap: 12, marginBottom: 24 },
  backHit: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  back: { ...type.action, color: sage },
  title: { ...type.title, color: ink },
});
