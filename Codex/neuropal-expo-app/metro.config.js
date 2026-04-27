// Metro config — Expo SDK 55 + NativeWind + react-native-svg buffer shim.
//
// Why the buffer alias: react-native-svg@^15.10 ships a `src/utils/fetchData.ts`
// that imports Node's `buffer` module. Metro's default resolver in Expo 55+
// is strict about Node stdlib imports and bails out with:
//   "attempted to import the Node standard library module 'buffer'"
// The `buffer` npm package is a pure-JS shim. Aliasing it here (plus a
// runtime polyfill in App.js) lets RN-svg's URL-based SVG helpers resolve
// without rewriting app code or downgrading the library.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  buffer: require.resolve("buffer"),
};

module.exports = withNativeWind(config, { input: "./global.css" });
