import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { hairline, ink, inkSoft, sage } from './life-page';
import { LifeIcon, type LifeIconName } from './life-icons';
import { Text, type } from './life-text';

export function SettingsRule() {
  return <View testID="account-rule" style={styles.rule} />;
}

export function SettingsLink({
  icon,
  title,
  detail,
  testID,
  onPress,
}: {
  icon: LifeIconName;
  title: string;
  detail?: string;
  testID: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      onPress={onPress}
      style={styles.row}
    >
      <LifeIcon name={icon} size={20} color={sage} decorative />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <LifeIcon name="open" size={16} color={inkSoft} decorative />
    </Pressable>
  );
}

export function SettingsFact({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Text style={styles.fact} testID={testID}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: hairline,
    alignSelf: 'stretch',
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...type.action, color: ink },
  detail: { ...type.meta, color: inkSoft },
  fact: { ...type.body, color: inkSoft, marginBottom: 16 },
});
