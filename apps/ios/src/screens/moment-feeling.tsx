import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FEELING_VOCABULARY, type FeelingView } from '../application/feeling';

export function FeelingPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const selected = value.trim();
  const unknown = !!selected && !(FEELING_VOCABULARY as readonly string[]).includes(selected);

  return (
    <View accessibilityLabel="当时的感受" style={styles.block}>
      <Text style={styles.heading}>当时的感受</Text>
      {unknown ? (
        <Text testID="composer-feeling-unknown" style={styles.unknown}>
          {selected}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {FEELING_VOCABULARY.map((word) => {
          const isSelected = selected === word;
          return (
            <Pressable
              key={word}
              accessibilityRole="button"
              accessibilityLabel={
                isSelected ? `当时的感受，${word}，已选中` : `当时的感受，${word}`
              }
              accessibilityState={{ selected: isSelected, disabled: !!disabled }}
              accessibilityHint={isSelected ? '再点可清除' : '可选，不是必须'}
              testID={`composer-feeling-${word}`}
              disabled={disabled}
              onPress={() => onChange(isSelected ? '' : word)}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{word}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="清除当时的感受"
          testID="composer-feeling-clear"
          disabled={disabled}
          onPress={() => onChange('')}
          style={styles.clearHit}
        >
          <Text style={styles.clear}>清除</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MomentFeeling({
  feeling,
  testID,
}: {
  feeling: FeelingView | null;
  testID?: string;
}) {
  if (!feeling) return null;
  return (
    <Text
      testID={testID}
      accessibilityLabel={`当时的感受，${feeling.label}`}
      style={styles.display}
    >
      当时的感受 · {feeling.label}
    </Text>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  heading: { fontSize: 16, lineHeight: 22, color: '#5C5851' },
  unknown: { fontSize: 16, lineHeight: 22, color: '#5C5851' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipSelected: {
    borderColor: '#25231F',
  },
  chipText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#5C5851',
  },
  chipTextSelected: {
    color: '#25231F',
    textDecorationLine: 'underline',
  },
  clearHit: { minHeight: 44, justifyContent: 'center' },
  clear: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  display: { fontSize: 14, lineHeight: 20, color: '#5C5851' },
});
