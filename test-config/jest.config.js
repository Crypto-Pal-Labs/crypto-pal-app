module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/../src/__tests__/helpers/setupTests.ts'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^@tests/(.*)$': '<rootDir>/../src/__tests__/$1',
    '^@stories/(.*)$': '<rootDir>/../src/stories/$1',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@expo|expo|@react-navigation|@react-native-picker|@react-native-community|react-native-vector-icons|react-native-svg|react-native-qrcode-svg|react-native-webview|@transak)/)',
  ],
  testMatch: [
    '<rootDir>/../src/__tests__/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/../src/__tests__/**/*.spec.{js,jsx,ts,tsx}',
  ],
  collectCoverageFrom: [
    '../src/**/*.{js,jsx,ts,tsx}',
    '!../src/**/*.d.ts',
    '!../src/__tests__/**',
    '!../src/stories/**',
    '!../src/**/*.stories.{js,jsx,ts,tsx}',
  ],
  coverageDirectory: '../test-results/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  verbose: true,
  testTimeout: 10000,
  maxWorkers: '50%',
};