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
