module.exports = function (api) {
  api.cache(true);
  const isProduction = api.env('production');

  return {
    presets: ['babel-preset-expo'],
    plugins: isProduction
      ? [
          ['babel-plugin-transform-remove-console', { exclude: ['error', 'warn'] }],
        ]
      : [],
  };
};