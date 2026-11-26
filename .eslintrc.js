module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['backend/', 'android/', 'ios/'],
  rules: {
    // Styles are computed from the user's accessibility preferences at render time, so they are inline by design.
    'react-native/no-inline-styles': 'off',
    // `void promise` marks intentional fire-and-forget calls (e.g. speaking a confirmation).
    'no-void': ['warn', { allowAsStatement: true }],
  },
};
