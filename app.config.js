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
      supportsTablet: true
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
      COVALENT_KEY: process.env.EXPO_PUBLIC_COVALENT_KEY || 'cqt_rQF9hvHmdRbkqFcK9wxdtQhmBbrh', // Fallback
      TRANSAK_API_KEY: process.env.EXPO_PUBLIC_TRANSAK_API_KEY || '49362815-1fc8-4dde-ab46-72b51a21aeb3',
      ONE_INCH_API_KEY: process.env.EXPO_PUBLIC_ONE_INCH_API_KEY || 'MUWExhXNUxLElG1p2w9jiyy0dOTcy9Xi',
      ETHERSCAN_BASE: process.env.EXPO_PUBLIC_ETHERSCAN_BASE || 'https://sepolia.etherscan.io',
      ETH_RPC_URL: process.env.EXPO_PUBLIC_ETH_RPC_URL || 'https://sepolia.infura.io/v3/6dc32f7117154a7fb029a788eccc60ca',
      BSC_RPC_URL: process.env.EXPO_PUBLIC_BSC_RPC_URL || 'https://bsc-testnet.publicnode.com',
      BSCSCAN_BASE: process.env.EXPO_PUBLIC_BSCSCAN_BASE || 'https://testnet.bscscan.com',
      WALLET_CONNECT_PROJECT_ID: process.env.EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'edf4bdf41e12873333b58335df31a526',
      ONE_INCH_API_BASE: process.env.EXPO_PUBLIC_ONE_INCH_API_BASE || 'https://api.1inch.dev/swap/v6.0',
      UNISWAP_ROUTER_ADDRESS: process.env.EXPO_PUBLIC_UNISWAP_ROUTER_ADDRESS || '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      USDC_ADDRESS: process.env.EXPO_PUBLIC_USDC_ADDRESS || '0x94a9D9AC8a22534E3FaCa9F4e7f2E2cf85d5e4c8',
      WETH_ADDRESS: process.env.EXPO_PUBLIC_WETH_ADDRESS || '0x7b79995e5f793A07Bc00cA6814aAcbF12a5c1493',
      CONTRACT_ADDRESS: process.env.EXPO_PUBLIC_CONTRACT_ADDRESS || '0xc11CFA2261568Eda2061Bc7C127F1e1A17A55095',
      ALCHEMY_KEY: process.env.EXPO_PUBLIC_ALCHEMY_KEY || 'alcht_uv4juP2GrHsvgb63E8yNXAhCWicWBj',
      POLYGON_RPC_URL: process.env.EXPO_PUBLIC_POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology'
    }
  };
};