const shared = require('./jest.config');
const android = require('jest-expo/android/jest-preset');
module.exports = {
  ...shared,
  ...android,
  modulePaths: shared.modulePaths,
  moduleNameMapper: shared.moduleNameMapper,
  transformIgnorePatterns: shared.transformIgnorePatterns,
  setupFilesAfterEnv: shared.setupFilesAfterEnv,
  testPathIgnorePatterns: shared.testPathIgnorePatterns,
  testMatch: [
    '**/application/android-personal.test.ts',
    '**/screens/android-personal-navigation.test.tsx',
    '**/application/use-cases.test.ts',
    '**/application/audio-use-cases.test.ts',
    '**/application/image-use-cases.test.ts',
    '**/application/recovery-use-cases.test.ts',
    '**/application/draft-abandon-use-cases.test.ts',
    '**/infrastructure/expo-media.test.ts',
    '**/infrastructure/expo-audio.test.ts',
    '**/infrastructure/sqlite-preservation.test.ts',
    '**/screens/leave-draft-screen.test.tsx',
    '**/screens/leave-audio-screen.test.tsx',
    '**/screens/leave-image-screen.test.tsx',
  ],
};
