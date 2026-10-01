import { StyleSheet, View } from 'react-native';
import { Text } from './life-text';

import { feelingAccentColor } from '../application/feeling-accent';
import type { FeelingView } from '../application/feeling';
import { recentFeelingInk, recentType } from './recent-visual';

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
      <Text style={styles.text}>{feeling.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  text: { ...recentType.feeling, color: recentFeelingInk, flexShrink: 1 },
});
