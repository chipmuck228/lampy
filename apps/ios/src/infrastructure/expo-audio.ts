import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

import type { AudioCapture, AudioPlayback, PlaybackStatus, RecordedAudio } from './media';

type NativeRecorder = {
  isRecording: boolean;
  currentTime: number;
  uri: string | null;
  prepareToRecordAsync(options?: object): Promise<void>;
  record(): void;
  stop(): Promise<void>;
  getStatus(): { durationMillis: number; isRecording: boolean };
};

const Recorder = (AudioModule as { AudioRecorder: new (options: object) => NativeRecorder })
  .AudioRecorder;

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: 'document' as const,
};

function secondsToMs(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) < 0) return 0;
  return Math.round((value as number) * 1000);
}

export function createExpoAudioCapture(): AudioCapture {
  let recorder: NativeRecorder | null = null;
  let startedAt = 0;

  async function finish(): Promise<RecordedAudio> {
    if (!recorder) {
      throw new Error('not recording');
    }
    const current = recorder;
    const elapsedMs = startedAt ? Date.now() - startedAt : 0;
    await current.stop();
    const status = current.getStatus();
    const durationMs = Math.max(
      0,
      status.durationMillis || secondsToMs(current.currentTime) || elapsedMs,
    );
    const uri = current.uri;
    recorder = null;
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: false,
      allowsBackgroundRecording: false,
    });
    if (!uri) {
      throw new Error('recording has no file');
    }
    return {
      sourceUri: uri,
      durationMs,
      mimeType: 'audio/mp4',
    };
  }

  return {
    async requestPermission() {
      const result = await requestRecordingPermissionsAsync();
      return result.granted ? 'granted' : 'denied';
    },
    async start() {
      if (recorder?.isRecording) {
        throw new Error('already recording');
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
      });
      const next = new Recorder(RECORDING_OPTIONS);
      await next.prepareToRecordAsync(RECORDING_OPTIONS);
      next.record();
      recorder = next;
      startedAt = Date.now();
    },
    stop: finish,
    async interrupt() {
      if (!recorder?.isRecording) return null;
      try {
        const recorded = await finish();
        return recorded.durationMs > 0 ? recorded : null;
      } catch {
        recorder = null;
        return null;
      }
    },
    isRecording() {
      return !!recorder?.isRecording;
    },
    getElapsedMs() {
      if (!recorder) return 0;
      const status = recorder.getStatus();
      return Math.max(0, status.durationMillis || secondsToMs(recorder.currentTime));
    },
  };
}

export function createExpoAudioPlayback(): AudioPlayback {
  let player: ReturnType<typeof createAudioPlayer> | null = null;
  let finished = false;
  let failed = false;

  return {
    async load(uri) {
      player?.release();
      finished = false;
      failed = false;
      player = createAudioPlayer({ uri }, { updateInterval: 250 });
    },
    async play() {
      if (!player) throw new Error('no source');
      try {
        const status = player.currentStatus;
        if (finished || status.didJustFinish) {
          await player.seekTo(0);
          finished = false;
        }
        player.play();
      } catch {
        failed = true;
        throw new Error('play failed');
      }
    },
    async pause() {
      player?.pause();
    },
    async stop() {
      if (!player) return;
      player.pause();
      await player.seekTo(0);
      finished = true;
    },
    async release() {
      player?.release();
      player = null;
      finished = false;
      failed = false;
    },
    getStatus() {
      if (failed) {
        return { status: 'unavailable' as PlaybackStatus, currentTimeMs: 0, durationMs: 0 };
      }
      if (!player) {
        return { status: 'idle' as PlaybackStatus, currentTimeMs: 0, durationMs: 0 };
      }
      const status = player.currentStatus;
      const currentTimeMs = secondsToMs(status.currentTime);
      const durationMs = secondsToMs(status.duration);
      if (finished || status.didJustFinish) {
        finished = true;
        return { status: 'finished', currentTimeMs: durationMs, durationMs };
      }
      if (status.playing) {
        return { status: 'playing', currentTimeMs, durationMs };
      }
      if (currentTimeMs > 0) {
        return { status: 'paused', currentTimeMs, durationMs };
      }
      return { status: 'idle', currentTimeMs, durationMs };
    },
  };
}
