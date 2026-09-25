jest.mock('expo-secure-store', () => {
  const memory = new Map();
  return {
    getItemAsync: async (key) => memory.get(key) ?? null,
    setItemAsync: async (key, value) => {
      memory.set(key, value);
    },
    deleteItemAsync: async (key) => {
      memory.delete(key);
    },
  };
});

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: async () => false,
  signInAsync: async () => ({ identityToken: null }),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('expo-audio', () => ({
  AudioModule: {
    AudioRecorder: class AudioRecorder {
      isRecording = false;
      currentTime = 0;
      uri = null;
      async prepareToRecordAsync() {
        return undefined;
      }
      record() {
        this.isRecording = true;
      }
      async stop() {
        this.isRecording = false;
        this.uri = 'file:///docs/recording.m4a';
      }
      getStatus() {
        return { durationMillis: 0, isRecording: this.isRecording };
      }
    },
  },
  RecordingPresets: { HIGH_QUALITY: {} },
  createAudioPlayer: () => ({
    play() {},
    pause() {},
    async seekTo() {},
    release() {},
    currentStatus: { playing: false, currentTime: 0, duration: 0, didJustFinish: false },
  }),
  requestRecordingPermissionsAsync: async () => ({ granted: false }),
  setAudioModeAsync: async () => undefined,
}));
