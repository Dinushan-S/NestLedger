// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/**',
      '.expo/**',
      '.metro-cache/**',
      'android/**',
      '.opencode/**',
      '.claude/**',
      '.ocx/**',
      '.ruff_cache/**',
      'scripts/**',
    ],
  },
]);
