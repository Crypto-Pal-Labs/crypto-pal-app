// app.config.js
const envName = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
require('dotenv').config({ path: envName === 'development' ? '.env.development' : '.env' });

const isEAS = process.env.EAS_BUILD === 'true';
const isProdBuild = isEAS || envName === 'production';

// prefer EXPO_PUBLIC_* (Expo inlines these), fall back to legacy names
const covalentKey =
  process.env.EXPO_PUBLIC_COVALENT_KEY ||
  process.env.COVALENT_KEY ||
  '';

const looksValid = covalentKey.startsWith('cqt_');
if (isProdBuild && !looksValid) {
  throw new Error('[BUILD] Invalid EXPO_PUBLIC_COVALENT_KEY. It must start with "cqt_".');
}

// --- Compute the Basic auth string Covalent clients often expect
const covalentBasicB64 = looksValid ? Buffer.from(`${covalentKey}:`).toString('base64') : '';

// --- Small helper to expose both EXPO_PUBLIC_* and legacy names in extra, with fallbacks
const pick = (publicKey, legacyKey, defaultValue) => {
  for (const k of [publicKey, legacyKey]) {
    const v = process.env[k];
    if (typeof v === 'string' && v.length) return v;
  }
  return defaultValue;
};

module.exports = ({ config }) => ({
  ...config,

  name: 'Crypto Pal',
  slug: 'crypto-pal',

  // ✅ Store identifiers + Face ID reason
  android: {
    package: 'com.cryptopal.app',
    versionCode: 10009, // ignored when using remote versions, but fine to keep
  },

  ios: {
    bundleIdentifier: 'com.cryptopal.ios',
    buildNumber: '1',
    infoPlist: {
      NSFaceIDUsageDescription: 'Crypto Pal uses Face ID to unlock your wallet securely.',
    },
  },

  // ✅ Ensure Gradle/SDK/autolinking are correctly configured during Managed builds
  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 34,
          targetSdkVersion: 34,
          minSdkVersion: 24,
          kotlinVersion: '1.9.24',
        },
        ios: {
          // 🔧 raised from 13.4 → 15.1 to satisfy plugin validation
          deploymentTarget: '15.1',
        },
      },
    ],
  ],

  extra: {
    ...config.extra,

    // ✅ Required by EAS when using dynamic config (fixes "project not configured" loop)
    eas: { projectId: '09671262-f041-418c-83ab-19f5d8003242' },

    APP_ENV: envName,

    // Covalent
    EXPO_PUBLIC_COVALENT_KEY: covalentKey,
    COVALENT_KEY: covalentKey,
    COVALENT_BASIC_B64: covalentBasicB64,
    COVALENT_X_API_KEY: covalentKey,

    // Feature switch
    FEATURES: { NETWORK_ENABLED: isProdBuild ? true : looksValid },

    // RPC / explorer URLs
    EXPO_PUBLIC_ETHERSCAN_BASE: pick('EXPO_PUBLIC_ETHERSCAN_BASE', 'ETHERSCAN_BASE', 'https://sepolia.etherscan.io'),
    ETHERSCAN_BASE:             pick('EXPO_PUBLIC_ETHERSCAN_BASE', 'ETHERSCAN_BASE', 'https://sepolia.etherscan.io'),

    EXPO_PUBLIC_ETH_RPC_URL:    pick('EXPO_PUBLIC_ETH_RPC_URL', 'ETH_RPC_URL', 'https://eth-sepolia.g.alchemy.com/v2/' + (process.env.EXPO_PUBLIC_ALCHEMY_KEY || process.env.ALCHEMY_KEY || '') || 'https://rpc.sepolia.org'),
    ETH_RPC_URL:                pick('EXPO_PUBLIC_ETH_RPC_URL', 'ETH_RPC_URL', 'https://eth-sepolia.g.alchemy.com/v2/' + (process.env.EXPO_PUBLIC_ALCHEMY_KEY || process.env.ALCHEMY_KEY || '') || 'https://rpc.sepolia.org'),

    EXPO_PUBLIC_BSC_RPC_URL:    pick('EXPO_PUBLIC_BSC_RPC_URL', 'BSC_RPC_URL', 'https://bsc-testnet.publicnode.com'),
    BSC_RPC_URL:                pick('EXPO_PUBLIC_BSC_RPC_URL', 'BSC_RPC_URL', 'https://bsc-testnet.publicnode.com'),

    EXPO_PUBLIC_BSCSCAN_BASE:   pick('EXPO_PUBLIC_BSCSCAN_BASE', 'BSCSCAN_BASE', 'https://testnet.bscscan.com'),
    BSCSCAN_BASE:               pick('EXPO_PUBLIC_BSCSCAN_BASE', 'BSCSCAN_BASE', 'https://testnet.bscscan.com'),

    EXPO_PUBLIC_POLYGON_RPC_URL: pick('EXPO_PUBLIC_POLYGON_RPC_URL', 'POLYGON_RPC_URL', 'https://rpc-amoy.polygon.technology'),
    POLYGON_RPC_URL:             pick('EXPO_PUBLIC_POLYGON_RPC_URL', 'POLYGON_RPC_URL', 'https://rpc-amoy.polygon.technology'),

    EXPO_PUBLIC_ETH_MAINNET_RPC_URL: pick('EXPO_PUBLIC_ETH_MAINNET_RPC_URL', 'ETH_MAINNET_RPC_URL', 'https://mainnet.infura.io/v3/' + (process.env.EXPO_PUBLIC_INFURA_KEY || process.env.INFURA_KEY || '') || 'https://rpc.ankr.com/eth'),
    ETH_MAINNET_RPC_URL:             pick('EXPO_PUBLIC_ETH_MAINNET_RPC_URL', 'ETH_MAINNET_RPC_URL', 'https://mainnet.infura.io/v3/' + (process.env.EXPO_PUBLIC_INFURA_KEY || process.env.INFURA_KEY || '') || 'https://rpc.ankr.com/eth'),

    EXPO_PUBLIC_BSC_MAINNET_RPC_URL: pick('EXPO_PUBLIC_BSC_MAINNET_RPC_URL', 'BSC_MAINNET_RPC_URL', 'https://bsc-dataseed.binance.org'),
    BSC_MAINNET_RPC_URL:             pick('EXPO_PUBLIC_BSC_MAINNET_RPC_URL', 'BSC_MAINNET_RPC_URL', 'https://bsc-dataseed.binance.org'),

    EXPO_PUBLIC_POLYGON_MAINNET_RPC_URL: pick('EXPO_PUBLIC_POLYGON_MAINNET_RPC_URL', 'POLYGON_MAINNET_RPC_URL', 'https://polygon-rpc.com'),
    POLYGON_MAINNET_RPC_URL:             pick('EXPO_PUBLIC_POLYGON_MAINNET_RPC_URL', 'POLYGON_MAINNET_RPC_URL', 'https://polygon-rpc.com'),
  },
});
