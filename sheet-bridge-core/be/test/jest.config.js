/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..', // Set root to parent directory (be/)
  roots: ['<rootDir>/test'],
  testMatch: ['**/test/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  testTimeout: 120000, // 2 minutes for e2e tests
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Suppress stack traces for console.log calls
  silent: false,
  // Custom console implementation to suppress stack traces
  setupFiles: ['<rootDir>/test/jest-console-setup.js'],
};
