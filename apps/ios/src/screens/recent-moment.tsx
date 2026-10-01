import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text, type } from './life-text';

import type { RecentLifeItem } from '../application/use-cases';
import type { PlaybackStatus } from '../infrastructure/media';
import { ink, inkSoft, sage } from './life-page';
import { LookThisHit } from './life-icons';
import { MomentAudio, MomentUnknownMedia } from './moment-audio';
import { MomentImages } from './moment-images';
import { RecentFeeling } from './recent-feeling';
import {
  recentNoteIsTruncated,
  recentNoteVisibleLineLimit,
  recentOpenAccessLabel,
  recentOpenCaption,
} from './recent-note';

export function RecentMoment({
  item,
  pairImages,
  echoOpacity,
  echoing = false,
  expanded = false,
  listen,
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
                  accessibilityLabel={expanded ? '收起正文' : '展开正文'}
                  testID={`recent-expand-${item.id}`}
                  onPress={onToggleExpand}
                  style={styles.expandHit}
                >
                  <Text style={styles.expand}>{expanded ? '收起正文' : '展开正文'}</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          {item.occurredLabel ? (
            <Text style={styles.occurred} testID={`recent-occurred-${item.id}`}>
              {item.occurredLabel}
            </Text>
          ) : null}
          <MomentImages
            images={item.images}
            testIDPrefix={`recent-image-${item.id}`}
            rhythm={pairImages}
          />
          <MomentUnknownMedia items={item.unknownMedia ?? []} testIDPrefix={`recent-unknown-${item.id}`} />
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
        />
        <RecentFeeling feeling={item.feeling} testID={`recent-feeling-${item.id}`} />
        <LookThisHit
          caption={recentOpenCaption(truncated)}
          accessibilityLabel={
            recentOpenAccessLabel([item.dateLabel, item.occurredLabel, item.note], truncated) ||
            `${item.dateLabel}，一条记录`
          }
          testID={`recent-open-${item.id}`}
          onPress={onOpen}
        />
      </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Keep overflow off the native-driver fade. Face ID in/out can black the window
  // if Animated.View is asked to clip-visible while compositing opacity.
  shell: { overflow: 'visible' },
  moment: { gap: 8, minHeight: 48, overflow: 'visible' },
  momentMixed: { gap: 16 },
  momentBody: { gap: 8, overflow: 'visible' },
  note: { ...type.body, color: ink },
  measure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  occurred: { ...type.meta, color: inkSoft },
  expandHit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  expand: { ...type.action, color: sage },
});
