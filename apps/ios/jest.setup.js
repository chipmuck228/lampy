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
