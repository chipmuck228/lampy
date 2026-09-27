describe('expo audio without the native module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => null,
    }));
    jest.doMock('expo-audio', () => {
      throw new Error("Cannot find native module 'ExpoAudio'");
    });
  });

  afterEach(() => {
    jest.dontMock('expo-modules-core');
    jest.dontMock('expo-audio');
    jest.resetModules();
  });

  it('lets the app start; recording and playback stay unavailable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createExpoAudioCapture, createExpoAudioPlayback, loadExpoAudio } = require('./expo-audio') as {
      createExpoAudioCapture: () => import('./media').AudioCapture;
      createExpoAudioPlayback: () => import('./media').AudioPlayback;
      loadExpoAudio: () => unknown;
    };

    expect(loadExpoAudio()).toBeNull();
    expect(() => createExpoAudioCapture()).not.toThrow();
    expect(() => createExpoAudioPlayback()).not.toThrow();

    const capture = createExpoAudioCapture();
    expect(await capture.requestPermission()).toBe('denied');
    expect(capture.isRecording()).toBe(false);
    await expect(capture.start()).rejects.toThrow("Cannot find native module 'ExpoAudio'");
    expect(await capture.interrupt()).toBeNull();

    const playback = createExpoAudioPlayback();
    expect(playback.getStatus()).toEqual({
      status: 'unavailable',
      currentTimeMs: 0,
      durationMs: 0,
    });
    await expect(playback.play()).rejects.toThrow("Cannot find native module 'ExpoAudio'");
  });
});

describe('expo audio playback with a delayed native player', () => {
  const native = {
    playing: false,
    currentTime: 0,
    duration: 3.5,
    didJustFinish: false,
  };
  const player = {
    play: jest.fn(() => undefined),
    pause: jest.fn(() => undefined),
    seekTo: jest.fn(async (seconds: number) => {
      native.currentTime = seconds;
    }),
    release: jest.fn(() => undefined),
    get currentStatus() {
      return { ...native };
    },
  };
  const createAudioPlayer = jest.fn(() => player);

  beforeEach(() => {
    native.playing = false;
    native.currentTime = 0;
    native.duration = 3.5;
    native.didJustFinish = false;
    player.play.mockClear();
    player.pause.mockClear();
    player.seekTo.mockClear();
    player.release.mockClear();
    createAudioPlayer.mockClear();
    jest.resetModules();
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => ({}),
    }));
    jest.doMock('expo-audio', () => ({
      AudioModule: { AudioRecorder: class AudioRecorder {} },
      RecordingPresets: { HIGH_QUALITY: {} },
      createAudioPlayer,
      requestRecordingPermissionsAsync: async () => ({ granted: false }),
      setAudioModeAsync: async () => undefined,
    }));
  });

  afterEach(() => {
    jest.dontMock('expo-modules-core');
    jest.dontMock('expo-audio');
    jest.resetModules();
  });

  function loadPlayback() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createExpoAudioPlayback, resetExpoAudioForTests } = require('./expo-audio') as {
      createExpoAudioPlayback: () => import('./media').AudioPlayback;
      resetExpoAudioForTests: () => void;
    };
    resetExpoAudioForTests();
    return createExpoAudioPlayback();
  }

  it('stays preparing when native play() returns while still idle', async () => {
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(playback.getStatus()).toEqual({
      status: 'preparing',
      currentTimeMs: 0,
      durationMs: 3500,
    });

    native.playing = true;
    native.currentTime = 0.4;
    expect(playback.getStatus()).toEqual({
      status: 'playing',
      currentTimeMs: 400,
      durationMs: 3500,
    });
  });

  it('resumes from the same source without creating another player', async () => {
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 1.2;
    await playback.pause();
    native.playing = false;

    expect(playback.getStatus().status).toBe('paused');
    expect(playback.getStatus().currentTimeMs).toBe(1200);

    await playback.load('file://leave.m4a');
    await playback.play();

    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(player.release).not.toHaveBeenCalled();
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(playback.getStatus().currentTimeMs).toBe(1200);
  });

  it('resets to idle when stopped, so a later clip is not shown as finished', async () => {
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 2;
    expect(playback.getStatus().status).toBe('playing');

    await playback.stop();
    native.playing = false;
    native.currentTime = 0;
    expect(playback.getStatus()).toEqual({
      status: 'idle',
      currentTimeMs: 0,
      durationMs: 3500,
    });
    expect(playback.getStatus().status).not.toBe('finished');
  });

  it('stays preparing after a user pause until native playing is heard again', async () => {
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 2;
    expect(playback.getStatus().status).toBe('playing');

    await playback.pause();
    native.playing = false;
    expect(playback.getStatus()).toEqual({
      status: 'paused',
      currentTimeMs: 2000,
      durationMs: 3500,
    });

    await playback.play();
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(playback.getStatus()).toEqual({
      status: 'preparing',
      currentTimeMs: 2000,
      durationMs: 3500,
    });
    expect(playback.getStatus().status).not.toBe('paused');

    native.playing = true;
    native.currentTime = 2.3;
    expect(playback.getStatus()).toEqual({
      status: 'playing',
      currentTimeMs: 2300,
      durationMs: 3500,
    });
  });

  it('treats a natural end as finished even if native never sets didJustFinish', async () => {
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 3.4;
    expect(playback.getStatus().status).toBe('playing');

    native.playing = false;
    native.didJustFinish = false;
    native.currentTime = 0;
    expect(playback.getStatus()).toEqual({
      status: 'finished',
      currentTimeMs: 3500,
      durationMs: 3500,
    });
    expect(playback.getStatus().status).toBe('finished');
  });

  it('does not report finished when native stops at 1s without didJustFinish', async () => {
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 1;
    expect(playback.getStatus()).toEqual({
      status: 'playing',
      currentTimeMs: 1000,
      durationMs: 3500,
    });

    native.playing = false;
    native.didJustFinish = false;
    native.currentTime = 1;
    expect(playback.getStatus()).toEqual({
      status: 'paused',
      currentTimeMs: 1000,
      durationMs: 3500,
    });
    expect(playback.getStatus().status).not.toBe('finished');

    await playback.play();
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(playback.getStatus().currentTimeMs).toBe(1000);
  });

  it('keeps the same resumable status when native stops at 1s and the playhead resets to 0', async () => {
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 1;
    expect(playback.getStatus().status).toBe('playing');

    native.playing = false;
    native.didJustFinish = false;
    native.currentTime = 0;
    const first = playback.getStatus();
    const second = playback.getStatus();

    expect(first).toEqual({
      status: 'paused',
      currentTimeMs: 1000,
      durationMs: 3500,
    });
    expect(second).toEqual(first);
    expect(second.status).not.toBe('idle');
    expect(second.status).not.toBe('finished');
  });

  it('resumes from about 1s after the native playhead resets to 0', async () => {
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 1;
    expect(playback.getStatus().status).toBe('playing');

    native.playing = false;
    native.didJustFinish = false;
    native.currentTime = 0;
    expect(playback.getStatus()).toEqual({
      status: 'paused',
      currentTimeMs: 1000,
      durationMs: 3500,
    });

    await playback.play();
    expect(player.seekTo).toHaveBeenCalledWith(1);
    expect(native.currentTime).toBe(1);
    native.playing = true;
    expect(playback.getStatus()).toEqual({
      status: 'playing',
      currentTimeMs: 1000,
      durationMs: 3500,
    });
  });

  it('shows a retryable failure when the 1s position cannot be restored', async () => {
    player.seekTo.mockRejectedValueOnce(new Error('seek failed'));
    const playback = loadPlayback();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 1;
    expect(playback.getStatus().status).toBe('playing');

    native.playing = false;
    native.didJustFinish = false;
    native.currentTime = 0;
    expect(playback.getStatus().status).toBe('paused');
    expect(playback.getStatus().currentTimeMs).toBe(1000);

    await expect(playback.play()).rejects.toThrow('play failed');
    expect(playback.getStatus()).toEqual({
      status: 'unavailable',
      currentTimeMs: 0,
      durationMs: 0,
    });
    expect(playback.getStatus().status).not.toBe('paused');
  });
});

describe('expo audio session routing', () => {
  const native = {
    playing: false,
    currentTime: 0,
    duration: 3.5,
    didJustFinish: false,
  };
  const player = {
    play: jest.fn(() => undefined),
    pause: jest.fn(() => undefined),
    seekTo: jest.fn(async (seconds: number) => {
      native.currentTime = seconds;
    }),
    release: jest.fn(() => undefined),
    get currentStatus() {
      return { ...native };
    },
  };
  const createAudioPlayer = jest.fn(() => player);
  const setAudioModeAsync = jest.fn(async (_mode: { allowsRecording: boolean }) => undefined);
  const sessionOrder: string[] = [];
  const createdRecorders: AudioRecorder[] = [];
  let failPrepare = false;
  let failStop = false;
  let failMode: 'none' | 'next' | 'playback-only' = 'none';

  class AudioRecorder {
    isRecording = false;
    currentTime = 1.5;
    uri: string | null = null;
    release = jest.fn();
    constructor() {
      createdRecorders.push(this);
    }
    async prepareToRecordAsync() {
      if (failPrepare) throw new Error('prepare failed');
    }
    record() {
      this.isRecording = true;
      this.uri = 'file://leave.m4a';
    }
    async stop() {
      if (failStop) throw new Error('stop failed');
      this.isRecording = false;
    }
    getStatus() {
      return { durationMillis: 1500, isRecording: this.isRecording };
    }
  }

  beforeEach(() => {
    native.playing = false;
    native.currentTime = 0;
    native.duration = 3.5;
    native.didJustFinish = false;
    failPrepare = false;
    failStop = false;
    failMode = 'none';
    sessionOrder.length = 0;
    createdRecorders.length = 0;
    player.play.mockClear();
    player.pause.mockClear();
    player.seekTo.mockClear();
    player.release.mockClear();
    createAudioPlayer.mockClear();
    setAudioModeAsync.mockReset();
    setAudioModeAsync.mockImplementation(async (mode: { allowsRecording: boolean }) => {
      if (failMode === 'next') {
        failMode = 'none';
        throw new Error('mode failed');
      }
      if (failMode === 'playback-only' && !mode.allowsRecording) {
        throw new Error('playback mode failed');
      }
      sessionOrder.push(mode.allowsRecording ? 'record' : 'playback');
    });
    jest.resetModules();
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => ({}),
    }));
    jest.doMock('expo-audio', () => ({
      AudioModule: { AudioRecorder },
      RecordingPresets: { HIGH_QUALITY: {} },
      createAudioPlayer,
      requestRecordingPermissionsAsync: async () => ({ granted: true }),
      setAudioModeAsync,
    }));
  });

  afterEach(() => {
    jest.dontMock('expo-modules-core');
    jest.dontMock('expo-audio');
    jest.resetModules();
  });

  function loadAdapters() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createExpoAudioCapture, createExpoAudioPlayback, resetExpoAudioForTests } = require('./expo-audio') as {
      createExpoAudioCapture: () => import('./media').AudioCapture;
      createExpoAudioPlayback: () => import('./media').AudioPlayback;
      resetExpoAudioForTests: () => void;
    };
    resetExpoAudioForTests();
    return {
      capture: createExpoAudioCapture(),
      playback: createExpoAudioPlayback(),
    };
  }

  it('enables recording mode only while recording, then plays after the playback session is applied', async () => {
    const { capture, playback } = loadAdapters();
    await capture.start();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allowsRecording: true,
        shouldRouteThroughEarpiece: false,
      }),
    );
    expect(capture.isRecording()).toBe(true);

    const recorded = await capture.stop();
    expect(recorded.sourceUri).toBe('file://leave.m4a');
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      }),
    );
    expect(sessionOrder).toEqual(['record', 'playback']);

    await playback.load(recorded.sourceUri);
    await playback.play();
    expect(sessionOrder).toEqual(['record', 'playback', 'playback']);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(playback.getStatus().status).not.toBe('idle');
  });

  it('applies the playback session when re-entering detail without recording again', async () => {
    const { playback } = loadAdapters();
    await playback.load('file://leave.m4a');
    await playback.play();
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      }),
    );
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('restores the playback session after an interrupt, then can play', async () => {
    const { capture, playback } = loadAdapters();
    await capture.start();
    const recorded = await capture.interrupt();
    expect(recorded?.sourceUri).toBe('file://leave.m4a');
    expect(sessionOrder).toEqual(['record', 'playback']);

    await playback.load(recorded?.sourceUri ?? 'file://leave.m4a');
    await playback.play();
    expect(sessionOrder.at(-1)).toBe('playback');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('restores the playback session when interrupt cannot finish the file', async () => {
    failStop = true;
    const { capture, playback } = loadAdapters();
    await capture.start();
    expect(await capture.interrupt()).toBeNull();
    expect(sessionOrder[0]).toBe('record');
    expect(sessionOrder.slice(1).every((step) => step === 'playback')).toBe(true);
    expect(sessionOrder.length).toBeGreaterThanOrEqual(2);
    expect(capture.isRecording()).toBe(false);

    await playback.load('file://leave.m4a');
    await playback.play();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('does not ignite play when the playback session is applied after a background pause', async () => {
    let finishMode: (() => void) | undefined;
    setAudioModeAsync.mockImplementation(async (mode: { allowsRecording: boolean }) => {
      if (!mode.allowsRecording) {
        await new Promise<void>((resolve) => {
          finishMode = resolve;
        });
      }
      sessionOrder.push(mode.allowsRecording ? 'record' : 'playback');
    });
    const { playback } = loadAdapters();
    await playback.load('file://leave.m4a');
    const pending = playback.play();
    await playback.pause();
    finishMode?.();
    await pending;
    expect(player.play).not.toHaveBeenCalled();
    expect(playback.getStatus().status).not.toBe('playing');
    expect(playback.getStatus().status).not.toBe('preparing');
  });

  it('does not claim playback when the playback session cannot be applied', async () => {
    failMode = 'playback-only';
    const { playback } = loadAdapters();
    await playback.load('file://leave.m4a');
    await expect(playback.play()).rejects.toThrow('play failed');
    expect(player.play).not.toHaveBeenCalled();
    expect(playback.getStatus()).toEqual({
      status: 'unavailable',
      currentTimeMs: 0,
      durationMs: 0,
    });
    expect(playback.getStatus().status).not.toBe('playing');
    expect(playback.getStatus().status).not.toBe('preparing');
  });

  it('keeps pause, resume, finish, and release after a session switch', async () => {
    const { playback } = loadAdapters();
    await playback.load('file://leave.m4a');
    await playback.play();
    native.playing = true;
    native.currentTime = 1.2;
    await playback.pause();
    native.playing = false;
    expect(playback.getStatus()).toEqual({
      status: 'paused',
      currentTimeMs: 1200,
      durationMs: 3500,
    });

    await playback.play();
    native.playing = true;
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(playback.getStatus().currentTimeMs).toBe(1200);

    native.playing = false;
    native.didJustFinish = true;
    expect(playback.getStatus().status).toBe('finished');

    await playback.release();
    expect(player.release).toHaveBeenCalled();
    expect(playback.getStatus().status).toBe('idle');
  });

  it('releases an interrupted recorder so a second recording can play', async () => {
    const { capture, playback } = loadAdapters();
    await capture.start();
    expect(createdRecorders).toHaveLength(1);

    const first = await capture.interrupt();
    expect(first?.sourceUri).toBe('file://leave.m4a');
    expect(createdRecorders[0].release).toHaveBeenCalled();
    expect(capture.isRecording()).toBe(false);

    await capture.start();
    expect(createdRecorders).toHaveLength(2);
    const second = await capture.stop();
    expect(createdRecorders[1].release).toHaveBeenCalled();
    expect(sessionOrder.at(-1)).toBe('playback');

    await playback.load(second.sourceUri);
    await playback.play();
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(playback.getStatus().status).not.toBe('unavailable');
  });

  it('harvests a leftover file after the system already stopped the recorder, then can record and play again', async () => {
    const { capture, playback } = loadAdapters();
    await capture.start();
    createdRecorders[0].isRecording = false;

    const leftover = await capture.interrupt();
    expect(leftover?.sourceUri).toBe('file://leave.m4a');
    expect(leftover?.durationMs).toBe(1500);
    expect(createdRecorders[0].release).toHaveBeenCalled();
    expect(sessionOrder.at(-1)).toBe('playback');

    await capture.start();
    const second = await capture.stop();
    await playback.load(second.sourceUri);
    await playback.play();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('leaves recording mode if prepare fails', async () => {
    failPrepare = true;
    const { capture } = loadAdapters();
    await expect(capture.start()).rejects.toThrow('prepare failed');
    expect(sessionOrder).toEqual(['record', 'playback']);
    expect(capture.isRecording()).toBe(false);
  });
});
