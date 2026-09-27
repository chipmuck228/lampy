import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatSoundDuration } from '../application/duration';
import type { AudioView, UnknownMediaView } from '../application/use-cases';
import type { PlaybackStatus } from '../infrastructure/media';
import { hairline, inkSoft, sage, sound } from './life-page';

export type RecordPhase = 'ready' | 'recording' | 'stopped' | 'processing' | 'failed';

export function draftPreviewStatus(
  status: PlaybackStatus,
  failed: boolean,
  audioId: string | undefined,
  boundId: string | null,
): PlaybackStatus {
  if (!audioId || boundId !== audioId) return 'idle';
  return failed ? 'unavailable' : status;
}

function playbackLabel(status: PlaybackStatus, durationLabel: string, currentMs: number): string {
  if (status === 'preparing') {
    return `正在准备这段声音，共${durationLabel}`;
  }
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
    return `这段声音这次没有播出，共${durationLabel}`;
  }
  return `一段声音，${durationLabel}，未播放`;
}

function playbackMeta(status: PlaybackStatus, durationLabel: string, currentMs: number): string {
  if (status === 'preparing') return `正在准备 · ${durationLabel}`;
  if (status === 'playing') return `正在播放 · ${formatSoundDuration(currentMs)} / ${durationLabel}`;
  if (status === 'paused') return `已暂停 · ${formatSoundDuration(currentMs)} / ${durationLabel}`;
  if (status === 'finished') return `已播完 · ${durationLabel}`;
  return `一段声音 · ${durationLabel}`;
}

export function MomentAudio({
  audio,
  playbackStatus = 'idle',
  currentTimeMs = 0,
  onPlay,
  onPause,
  testIDPrefix,
  compact = false,
  scene = false,
}: {
  audio: AudioView | null;
  playbackStatus?: PlaybackStatus;
  currentTimeMs?: number;
  onPlay?: () => void;
  onPause?: () => void;
  testIDPrefix: string;
  compact?: boolean;
  scene?: boolean;
}) {
  if (!audio) return null;

  if (audio.status !== 'available') {
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

  if (playbackStatus === 'unavailable') {
    return (
      <View style={styles.block}>
        {scene ? (
          <Text style={styles.sceneTitle} testID={`${testIDPrefix}-scene-${audio.id}`}>
            {audio.label}
          </Text>
        ) : null}
        <Text
          accessibilityRole="text"
          accessibilityLabel={playbackLabel('unavailable', durationLabel, 0)}
          testID={`${testIDPrefix}-failed-${audio.id}`}
          style={styles.missing}
        >
          这段声音这次没有播出。可以再试一次。
        </Text>
        {onPlay ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`再试一次，${durationLabel}`}
            testID={`${testIDPrefix}-retry-${audio.id}`}
            onPress={onPlay}
            style={styles.hit}
          >
            <Text style={styles.action}>再试一次</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const playing = playbackStatus === 'playing';
  const preparing = playbackStatus === 'preparing';
  const actionLabel = playing ? '暂停' : playbackStatus === 'finished' ? '再听一次' : preparing ? '正在准备' : '播放';
  const progress =
    audio.durationMs > 0 ? Math.min(1, Math.max(0, currentTimeMs / audio.durationMs)) : 0;

  return (
    <View style={styles.block}>
      {scene ? (
        <Text style={styles.sceneTitle} testID={`${testIDPrefix}-scene-${audio.id}`}>
          {audio.label}
        </Text>
      ) : null}
      <Text
        style={compact ? styles.compactMeta : styles.meta}
        accessibilityLabel={playbackLabel(playbackStatus, durationLabel, currentTimeMs)}
      >
        {playbackMeta(playbackStatus, durationLabel, currentTimeMs)}
      </Text>
      {scene ? (
        <View
          accessible={false}
          testID={`${testIDPrefix}-progress-${audio.id}`}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
      {onPlay || onPause ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}，${durationLabel}`}
          accessibilityState={{ disabled: preparing }}
          testID={`${testIDPrefix}-play-${audio.id}`}
          disabled={preparing}
          onPress={() => {
            if (preparing) return;
            if (playing) onPause?.();
            else onPlay?.();
          }}
          style={styles.hit}
        >
          <View style={styles.actionRow}>
            <Text accessible={false} style={styles.mark}>
              {playing ? '❚❚' : playbackStatus === 'finished' ? '↺' : preparing ? '·' : '▶'}
            </Text>
            <Text style={styles.action}>{actionLabel}</Text>
          </View>
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
  removeDisabled,
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
  removeDisabled?: boolean;
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

  if (audio) {
    return (
      <View style={styles.block}>
        {phase === 'failed' ? (
          <Text style={styles.missing}>这次没有录下声音。已经写的字和照片还在。</Text>
        ) : null}
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
            disabled={removeDisabled ?? disabled}
            style={styles.hit}
          >
            <Text style={styles.action}>移除这段声音</Text>
          </Pressable>
        </View>
      </View>
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
  hit: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  mark: { fontSize: 13, lineHeight: 18, color: sage, minWidth: 14 },
  action: { fontSize: 18, lineHeight: 24, color: sage },
  recording: { fontSize: 18, lineHeight: 24, color: sound },
  meta: { fontSize: 16, lineHeight: 24, color: sound },
  compactMeta: { fontSize: 14, lineHeight: 20, color: sound },
  sceneTitle: { fontSize: 18, lineHeight: 26, color: sound },
  track: {
    height: 1,
    width: '100%',
    backgroundColor: hairline,
    overflow: 'hidden',
  },
  fill: { height: 1, backgroundColor: sound },
  missing: { fontSize: 16, lineHeight: 24, color: inkSoft },
});
