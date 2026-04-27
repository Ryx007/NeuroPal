// Metro config — Expo SDK 55 + NativeWind + react-native-svg buffer shim.
//
// react-native-svg@^15.10 imports Node's `buffer` from src/utils/fetchData.ts
// and Metro on SDK 55+ refuses to resolve it. The fix pairs the pure-JS
// `buffer` npm polyfill with an extraNodeModules alias here, plus a global
// seed in app/_layout.tsx.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  buffer: require.resolve("buffer"),
};

module.exports = withNativeWind(config, { input: "./global.css" });
