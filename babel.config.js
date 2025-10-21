module.exports = function (api) {
  api.cache(true);
  const plugins = [];
  // If you use Reanimated, keep its plugin LAST when installed:
  try { require.resolve("react-native-reanimated/plugin"); plugins.push("react-native-reanimated/plugin"); } catch (e) {}
  return { presets: ["babel-preset-expo"], plugins };
};
