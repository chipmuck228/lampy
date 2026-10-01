import { StyleSheet, View } from 'react-native';
import { Text, type } from './life-text';

import type { FIRST_RUN_SCREENS } from '../application/first-run';
import { ink, inkSoft, paper, paperDeep, sage } from './life-page';

const SAMPLE_HINT = '示意，不是你的记录';

export function FirstRunScene({
  id,
}: {
  id: (typeof FIRST_RUN_SCREENS)[number]['id'];
}) {
  return (
    <View testID={`first-run-scene-${id}`} style={styles.scene}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {id === 'leave' ? <LeaveScene /> : null}
        {id === 'lookback' ? <LookbackScene /> : null}
        {id === 'keep' ? <KeepScene /> : null}
      </View>
      <Text style={styles.hint} accessibilityRole="text">
        {SAMPLE_HINT}
      </Text>
    </View>
  );
}

function LeaveScene() {
  return (
    <View style={styles.row}>
      <View style={styles.slip}>
        <Text style={styles.slipText}>门口的风。</Text>
      </View>
      <View style={styles.photo}>
        <View style={styles.photoInner} />
      </View>
      <View style={styles.bars}>
        <View style={[styles.bar, { height: 10 }]} />
        <View style={[styles.bar, { height: 18 }]} />
        <View style={[styles.bar, { height: 12 }]} />
      </View>
    </View>
  );
}

function LookbackScene() {
  return (
    <View style={styles.lookback}>
      <Text style={styles.date}>9月18日</Text>
      <Text style={styles.excerpt}>那天的风还在。</Text>
    </View>
  );
}

function KeepScene() {
  return <View style={styles.quiet} />;
}

const styles = StyleSheet.create({
  scene: { gap: 10, alignItems: 'flex-start' },
  hint: { ...type.meta, color: inkSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  slip: {
    backgroundColor: paperDeep,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 160,
  },
  slipText: { ...type.action, color: ink },
  photo: {
    width: 56,
    height: 72,
    backgroundColor: paperDeep,
    padding: 4,
  },
  photoInner: { flex: 1, backgroundColor: paper },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 22 },
  bar: { width: 3, backgroundColor: sage },
  lookback: { gap: 6 },
  date: { ...type.meta, color: sage },
  excerpt: { ...type.body, color: ink },
  quiet: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: paperDeep,
  },
});
