const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  ...expoPreset,
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/ios/', '<rootDir>/android/'],
  modulePaths: ['<rootDir>/node_modules'],
  transformIgnorePatterns: [
    ...(expoPreset.transformIgnorePatterns || []),
    '/domain/',
    '/projections/',
  ],
};
