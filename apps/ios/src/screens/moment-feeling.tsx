import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './life-text';

import { FEELING_VOCABULARY, type FeelingView } from '../application/feeling';
import { LifeIcon } from './life-icons';

export function FeelingPicker({
  value,
  disabled,
  onChange,
  layoutRevision,
}: {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  layoutRevision?: number;
}) {
  const selected = value.trim();
  const [open, setOpen] = useState(false);
  const chipsVisible = !selected || open;

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selected ? `当时的感受，${selected}` : '当时的感受'}
        accessibilityState={{ expanded: chipsVisible, disabled: !!disabled }}
        testID="composer-feeling-toggle"
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        style={styles.toggleHit}
      >
        <View style={styles.toggleRow}>
          <Text key={`feeling-heading-${layoutRevision ?? 1}`} style={styles.heading}>
            {selected || '当时的感受'}
          </Text>
          <LifeIcon name={chipsVisible ? 'collapse' : 'expand'} size={14} decorative />
        </View>
      </Pressable>
      {chipsVisible ? (
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
      ) : null}
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
  toggleHit: { minHeight: 48, justifyContent: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: { fontSize: 16, color: '#5C5851', flexShrink: 1 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 48,
    minWidth: 48,
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
  clearHit: { minHeight: 48, justifyContent: 'center' },
  clear: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  display: { fontSize: 14, color: '#5C5851' },
});
