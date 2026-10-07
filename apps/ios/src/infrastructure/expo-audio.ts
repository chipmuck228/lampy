/* eslint-disable @typescript-eslint/no-require-imports */
import type { AudioCapture, AudioPlayback, PlaybackStatus, RecordedAudio } from './media';

type NativeRecorder = {
  isRecording: boolean;
  currentTime: number;
  uri: string | null;
  prepareToRecordAsync(options?: object): Promise<void>;
  record(): void;
  stop(): Promise<void>;
  release?: () => void;
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
  setAudioModeAsync: (mode: AudioSessionMode) => Promise<void>;
};

type AudioSessionMode = {
  allowsRecording: boolean;
  playsInSilentMode: boolean;
  interruptionMode: 'doNotMix';
  shouldPlayInBackground: boolean;
  allowsBackgroundRecording: boolean;
  shouldRouteThroughEarpiece: boolean;
};

const PLAYBACK_AUDIO_MODE: AudioSessionMode = {
  allowsRecording: false,
  playsInSilentMode: true,
  interruptionMode: 'doNotMix',
  shouldPlayInBackground: false,
  allowsBackgroundRecording: false,
  shouldRouteThroughEarpiece: false,
};

const RECORDING_AUDIO_MODE: AudioSessionMode = {
  ...PLAYBACK_AUDIO_MODE,
  allowsRecording: true,
};

async function applyAudioMode(native: ExpoAudioModule, mode: AudioSessionMode): Promise<void> {
  await native.setAudioModeAsync(mode);
}

async function restorePlaybackAudioMode(native: ExpoAudioModule): Promise<void> {
  try {
    await applyAudioMode(native, PLAYBACK_AUDIO_MODE);
  } catch {
    // Playback will apply the session again before play().
  }
}

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

function disposeNativeRecorder(recorder: NativeRecorder | null) {
  if (!recorder) return;
  try {
    recorder.release?.();
  } catch {
    // Recorder is already gone.
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
    async seekTo() {
      throw new Error("Cannot find native module 'ExpoAudio'");
    },
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

  function harvest(current: NativeRecorder, elapsedMs: number): RecordedAudio | null {
    const status = current.getStatus();
    const durationMs = Math.max(
      0,
      status.durationMillis || secondsToMs(current.currentTime) || elapsedMs,
    );
    const uri = current.uri;
    if (!uri || durationMs <= 0) return null;
    return {
      sourceUri: uri,
      durationMs,
      mimeType: 'audio/mp4',
    };
  }

  async function releaseRecorder(current: NativeRecorder | null) {
    recorder = null;
    disposeNativeRecorder(current);
    await restorePlaybackAudioMode(native);
  }

  async function finish(): Promise<RecordedAudio> {
    if (!recorder) {
      throw new Error('not recording');
    }
    const current = recorder;
    const elapsedMs = startedAt ? Date.now() - startedAt : 0;
    try {
      if (current.isRecording) {
        await current.stop();
      }
      const recorded = harvest(current, elapsedMs);
      if (!recorded) {
        throw new Error(current.uri ? 'recording is empty' : 'recording has no file');
      }
      return recorded;
    } finally {
      await releaseRecorder(current);
    }
  }

  return {
    async requestPermission() {
      const result = await native.requestRecordingPermissionsAsync();
      return result.granted ? 'granted' : 'denied';
    },
    async start(canStart) {
      if (canStart && !canStart()) throw new Error('recording cancelled');
      if (recorder?.isRecording) {
        throw new Error('already recording');
      }
      if (recorder) {
        await releaseRecorder(recorder);
      }
      await applyAudioMode(native, RECORDING_AUDIO_MODE);
      try {
        const next = new Recorder(RECORDING_OPTIONS);
        try {
          await next.prepareToRecordAsync(RECORDING_OPTIONS);
          if (canStart && !canStart()) throw new Error('recording cancelled');
          next.record();
          recorder = next;
          startedAt = Date.now();
        } catch (error) {
          disposeNativeRecorder(next);
          throw error;
        }
      } catch (error) {
        await restorePlaybackAudioMode(native);
        throw error;
      }
    },
    stop: finish,
    async interrupt() {
      if (!recorder) return null;
      const current = recorder;
      const elapsedMs = startedAt ? Date.now() - startedAt : 0;
      try {
        if (current.isRecording) {
          const recorded = await finish();
          return recorded.durationMs > 0 ? recorded : null;
        }
        const recorded = harvest(current, elapsedMs);
        await releaseRecorder(current);
        return recorded;
      } catch {
        await releaseRecorder(current);
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
  let startEpoch = 0;

  function resetSession() {
    finished = false;
    failed = false;
    startRequested = false;
    heardPlaying = false;
    lastHeardTimeMs = 0;
    startEpoch += 1;
  }

  function invalidateStart() {
    startEpoch += 1;
    startRequested = false;
    heardPlaying = false;
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
      const mine = ++startEpoch;
      try {
        await applyAudioMode(audio, PLAYBACK_AUDIO_MODE);
        if (mine !== startEpoch) return;
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
        if (mine !== startEpoch) return;
        startRequested = true;
        heardPlaying = false;
        player.play();
      } catch {
        if (mine !== startEpoch) return;
        failed = true;
        startRequested = false;
        heardPlaying = false;
        lastHeardTimeMs = 0;
        throw new Error('play failed');
      }
    },
    async seekTo(positionMs: number) {
      if (!player) throw new Error('no source');
      await player.seekTo(Math.max(0, positionMs) / 1000);
      lastHeardTimeMs = positionMs;
      finished = false;
    },
    async pause() {
      invalidateStart();
      player?.pause();
    },
    async stop() {
      invalidateStart();
      lastHeardTimeMs = 0;
      finished = false;
      if (!player) return;
      player.pause();
      await player.seekTo(0);
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
