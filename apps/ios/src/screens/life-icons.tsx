import { Pressable, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { Text, type } from './life-text';
import { SymbolView } from 'expo-symbols';

import { inkSoft, sage } from './life-page';

export const LIFE_ICON_NAMES = {
  settings: 'gearshape',
  back: 'chevron.left',
  open: 'chevron.right',
  lock: 'lock',
  info: 'info.circle',
  storage: 'internaldrive',
  play: 'play.fill',
  pause: 'pause.fill',
  replay: 'gobackward',
  camera: 'camera',
  photo: 'photo.on.rectangle',
  record: 'mic',
  expand: 'chevron.down',
  collapse: 'chevron.up',
  plus: 'plus',
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
  layoutRevision,
}: {
  icon: LifeIconName;
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  layoutRevision?: number;
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
      <View key={`labeled-${layoutRevision ?? 1}`} style={styles.labeledRow}>
        <LifeIcon name={icon} size={18} color={sage} decorative />
        <Text key={`labeled-text-${layoutRevision ?? 1}`} style={styles.labeledText}>
          {label}
        </Text>
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
  caption = '看这条',
  tight,
  align = 'center',
  captionStyle,
}: {
  onPress: () => void;
  testID?: string;
  accessibilityLabel: string;
  caption?: string;
  tight?: boolean;
  align?: 'center' | 'end';
  captionStyle?: StyleProp<TextStyle>;
}) {
  const ids = openChildIds(testID);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="打开这条记录"
      testID={testID}
      onPress={onPress}
      style={[
        styles.lookThis,
        tight && styles.lookThisTight,
        align === 'end' && styles.lookThisEnd,
      ]}
    >
      <View
        style={[
          styles.lookThisRow,
          tight && styles.lookThisRowTight,
          align === 'end' && styles.lookThisRowEnd,
        ]}
        testID={ids?.row}
      >
        <Text
          style={[styles.lookThisText, align === 'end' && styles.lookThisTextEnd, captionStyle]}
          testID={ids?.label}
        >
          {caption}
        </Text>
        <View accessible={false} testID={ids?.mark} style={styles.lookThisMark}>
          <LifeIcon name="open" size={16} color={sage} decorative />
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
    ...type.action,
    color: sage,
  },
  lookThis: {
    minHeight: 48,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  lookThisTight: {
    minHeight: 48,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  lookThisEnd: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  lookThisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  lookThisRowTight: {
    justifyContent: 'flex-start',
  },
  lookThisRowEnd: {
    flexWrap: 'nowrap',
    flexShrink: 0,
    justifyContent: 'flex-end',
  },
  lookThisText: {
    ...type.action,
    color: sage,
    flexShrink: 1,
  },
  lookThisTextEnd: {
    flexGrow: 0,
    flexShrink: 0,
  },
  lookThisMark: {
    flexShrink: 0,
  },
});
