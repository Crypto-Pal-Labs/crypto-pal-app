require('dotenv').config(); // For dev loading .env

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
      bundleIdentifier: 'com.cryptopallabs.cryptopal'  // Added for iOS prep (matches android)
    },
    android: {
      package: 'com.cryptopallabs.cryptopal',  // Moved here from adaptiveIcon (required top-level for builds)
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
      COVALENT_KEY: process.env.COVALENT_KEY,
      TRANSAK_API_KEY: process.env.TRANSAK_API_KEY,
      ETHERSCAN_BASE: process.env.ETHERSCAN_BASE,
      ETH_RPC_URL: process.env.ETH_RPC_URL,
      BSC_RPC_URL: process.env.BSC_RPC_URL,
      BSCSCAN_BASE: process.env.BSCSCAN_BASE,
      WALLET_CONNECT_PROJECT_ID: process.env.WALLET_CONNECT_PROJECT_ID,
      ONE_INCH_API_KEY: process.env.ONE_INCH_API_KEY,
      ONE_INCH_API_BASE: process.env.ONE_INCH_API_BASE,
      UNISWAP_ROUTER_ADDRESS: process.env.UNISWAP_ROUTER_ADDRESS,
      USDC_ADDRESS: process.env.USDC_ADDRESS,
      WETH_ADDRESS: process.env.WETH_ADDRESS,
      CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
      ALCHEMY_KEY: process.env.ALCHEMY_KEY,
      POLYGON_RPC_URL: process.env.POLYGON_RPC_URL
    }
  };
};