const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  ...expoPreset,
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/ios/', '<rootDir>/android/'],
  modulePaths: ['<rootDir>/node_modules'],
  moduleNameMapper: {
    ...(expoPreset.moduleNameMapper || {}),
    '^@lampy/domain/(.*)$': '<rootDir>/../../domain/$1',
    '^@lampy/projections/(.*)$': '<rootDir>/../../projections/$1',
  },
  transformIgnorePatterns: [
    ...(expoPreset.transformIgnorePatterns || []),
    '<rootDir>/../../domain/',
    '<rootDir>/../../projections/',
  ],
};
