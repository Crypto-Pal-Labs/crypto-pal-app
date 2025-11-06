const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Configure resolver to handle Node.js modules that aren't available in React Native
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  // Provide polyfills for Node.js modules that bitcoinjs-lib dependencies try to import
  stream: path.resolve(__dirname, 'node_modules/stream-browserify'),
  crypto: path.resolve(__dirname, 'node_modules/react-native-crypto'),
  events: path.resolve(__dirname, 'node_modules/events'),
  util: path.resolve(__dirname, 'node_modules/util'),
  url: path.resolve(__dirname, 'node_modules/url'),
  buffer: path.resolve(__dirname, 'node_modules/buffer'),
};

// Add source extensions to handle ESM properly
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'mjs', 'cjs'];

// Enable package exports resolution for ESM packages (now that @noble/hashes v1.8.0 has proper exports)
config.resolver.unstable_enablePackageExports = true;

// Handle @noble/hashes/sha2.js imports (curves imports with .js extension, but package exports "./sha2" without extension)
const defaultResolver = require('metro-resolver').resolve;
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Map sha2.js to sha2 export (Metro package exports may not handle .js extension)
  if (moduleName === '@noble/hashes/sha2.js') {
    const sha2Path = path.resolve(__dirname, 'node_modules/@noble/hashes/sha2.js');
    const fs = require('fs');
    if (fs.existsSync(sha2Path)) {
      return {
        filePath: sha2Path,
        type: 'sourceFile',
      };
    }
  }
  
  // Use default resolver for everything else
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return defaultResolver(context, moduleName, platform);
};

module.exports = config;
