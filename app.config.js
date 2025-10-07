require('dotenv').config(); // Loads .env for development (APK uses EAS secrets)

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
      bundleIdentifier: 'com.cryptopal.app' // For iOS prep
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
      // Map EXPO_PUBLIC_* from process.env to extra.* for APK bundling (no hardcodes)
      COVALENT_KEY: process.env.EXPO_PUBLIC_COVALENT_KEY,
      TRANSAK_API_KEY: process.env.EXPO_PUBLIC_TRANSAK_API_KEY,
      ONE_INCH_API_KEY: process.env.EXPO_PUBLIC_ONE_INCH_API_KEY,
      ETHERSCAN_BASE: process.env.EXPO_PUBLIC_ETHERSCAN_BASE,
      ETH_RPC_URL: process.env.EXPO_PUBLIC_ETH_RPC_URL,
      BSC_RPC_URL: process.env.EXPO_PUBLIC_BSC_RPC_URL,
      BSCSCAN_BASE: process.env.EXPO_PUBLIC_BSCSCAN_BASE,
      WALLET_CONNECT_PROJECT_ID: process.env.EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID,
      ONE_INCH_API_BASE: process.env.EXPO_PUBLIC_ONE_INCH_API_BASE,
      UNISWAP_ROUTER_ADDRESS: process.env.EXPO_PUBLIC_UNISWAP_ROUTER_ADDRESS,
      USDC_ADDRESS: process.env.EXPO_PUBLIC_USDC_ADDRESS,
      WETH_ADDRESS: process.env.EXPO_PUBLIC_WETH_ADDRESS,
      CONTRACT_ADDRESS: process.env.EXPO_PUBLIC_CONTRACT_ADDRESS,
      ALCHEMY_KEY: process.env.EXPO_PUBLIC_ALCHEMY_KEY,
      POLYGON_RPC_URL: process.env.EXPO_PUBLIC_POLYGON_RPC_URL
    }
  };
};