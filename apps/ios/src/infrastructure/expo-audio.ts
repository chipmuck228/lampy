/* eslint-disable @typescript-eslint/no-require-imports */
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

type ExpoAudioModule = {
  AudioModule?: { AudioRecorder: new (options: object) => NativeRecorder };
  RecordingPresets?: { HIGH_QUALITY: object };
  createAudioPlayer: (
    source: { uri: string },
    options?: { updateInterval?: number },
  ) => {
    play(): void;
    pause(): void;
    seekTo(position: number): Promise<void>;
    release?: () => void;
    remove?: () => void;
    currentStatus: {
      playing: boolean;
      currentTime: number;
      duration: number;
      didJustFinish: boolean;
    };
  };
  requestRecordingPermissionsAsync: () => Promise<{ granted: boolean }>;
  setAudioModeAsync: (mode: object) => Promise<void>;
};

let loaded: ExpoAudioModule | null | undefined;

function hasNativeAudio(): boolean {
  try {
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => unknown;
    };
    return !!core.requireOptionalNativeModule?.('ExpoAudio');
  } catch {
    return false;
  }
}

export function loadExpoAudio(): ExpoAudioModule | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeAudio()) {
    loaded = null;
    return null;
  }
  try {
    loaded = require('expo-audio') as ExpoAudioModule;
    if (!loaded?.AudioModule?.AudioRecorder || !loaded.createAudioPlayer) {
      loaded = null;
    }
    return loaded;
  } catch {
    loaded = null;
    return null;
  }
}

export function resetExpoAudioForTests() {
  loaded = undefined;
}

const END_SLOP_MS = 250;

function secondsToMs(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) < 0) return 0;
  return Math.round((value as number) * 1000);
}

function hasReachedEnd(currentTimeMs: number, lastHeardTimeMs: number, durationMs: number): boolean {
  if (durationMs <= 0) return false;
  return Math.max(currentTimeMs, lastHeardTimeMs) + END_SLOP_MS >= durationMs;
}

function positionsDiverge(currentTimeMs: number, lastHeardTimeMs: number): boolean {
  return Math.abs(currentTimeMs - lastHeardTimeMs) > END_SLOP_MS;
}

function disposeNativePlayer(player: ReturnType<ExpoAudioModule['createAudioPlayer']> | null) {
  if (!player) return;
  try {
    player.pause();
  } catch {
    // Player may already be gone.
  }
  try {
    player.release?.();
  } catch {
    // Fall through to remove().
  }
  try {
    player.remove?.();
  } catch {
    // Already released.
  }
}

function createUnavailableCapture(): AudioCapture {
  return {
    async requestPermission() {
      return 'denied';
    },
    async start() {
      throw new Error("Cannot find native module 'ExpoAudio'");
    },
    async stop() {
      throw new Error("Cannot find native module 'ExpoAudio'");
    },
    async interrupt() {
      return null;
    },
    isRecording() {
      return false;
    },
    getElapsedMs() {
      return 0;
    },
  };
}

function createUnavailablePlayback(): AudioPlayback {
  return {
    async load() {},
    async play() {
      throw new Error("Cannot find native module 'ExpoAudio'");
    },
    async pause() {},
    async stop() {},
    async release() {},
    getStatus() {
      return { status: 'unavailable' as PlaybackStatus, currentTimeMs: 0, durationMs: 0 };
    },
  };
}

export function createExpoAudioCapture(): AudioCapture {
  const loadedNative = loadExpoAudio();
  const Recorder = loadedNative?.AudioModule?.AudioRecorder;
  if (!loadedNative || !Recorder) return createUnavailableCapture();
  const native: ExpoAudioModule = loadedNative;
  const RECORDING_OPTIONS = {
    ...native.RecordingPresets?.HIGH_QUALITY,
    directory: 'document' as const,
  };

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
    await native.setAudioModeAsync({
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
      const result = await native.requestRecordingPermissionsAsync();
      return result.granted ? 'granted' : 'denied';
    },
    async start() {
      if (recorder?.isRecording) {
        throw new Error('already recording');
      }
      await native.setAudioModeAsync({
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
  const loadedNative = loadExpoAudio();
  if (!loadedNative) return createUnavailablePlayback();
  const audio: ExpoAudioModule = loadedNative;

  let player: ReturnType<ExpoAudioModule['createAudioPlayer']> | null = null;
  let loadedUri: string | null = null;
  let finished = false;
  let failed = false;
  let startRequested = false;
  let heardPlaying = false;
  let lastHeardTimeMs = 0;

  function resetSession() {
    finished = false;
    failed = false;
    startRequested = false;
    heardPlaying = false;
    lastHeardTimeMs = 0;
  }

  return {
    async load(uri) {
      if (player && loadedUri === uri && !failed) return;
      disposeNativePlayer(player);
      resetSession();
      loadedUri = uri;
      player = audio.createAudioPlayer({ uri }, { updateInterval: 250 });
    },
    async play() {
      if (!player) throw new Error('no source');
      try {
        const status = player.currentStatus;
        const currentTimeMs = secondsToMs(status.currentTime);
        if (finished || status.didJustFinish) {
          await player.seekTo(0);
          finished = false;
          heardPlaying = false;
          lastHeardTimeMs = 0;
        } else if (lastHeardTimeMs > 0 && positionsDiverge(currentTimeMs, lastHeardTimeMs)) {
          await player.seekTo(lastHeardTimeMs / 1000);
        }
        startRequested = true;
        player.play();
      } catch {
        failed = true;
        startRequested = false;
        heardPlaying = false;
        lastHeardTimeMs = 0;
        throw new Error('play failed');
      }
    },
    async pause() {
      startRequested = false;
      player?.pause();
    },
    async stop() {
      startRequested = false;
      heardPlaying = false;
      lastHeardTimeMs = 0;
      if (!player) return;
      player.pause();
      await player.seekTo(0);
      finished = true;
    },
    async release() {
      disposeNativePlayer(player);
      player = null;
      loadedUri = null;
      resetSession();
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
        startRequested = false;
        heardPlaying = false;
        return { status: 'finished', currentTimeMs: durationMs || currentTimeMs || lastHeardTimeMs, durationMs };
      }
      if (status.playing) {
        heardPlaying = true;
        lastHeardTimeMs = currentTimeMs;
        return { status: 'playing', currentTimeMs, durationMs };
      }
      if (startRequested && heardPlaying) {
        startRequested = false;
        heardPlaying = false;
        if (hasReachedEnd(currentTimeMs, lastHeardTimeMs, durationMs)) {
          finished = true;
          return { status: 'finished', currentTimeMs: durationMs || currentTimeMs || lastHeardTimeMs, durationMs };
        }
        const pausedAt = currentTimeMs > 0 ? currentTimeMs : lastHeardTimeMs;
        if (pausedAt > 0) {
          return { status: 'paused', currentTimeMs: pausedAt, durationMs };
        }
        failed = true;
        return { status: 'unavailable', currentTimeMs: 0, durationMs };
      }
      if (startRequested) {
        return { status: 'preparing', currentTimeMs, durationMs };
      }
      if (currentTimeMs > 0) {
        return { status: 'paused', currentTimeMs, durationMs };
      }
      if (lastHeardTimeMs > 0) {
        return { status: 'paused', currentTimeMs: lastHeardTimeMs, durationMs };
      }
      return { status: 'idle', currentTimeMs, durationMs };
    },
  };
}
