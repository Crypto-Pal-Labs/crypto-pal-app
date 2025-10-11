const isEas = !!process.env.EAS_BUILD;
if (!isEas) {
  // Local Expo Go / dev only - load .env.development
  require('dotenv').config({ path: '.env.development' });
}

module.exports = ({ config }) => {
  return {
    ...config,
    name: 'Crypto Pal',
    slug: 'crypto-pal-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.cryptopal.app' // Add for iOS prep (matches Android package)
    },
    android: {
      package: "com.cryptopal.app",
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff'
      }
    },
    web: {
      favicon: './assets/favicon.png'
    },
    plugins: [
      'expo-secure-store',
      'expo-build-properties',
      'expo-localization',
      'expo-camera'
    ],
    extra: {
      eas: {
        projectId: '6c753f76-cdce-4f42-8301-4b22267269c4'
      },
      // Neutral names for code; prefer prefixed (EAS/builds) then fallback to non-prefixed (dev)
      COVALENT_KEY: process.env.EXPO_PUBLIC_COVALENT_KEY || process.env.COVALENT_KEY || "",
      TRANSAK_API_KEY: process.env.EXPO_PUBLIC_TRANSAK_API_KEY || process.env.TRANSAK_API_KEY || "",
      ONE_INCH_API_KEY: process.env.EXPO_PUBLIC_ONE_INCH_API_KEY || process.env.ONE_INCH_API_KEY || "",
      ETHERSCAN_BASE: process.env.EXPO_PUBLIC_ETHERSCAN_BASE || process.env.ETHERSCAN_BASE || "",
      ETH_RPC_URL: process.env.EXPO_PUBLIC_ETH_RPC_URL || process.env.ETH_RPC_URL || "https://rpc.sepolia.org",
      BSC_RPC_URL: process.env.EXPO_PUBLIC_BSC_RPC_URL || process.env.BSC_RPC_URL || "https://bsc-testnet.publicnode.com",
      BSCSCAN_BASE: process.env.EXPO_PUBLIC_BSCSCAN_BASE || process.env.BSCSCAN_BASE || "",
      WALLET_CONNECT_PROJECT_ID: process.env.EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID || process.env.WALLET_CONNECT_PROJECT_ID || "",
      ONE_INCH_API_BASE: process.env.EXPO_PUBLIC_ONE_INCH_API_BASE || process.env.ONE_INCH_API_BASE || "",
      UNISWAP_ROUTER_ADDRESS: process.env.EXPO_PUBLIC_UNISWAP_ROUTER_ADDRESS || process.env.UNISWAP_ROUTER_ADDRESS || "",
      USDC_ADDRESS: process.env.EXPO_PUBLIC_USDC_ADDRESS || process.env.USDC_ADDRESS || "",
      WETH_ADDRESS: process.env.EXPO_PUBLIC_WETH_ADDRESS || process.env.WETH_ADDRESS || "",
      CONTRACT_ADDRESS: process.env.EXPO_PUBLIC_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS || "",
      ALCHEMY_KEY: process.env.EXPO_PUBLIC_ALCHEMY_KEY || process.env.ALCHEMY_KEY || "",
      POLYGON_RPC_URL: process.env.EXPO_PUBLIC_POLYGON_RPC_URL || process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology"
    }
  };
};