// src/utils/env.ts - Safe static env reader for dev/builds
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Runtime extra fallback (for APKs if inlining fails)
const runtimeExtra =
  (Updates as any)?.manifest?.extra ||
  (Constants as any)?.expoConfig?.extra ||
  {};

export const ENV = {
  // Static references for Expo compile-time inlining (EAS/APK bundling) with trim for whitespace
  COVALENT_KEY: (process.env.EXPO_PUBLIC_COVALENT_KEY || runtimeExtra.COVALENT_KEY || '').trim(),
  TRANSAK_API_KEY: (process.env.EXPO_PUBLIC_TRANSAK_API_KEY || runtimeExtra.TRANSAK_API_KEY || '').trim(),
  ONE_INCH_API_KEY: (process.env.EXPO_PUBLIC_ONE_INCH_API_KEY || runtimeExtra.ONE_INCH_API_KEY || '').trim(),
  ETHERSCAN_BASE: (process.env.EXPO_PUBLIC_ETHERSCAN_BASE || runtimeExtra.ETHERSCAN_BASE || '').trim(),
  ETH_RPC_URL: (process.env.EXPO_PUBLIC_ETH_RPC_URL || runtimeExtra.ETH_RPC_URL || '').trim(),
  BSC_RPC_URL: (process.env.EXPO_PUBLIC_BSC_RPC_URL || runtimeExtra.BSC_RPC_URL || '').trim(),
  BSCSCAN_BASE: (process.env.EXPO_PUBLIC_BSCSCAN_BASE || runtimeExtra.BSCSCAN_BASE || '').trim(),
  WALLET_CONNECT_PROJECT_ID: (process.env.EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID || runtimeExtra.WALLET_CONNECT_PROJECT_ID || '').trim(),
  ONE_INCH_API_BASE: (process.env.EXPO_PUBLIC_ONE_INCH_API_BASE || runtimeExtra.ONE_INCH_API_BASE || '').trim(),
  UNISWAP_ROUTER_ADDRESS: (process.env.EXPO_PUBLIC_UNISWAP_ROUTER_ADDRESS || runtimeExtra.UNISWAP_ROUTER_ADDRESS || '').trim(),
  USDC_ADDRESS: (process.env.EXPO_PUBLIC_USDC_ADDRESS || runtimeExtra.USDC_ADDRESS || '').trim(),
  WETH_ADDRESS: (process.env.EXPO_PUBLIC_WETH_ADDRESS || runtimeExtra.WETH_ADDRESS || '').trim(),
  CONTRACT_ADDRESS: (process.env.EXPO_PUBLIC_CONTRACT_ADDRESS || runtimeExtra.CONTRACT_ADDRESS || '').trim(),
  ALCHEMY_KEY: (process.env.EXPO_PUBLIC_ALCHEMY_KEY || runtimeExtra.ALCHEMY_KEY || '').trim(),
  POLYGON_RPC_URL: (process.env.EXPO_PUBLIC_POLYGON_RPC_URL || runtimeExtra.POLYGON_RPC_URL || '').trim(),
} as const;