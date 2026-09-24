export type PickedImage = {
  sourceUri: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileName?: string;
};

export type RecordedAudio = {
  sourceUri: string;
  durationMs: number;
  mimeType?: string;
};

export type MediaPermission = 'granted' | 'denied';

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'finished' | 'unavailable';

export interface ImageSource {
  requestPermission(): Promise<MediaPermission>;
  pick(remaining: number): Promise<PickedImage[]>;
}

export interface MediaStore {
  persistImage(input: {
    assetId: string;
    sourceUri: string;
    mimeType?: string;
  }): Promise<{ localUri: string; sizeBytes?: number }>;
  persistAudio(input: {
    assetId: string;
    sourceUri: string;
    mimeType?: string;
  }): Promise<{ localUri: string; sizeBytes?: number }>;
  exists(localUri: string): Promise<boolean>;
  canDecode(localUri: string): Promise<boolean>;
  canPlay(localUri: string): Promise<boolean>;
  removeAppOwned(localUri: string): Promise<boolean>;
}

export interface AudioCapture {
  requestPermission(): Promise<MediaPermission>;
  start(): Promise<void>;
  stop(): Promise<RecordedAudio>;
  interrupt(): Promise<RecordedAudio | null>;
  isRecording(): boolean;
  getElapsedMs(): number;
}

export interface AudioPlayback {
  load(uri: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  release(): Promise<void>;
  getStatus(): { status: PlaybackStatus; currentTimeMs: number; durationMs: number };
}

export function extensionForMime(mimeType?: string, fileName?: string): string {
  const fromName = fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (fromName === 'png' || fromName === 'jpg' || fromName === 'jpeg' || fromName === 'heic' || fromName === 'webp') {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'heic';
  return 'jpg';
}

export function extensionForAudioMime(mimeType?: string, fileName?: string): string {
  const fromName = fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (fromName === 'm4a' || fromName === 'aac' || fromName === 'caf' || fromName === 'wav' || fromName === 'mp3') {
    return fromName;
  }
  if (mimeType === 'audio/aac') return 'aac';
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return 'wav';
  if (mimeType === 'audio/mpeg') return 'mp3';
  if (mimeType === 'audio/x-caf') return 'caf';
  return 'm4a';
}

export function createMemoryMediaStore(): MediaStore & {
  markMissing(localUri: string): void;
  markUndecodable(localUri: string): void;
  markUnplayable(localUri: string): void;
  persisted: Map<string, { sourceUri: string; exists: boolean; decodable: boolean; playable: boolean }>;
  removed: string[];
} {
  const persisted = new Map<
    string,
    { sourceUri: string; exists: boolean; decodable: boolean; playable: boolean }
  >();
  const removed: string[] = [];

  async function persist(
    dest: string,
    sourceUri: string,
  ): Promise<{ localUri: string; sizeBytes?: number }> {
    const existing = persisted.get(dest);
    if (existing) return { localUri: dest };
    persisted.set(dest, { sourceUri, exists: true, decodable: true, playable: true });
    return { localUri: dest };
  }

  return {
    persisted,
    removed,
    async persistImage({ assetId, sourceUri, mimeType }) {
      return persist(`memory://assets/${assetId}.${extensionForMime(mimeType)}`, sourceUri);
    },
    async persistAudio({ assetId, sourceUri, mimeType }) {
      return persist(`memory://assets/${assetId}.${extensionForAudioMime(mimeType)}`, sourceUri);
    },
    async exists(localUri) {
      return persisted.get(localUri)?.exists === true;
    },
    async canDecode(localUri) {
      const file = persisted.get(localUri);
      return !!file && file.exists && file.decodable;
    },
    async canPlay(localUri) {
      const file = persisted.get(localUri);
      return !!file && file.exists && file.playable;
    },
    async removeAppOwned(localUri) {
      if (!localUri.startsWith('memory://assets/')) return false;
      const file = persisted.get(localUri);
      if (!file) return false;
      persisted.delete(localUri);
      removed.push(localUri);
      return true;
    },
    markMissing(localUri) {
      const file = persisted.get(localUri);
      if (file) persisted.set(localUri, { ...file, exists: false, decodable: false, playable: false });
    },
    markUndecodable(localUri) {
      const file = persisted.get(localUri);
      if (file) persisted.set(localUri, { ...file, decodable: false });
    },
    markUnplayable(localUri) {
      const file = persisted.get(localUri);
      if (file) persisted.set(localUri, { ...file, playable: false });
    },
  };
}

export function createQueuedImageSource(options?: {
  permission?: MediaPermission;
  picks?: PickedImage[][];
}): ImageSource & {
  permission: MediaPermission;
  requests: number;
  picks: PickedImage[][];
} {
  const source = {
    permission: options?.permission ?? 'granted',
    requests: 0,
    picks: options?.picks ? options.picks.map((batch) => batch.slice()) : [],
    async requestPermission() {
      source.requests += 1;
      return source.permission;
    },
    async pick(remaining: number) {
      const next = source.picks.shift() ?? [];
      return next.slice(0, Math.max(0, remaining));
    },
  };
  return source;
}

export function createMemoryAudioCapture(options?: {
  permission?: MediaPermission;
  clips?: RecordedAudio[];
  interruptClip?: RecordedAudio | null;
}): AudioCapture & {
  permission: MediaPermission;
  requests: number;
  starts: number;
  stops: number;
  interrupts: number;
  recording: boolean;
} {
  const capture = {
    permission: options?.permission ?? 'granted',
    requests: 0,
    starts: 0,
    stops: 0,
    interrupts: 0,
    recording: false,
    clips: options?.clips ? options.clips.slice() : [],
    interruptClip: options?.interruptClip,
    async requestPermission() {
      capture.requests += 1;
      return capture.permission;
    },
    async start() {
      if (capture.permission !== 'granted') {
        throw new Error('microphone denied');
      }
      capture.starts += 1;
      capture.recording = true;
    },
    async stop() {
      if (!capture.recording) {
        throw new Error('not recording');
      }
      capture.recording = false;
      capture.stops += 1;
      return (
        capture.clips.shift() ?? {
          sourceUri: `memory://recordings/clip_${capture.stops}.m4a`,
          durationMs: 3500,
          mimeType: 'audio/mp4',
        }
      );
    },
    async interrupt() {
      capture.interrupts += 1;
      if (!capture.recording) return null;
      capture.recording = false;
      if (capture.interruptClip === null) return null;
      return (
        capture.interruptClip ?? {
          sourceUri: `memory://recordings/interrupt_${capture.interrupts}.m4a`,
          durationMs: 1200,
          mimeType: 'audio/mp4',
        }
      );
    },
    isRecording() {
      return capture.recording;
    },
    getElapsedMs() {
      return capture.recording ? 1500 : 0;
    },
  };
  return capture;
}

export function createMemoryAudioPlayback(): AudioPlayback & {
  loadedUri: string | null;
  failNextPlay: boolean;
  plays: number;
} {
  const playback = {
    loadedUri: null as string | null,
    failNextPlay: false,
    plays: 0,
    status: 'idle' as PlaybackStatus,
    currentTimeMs: 0,
    durationMs: 0,
    async load(uri: string) {
      playback.loadedUri = uri;
      playback.status = 'idle';
      playback.currentTimeMs = 0;
      playback.durationMs = 3500;
    },
    async play() {
      if (playback.failNextPlay) {
        playback.failNextPlay = false;
        playback.status = 'unavailable';
        throw new Error('play failed');
      }
      if (!playback.loadedUri) throw new Error('no source');
      playback.plays += 1;
      playback.status = 'playing';
    },
    async pause() {
      if (playback.status === 'playing') playback.status = 'paused';
    },
    async stop() {
      playback.status = playback.loadedUri ? 'finished' : 'idle';
      playback.currentTimeMs = playback.durationMs;
    },
    async release() {
      playback.loadedUri = null;
      playback.status = 'idle';
      playback.currentTimeMs = 0;
    },
    getStatus() {
      return {
        status: playback.status,
        currentTimeMs: playback.currentTimeMs,
        durationMs: playback.durationMs,
      };
    },
  };
  return playback;
}
