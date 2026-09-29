const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  ...expoPreset,
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: [...(expoPreset.setupFilesAfterEnv || []), '<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/ios/', '<rootDir>/android/'],
  modulePaths: ['<rootDir>/node_modules'],
  moduleNameMapper: {
    ...(expoPreset.moduleNameMapper || {}),
    '^@lampy/domain/(.*)$': '<rootDir>/../../domain/$1',
    '^@lampy/projections/(.*)$': '<rootDir>/../../projections/$1',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@noble))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
    '<rootDir>/../../domain/',
    '<rootDir>/../../projections/',
  ],
};
