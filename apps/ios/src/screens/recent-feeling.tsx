import { StyleSheet, View } from 'react-native';
import { Text, type } from './life-text';

import { feelingAccentColor } from '../application/feeling-accent';
import type { FeelingView } from '../application/feeling';

export function RecentFeeling({
  feeling,
  testID,
}: {
  feeling: FeelingView | null;
  testID?: string;
}) {
  if (!feeling) return null;
  return (
    <View
      testID={testID}
      accessibilityLabel={`当时的感受，${feeling.label}`}
      style={styles.row}
    >
      <View
        testID={testID ? `${testID}-dot` : undefined}
        accessible={false}
        importantForAccessibility="no"
        style={[styles.dot, { backgroundColor: feelingAccentColor(feeling) }]}
      />
      <Text style={styles.text}>当时的感受 · {feeling.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  text: { ...type.meta, color: '#5C5851', flexShrink: 1 },
});
