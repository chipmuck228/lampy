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
    seekTo: jest.fn(async () => undefined),
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
});
