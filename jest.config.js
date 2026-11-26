module.exports = {
  preset: '@react-native/jest-preset',
  // The backend has its own Vitest suite (`npm --prefix backend test`).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/backend/'],
};
