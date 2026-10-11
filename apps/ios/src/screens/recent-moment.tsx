import { tr } from '../i18n';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './life-text';

import type { RecentLifeItem } from '../application/use-cases';
import type { PlaybackStatus } from '../infrastructure/media';
import { LookThisHit } from './life-icons';
import { MomentAudio, MomentUnknownMedia } from './moment-audio';
import { MomentImages } from './moment-images';
import { RecentFeeling } from './recent-feeling';
import { RecentPhotoReveal } from './recent-photo-reveal-view';
import {
  recentNoteIsTruncated,
  recentNoteVisibleLineLimit,
  recentOpenAccessLabel,
  recentOpenCaption,
} from './recent-note';
import {
  recentInk,
  recentInkSoft,
  recentOpenInk,
  recentRecordedClock,
  recentSage,
  recentType,
} from './recent-visual';

export function RecentMoment({
  item,
  pairImages,
  echoOpacity,
  echoing = false,
  expanded = false,
  listen,
  reduceMotion = false,
  onToggleExpand,
  onOpen,
  onPlay,
  onPause,
}: {
  item: RecentLifeItem;
  pairImages: boolean;
  echoOpacity: Animated.Value;
  echoing?: boolean;
  expanded?: boolean;
  listen: { status: PlaybackStatus; currentTimeMs: number };
  reduceMotion?: boolean;
  onToggleExpand?: () => void;
  onOpen: () => void;
  onPlay: () => void;
  onPause: () => void;
}) {
  const [lineCount, setLineCount] = useState(0);
  const truncated = recentNoteIsTruncated(lineCount);
  const mixed = !!(
    item.audio &&
    (item.note || item.images.length > 0 || (item.unknownMedia?.length ?? 0) > 0 || item.feeling)
  );
  const clock = recentRecordedClock(item.recordedAt);
  const hasStill = item.images.length > 0 || (item.unknownMedia?.length ?? 0) > 0;
  return (
    <View
      style={styles.shell}
      testID={echoing ? `recent-echo-${item.id}` : `recent-shell-${item.id}`}
      collapsable={false}
    >
      <Animated.View
        testID={`recent-fade-${item.id}`}
        style={{ opacity: echoing ? echoOpacity : 1 }}
        collapsable={false}
      >
      <View style={[styles.moment, mixed && styles.momentMixed]} testID={`recent-item-${item.id}`}>
        {clock ? (
          <View style={styles.meta}>
            <Text style={styles.time} testID={`recent-clock-${item.id}`}>
              {clock}
            </Text>
          </View>
        ) : null}
        <View style={styles.momentBody}>
          {item.note ? (
            <>
              <Text
                style={[styles.note, styles.measure]}
                testID={`recent-note-measure-${item.id}`}
                onTextLayout={(event) => setLineCount(event.nativeEvent.lines.length)}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {item.note}
              </Text>
              <Text
                style={styles.note}
                testID={`recent-note-${item.id}`}
                numberOfLines={expanded ? undefined : recentNoteVisibleLineLimit(lineCount)}
              >
                {item.note}
              </Text>
              {truncated ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={expanded ? tr("收起正文") : tr("展开正文")}
                  testID={`recent-expand-${item.id}`}
                  onPress={onToggleExpand}
                  style={styles.expandHit}
                >
                  <Text style={styles.expand}>{expanded ? tr("收起正文") : tr("展开正文")}</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          {hasStill ? (
            <View
              testID={item.note ? `recent-image-pause-${item.id}` : undefined}
              style={item.note ? styles.imagePause : undefined}
            >
              <MomentImages
                images={item.images}
                testIDPrefix={`recent-image-${item.id}`}
                rhythm={pairImages}
                wrapAvailable={(image, slot) => (
                  <RecentPhotoReveal
                    photoId={image.id}
                    reduceMotion={reduceMotion}
                    testID={`recent-image-${item.id}-reveal-${image.id}`}
                  >
                    {slot}
                  </RecentPhotoReveal>
                )}
              />
              <MomentUnknownMedia items={item.unknownMedia ?? []} testIDPrefix={`recent-unknown-${item.id}`} />
            </View>
          ) : null}
        </View>
        <MomentAudio
          audio={item.audio}
          playbackStatus={listen.status}
          currentTimeMs={listen.currentTimeMs}
          onPlay={onPlay}
          onPause={onPause}
          testIDPrefix={`recent-sound-${item.id}`}
          compact={!mixed}
          scene={mixed}
          markedActions
          progressWhenHeard
          chrome="row"
        />
        <View style={styles.foot}>
          {item.feeling ? (
            <View style={styles.footFeeling}>
              <RecentFeeling feeling={item.feeling} testID={`recent-feeling-${item.id}`} />
            </View>
          ) : (
            <View style={styles.footSpacer} />
          )}
          <LookThisHit
            caption={recentOpenCaption(truncated)}
            accessibilityLabel={
              recentOpenAccessLabel([item.dayLabel, clock, item.note], truncated) ||
              tr("{0}，一条记录", [item.dayLabel])
            }
            testID={`recent-open-${item.id}`}
            onPress={onOpen}
            align="end"
            captionStyle={styles.open}
          />
        </View>
      </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Keep overflow off the native-driver fade. Face ID in/out can black the window
  // if Animated.View is asked to clip-visible while compositing opacity.
  shell: { overflow: 'visible' },
  moment: { gap: 0, minHeight: 48, overflow: 'visible', paddingTop: 22, paddingBottom: 16 },
  momentMixed: { gap: 0 },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  time: { ...recentType.meta, color: recentInkSoft },
  momentBody: { gap: 10, overflow: 'visible' },
  imagePause: { marginTop: 22, gap: 16 },
  note: { ...recentType.note, color: recentInk, marginBottom: 4 },
  measure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
    marginBottom: 0,
  },
  expandHit: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: -4,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  expand: { ...recentType.expand, color: recentSage },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: 10,
    marginTop: 18,
  },
  footFeeling: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  footSpacer: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  open: { ...recentType.open, color: recentOpenInk },
});
