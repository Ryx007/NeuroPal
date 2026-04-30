// Metro config — buffer alias baked in for react-native-svg ≥15.10.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};
config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules ?? {}),
    buffer: require.resolve('buffer'),
};

module.exports = config;
