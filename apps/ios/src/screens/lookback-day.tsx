import { tr } from '../i18n';
import { Pressable, StyleSheet } from 'react-native';
import { Text, type } from './life-text';

import type { LookbackDayEntry } from '../application/lookback-day';
import { MomentAudio, MomentUnknownMedia } from './moment-audio';
import { MomentFeeling } from './moment-feeling';
import { MomentImages } from './moment-images';

export function LookbackDayMoment({
  entry,
  onPress,
}: {
  entry: LookbackDayEntry;
  onPress: () => void;
}) {
  const summary =
    [
      entry.clockLabel || '',
      entry.note,
      ...entry.images.map((image) => image.label),
      entry.audio?.label || '',
      ...entry.unknownMedia.map((item) => item.label),
      entry.feeling ? tr("当时的感受，{0}", [entry.feeling.label]) : '',
    ]
      .filter(Boolean)
      .join('，') || tr("一条记录");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary}
      testID={`lookback-moment-${entry.id}`}
      onPress={onPress}
      style={styles.row}
    >
      {entry.clockLabel ? <Text style={styles.clock}>{entry.clockLabel}</Text> : null}
      {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
      <MomentImages images={entry.images} testIDPrefix={`lookback-image-${entry.id}`} />
      <MomentAudio audio={entry.audio} testIDPrefix={`lookback-sound-${entry.id}`} compact />
      <MomentUnknownMedia items={entry.unknownMedia} testIDPrefix={`lookback-unknown-${entry.id}`} />
      <MomentFeeling feeling={entry.feeling ?? null} testID={`lookback-feeling-${entry.id}`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingVertical: 8,
    minHeight: 44,
    flexGrow: 0,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  clock: { ...type.meta, color: '#53604F' },
  note: { ...type.body, color: '#25231F' },
});
