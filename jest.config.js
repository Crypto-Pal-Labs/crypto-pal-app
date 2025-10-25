module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/src/__tests__/**/*.spec.{js,jsx,ts,tsx}',
  ],
  verbose: true,
  testTimeout: 10000,
};