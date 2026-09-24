import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatSoundDuration } from '../application/duration';
import type { AudioView, UnknownMediaView } from '../application/use-cases';
import type { PlaybackStatus } from '../infrastructure/media';

export type RecordPhase = 'ready' | 'recording' | 'stopped' | 'processing' | 'failed';

function playbackLabel(status: PlaybackStatus, durationLabel: string, currentMs: number): string {
  if (status === 'playing') {
    return `正在播放，${formatSoundDuration(currentMs)}，共${durationLabel}`;
  }
  if (status === 'paused') {
    return `已暂停，${formatSoundDuration(currentMs)}，共${durationLabel}`;
  }
  if (status === 'finished') {
    return `已播完，共${durationLabel}`;
  }
  if (status === 'unavailable') {
    return `这段声音暂时无法播放，共${durationLabel}`;
  }
  return `一段声音，${durationLabel}，未播放`;
}

export function MomentAudio({
  audio,
  playbackStatus = 'idle',
  currentTimeMs = 0,
  onPlay,
  onPause,
  testIDPrefix,
  compact = false,
}: {
  audio: AudioView | null;
  playbackStatus?: PlaybackStatus;
  currentTimeMs?: number;
  onPlay?: () => void;
  onPause?: () => void;
  testIDPrefix: string;
  compact?: boolean;
}) {
  if (!audio) return null;

  if (audio.status !== 'available' || playbackStatus === 'unavailable') {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${audio.label}。${audio.unavailableLabel}`}
        testID={`${testIDPrefix}-unavailable-${audio.id}`}
        style={styles.block}
      >
        <Text style={styles.missing}>
          {audio.unavailableLabel || '这段声音暂时无法播放，其他内容仍然保留。'}
        </Text>
      </View>
    );
  }

  const durationLabel = audio.durationLabel || formatSoundDuration(audio.durationMs);
  const playing = playbackStatus === 'playing';
  const actionLabel = playing ? '暂停' : playbackStatus === 'finished' ? '再听一次' : '播放';

  return (
    <View style={styles.block}>
      <Text
        style={compact ? styles.compactMeta : styles.meta}
        accessibilityLabel={playbackLabel(playbackStatus, durationLabel, currentTimeMs)}
      >
        {playbackStatus === 'playing'
          ? `正在播放 · ${formatSoundDuration(currentTimeMs)} / ${durationLabel}`
          : playbackStatus === 'paused'
            ? `已暂停 · ${formatSoundDuration(currentTimeMs)} / ${durationLabel}`
            : playbackStatus === 'finished'
              ? `已播完 · ${durationLabel}`
              : `一段声音 · ${durationLabel}`}
      </Text>
      {onPlay || onPause ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}，${durationLabel}`}
          testID={`${testIDPrefix}-play-${audio.id}`}
          onPress={() => {
            if (playing) onPause?.();
            else onPlay?.();
          }}
          style={styles.hit}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MomentUnknownMedia({
  items,
  testIDPrefix,
}: {
  items: UnknownMediaView[];
  testIDPrefix: string;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.block}>
      {items.map((item) => (
        <View
          key={item.id}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${item.label}。${item.unavailableLabel}`}
          testID={`${testIDPrefix}-unavailable-${item.id}`}
        >
          <Text style={styles.missing}>{item.unavailableLabel}</Text>
        </View>
      ))}
    </View>
  );
}

export function DraftSoundBar({
  phase,
  elapsedMs,
  audio,
  playbackStatus,
  currentTimeMs,
  disabled,
  onStart,
  onStop,
  onPlay,
  onPause,
  onRerecord,
  onRemove,
}: {
  phase: RecordPhase;
  elapsedMs: number;
  audio: AudioView | null;
  playbackStatus: PlaybackStatus;
  currentTimeMs: number;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onPlay: () => void;
  onPause: () => void;
  onRerecord: () => void;
  onRemove: () => void;
}) {
  const elapsedLabel = formatSoundDuration(elapsedMs);

  if (phase === 'recording') {
    return (
      <View style={styles.block}>
        <Text
          accessibilityLiveRegion="polite"
          accessibilityLabel={`正在录，${elapsedLabel}`}
          style={styles.recording}
        >
          正在录 · {elapsedLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`停止录音，已经录了${elapsedLabel}`}
          testID="composer-stop-sound"
          onPress={onStop}
          style={styles.hit}
        >
          <Text style={styles.action}>停止</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'processing') {
    return (
      <Text accessibilityLabel="正在留下这段声音" style={styles.meta}>
        正在留下这段声音…
      </Text>
    );
  }

  if (phase === 'failed') {
    return (
      <View style={styles.block}>
        <Text style={styles.missing}>这次没有录下声音。已经写的字和照片还在。</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="声音"
          testID="composer-sound"
          onPress={onStart}
          disabled={disabled}
          style={styles.hit}
        >
          <Text style={styles.action}>声音</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'stopped' && audio) {
    return (
      <View style={styles.block}>
        <MomentAudio
          audio={audio}
          playbackStatus={playbackStatus}
          currentTimeMs={currentTimeMs}
          onPlay={onPlay}
          onPause={onPause}
          testIDPrefix="composer-sound"
        />
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重录"
            testID="composer-rerecord"
            onPress={onRerecord}
            disabled={disabled}
            style={styles.hit}
          >
            <Text style={styles.action}>重录</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="移除这段声音"
            testID="composer-remove-sound"
            onPress={onRemove}
            disabled={disabled}
            style={styles.hit}
          >
            <Text style={styles.action}>移除</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="声音"
      testID="composer-sound"
      onPress={onStart}
      disabled={disabled}
      style={styles.hit}
    >
      <Text style={styles.action}>声音</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  hit: { minHeight: 44, justifyContent: 'center' },
  action: { fontSize: 18, lineHeight: 24, color: '#53604F' },
  recording: { fontSize: 18, lineHeight: 24, color: '#4F626D' },
  meta: { fontSize: 16, lineHeight: 24, color: '#4F626D' },
  compactMeta: { fontSize: 14, lineHeight: 20, color: '#4F626D' },
  missing: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
});
