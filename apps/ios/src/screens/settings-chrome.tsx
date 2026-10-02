import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hairline, ink, paper, sage } from './life-page';
import { LifeIcon } from './life-icons';
import { Text, type } from './life-text';

export function SettingsPage({
  title,
  backLabel,
  accessibilityLabel,
  testID,
  onBack,
  children,
}: {
  title: string;
  backLabel: string;
  accessibilityLabel: string;
  testID?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.safe} accessibilityLabel={accessibilityLabel}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
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
        contentContainerStyle={[
          styles.column,
          { paddingBottom: Math.max(insets.bottom, 44) },
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  header: {
    minHeight: 66,
    paddingHorizontal: 22,
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
  column: {
    width: '100%',
    paddingHorizontal: 25,
  },
});
