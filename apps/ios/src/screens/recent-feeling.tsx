import { StyleSheet, Text, View } from 'react-native';

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
    alignItems: 'center',
    gap: 8,
    minHeight: 22,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  text: { fontSize: 14, lineHeight: 20, color: '#5C5851', flexShrink: 1 },
});
