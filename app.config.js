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

// --- NEW: compute the Basic auth string Covalent clients often expect
const covalentBasicB64 = looksValid ? Buffer.from(`${covalentKey}:`).toString('base64') : '';

// --- NEW: small helper to expose both EXPO_PUBLIC_* and legacy names in extra
const pick = (...ks) => {
  for (const k of ks) {
    const v = process.env[k];
    if (typeof v === 'string' && v.length) return v;
  }
  return '';
};

module.exports = ({ config }) => ({
  ...config,
  name: 'Crypto Pal',
  slug: 'crypto-pal',
  extra: {
    ...config.extra,
    APP_ENV: envName,

    // Covalent
    EXPO_PUBLIC_COVALENT_KEY: covalentKey,
    COVALENT_KEY: covalentKey,          // legacy alias for codepaths reading 'COVALENT_KEY'
    COVALENT_BASIC_B64: covalentBasicB64, // <— satisfies b64Len>0 check
    COVALENT_X_API_KEY: covalentKey,      // handy if any client uses X-API-Key

    // Feature switch: network allowed in prod always, and in dev only if key looks valid
    FEATURES: { NETWORK_ENABLED: isProdBuild ? true : looksValid },

    // --- NEW: expose RPC / explorer URLs under BOTH names the app might read
    EXPO_PUBLIC_ETHERSCAN_BASE: pick('EXPO_PUBLIC_ETHERSCAN_BASE', 'ETHERSCAN_BASE'),
    ETHERSCAN_BASE:             pick('ETHERSCAN_BASE', 'EXPO_PUBLIC_ETHERSCAN_BASE'),

    EXPO_PUBLIC_ETH_RPC_URL:    pick('EXPO_PUBLIC_ETH_RPC_URL', 'ETH_RPC_URL'),
    ETH_RPC_URL:                pick('ETH_RPC_URL', 'EXPO_PUBLIC_ETH_RPC_URL'),

    EXPO_PUBLIC_BSC_RPC_URL:    pick('EXPO_PUBLIC_BSC_RPC_URL', 'BSC_RPC_URL'),
    BSC_RPC_URL:                pick('BSC_RPC_URL', 'EXPO_PUBLIC_BSC_RPC_URL'),

    EXPO_PUBLIC_BSCSCAN_BASE:   pick('EXPO_PUBLIC_BSCSCAN_BASE', 'BSCSCAN_BASE'),
    BSCSCAN_BASE:               pick('BSCSCAN_BASE', 'EXPO_PUBLIC_BSCSCAN_BASE'),

    EXPO_PUBLIC_POLYGON_RPC_URL: pick('EXPO_PUBLIC_POLYGON_RPC_URL', 'POLYGON_RPC_URL'),
    POLYGON_RPC_URL:             pick('POLYGON_RPC_URL', 'EXPO_PUBLIC_POLYGON_RPC_URL'),

    // (Optional but consistent) mainnets too, if your code reads them:
    EXPO_PUBLIC_ETH_MAINNET_RPC_URL: pick('EXPO_PUBLIC_ETH_MAINNET_RPC_URL', 'ETH_MAINNET_RPC_URL'),
    ETH_MAINNET_RPC_URL:             pick('ETH_MAINNET_RPC_URL', 'EXPO_PUBLIC_ETH_MAINNET_RPC_URL'),

    EXPO_PUBLIC_BSC_MAINNET_RPC_URL: pick('EXPO_PUBLIC_BSC_MAINNET_RPC_URL', 'BSC_MAINNET_RPC_URL'),
    BSC_MAINNET_RPC_URL:             pick('BSC_MAINNET_RPC_URL', 'EXPO_PUBLIC_BSC_MAINNET_RPC_URL'),

    EXPO_PUBLIC_POLYGON_MAINNET_RPC_URL: pick('EXPO_PUBLIC_POLYGON_MAINNET_RPC_URL', 'POLYGON_MAINNET_RPC_URL'),
    POLYGON_MAINNET_RPC_URL:             pick('POLYGON_MAINNET_RPC_URL', 'EXPO_PUBLIC_POLYGON_MAINNET_RPC_URL'),
  },
});
