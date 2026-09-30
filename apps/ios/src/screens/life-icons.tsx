import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { inkSoft, sage } from './life-page';

export const LIFE_ICON_NAMES = {
  settings: 'gearshape',
  open: 'chevron.right',
  play: 'play.fill',
  pause: 'pause.fill',
  replay: 'gobackward',
  camera: 'camera',
  photo: 'photo.on.rectangle',
  record: 'mic',
  expand: 'chevron.down',
  collapse: 'chevron.up',
} as const;

export type LifeIconName = keyof typeof LIFE_ICON_NAMES;

export function LifeIcon({
  name,
  size = 18,
  color = sage,
  decorative = true,
}: {
  name: LifeIconName;
  size?: number;
  color?: string;
  decorative?: boolean;
}) {
  return (
    <SymbolView
      name={LIFE_ICON_NAMES[name]}
      size={size}
      tintColor={color}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no' : 'auto'}
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}

export function LifeIconButton({
  name,
  label,
  onPress,
  testID,
  color = inkSoft,
  size = 22,
}: {
  name: LifeIconName;
  label: string;
  onPress: () => void;
  testID?: string;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={styles.iconHit}
    >
      <LifeIcon name={name} size={size} color={color} decorative />
    </Pressable>
  );
}

export function LifeLabeledHit({
  icon,
  label,
  onPress,
  testID,
  disabled,
  accessibilityLabel,
}: {
  icon: LifeIconName;
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={styles.labeledHit}
    >
      <View style={styles.labeledRow}>
        <LifeIcon name={icon} size={18} color={sage} decorative />
        <Text style={styles.labeledText}>{label}</Text>
      </View>
    </Pressable>
  );
}

function openChildIds(testID?: string) {
  if (!testID) return null;
  const match = /^(.*)-open-(.+)$/.exec(testID);
  if (!match) return null;
  return {
    row: `${match[1]}-open-row-${match[2]}`,
    label: `${match[1]}-open-label-${match[2]}`,
    mark: `${match[1]}-open-mark-${match[2]}`,
  };
}

export function LookThisHit({
  onPress,
  testID,
  accessibilityLabel,
  tight,
}: {
  onPress: () => void;
  testID?: string;
  accessibilityLabel: string;
  tight?: boolean;
}) {
  const ids = openChildIds(testID);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="打开这条记录"
      testID={testID}
      onPress={onPress}
      style={[styles.lookThis, tight && styles.lookThisTight]}
    >
      <View style={styles.lookThisRow} testID={ids?.row}>
        <Text style={styles.lookThisText} testID={ids?.label}>
          看这条
        </Text>
        <View accessible={false} testID={ids?.mark}>
          <LifeIcon name="open" size={12} color={sage} decorative />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconHit: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  labeledHit: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  labeledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
  },
  labeledText: {
    fontSize: 16,
    color: sage,
  },
  lookThis: {
    minHeight: 48,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lookThisTight: {
    minHeight: 48,
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  lookThisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  lookThisText: {
    fontSize: 16,
    lineHeight: 22,
    color: sage,
  },
});
