module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin', // If already there
      ['module:react-native-dotenv', { // Add this if missing
        envName: 'APP_ENV',
        moduleName: 'react-native-dotenv',
        path: '.env',
        safe: false,
        allowUndefined: true,
      }],
    ],
  };
};