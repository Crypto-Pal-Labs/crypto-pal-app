// src/utils/env.ts - Safe static env reader for dev/builds
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Runtime extra fallback (for APKs if inlining fails)
const runtimeExtra =
  (Constants?.expoConfig as any)?.extra ||
  (Updates?.manifest as any)?.extra ||
  {};

export const ENV = {
  // Static references for Expo compile-time inlining (EAS/APK bundling)
  COVALENT_KEY: process.env.EXPO_PUBLIC_COVALENT_KEY ?? runtimeExtra.COVALENT_KEY,
  TRANSAK_API_KEY: process.env.EXPO_PUBLIC_TRANSAK_API_KEY ?? runtimeExtra.TRANSAK_API_KEY,
  ONE_INCH_API_KEY: process.env.EXPO_PUBLIC_ONE_INCH_API_KEY ?? runtimeExtra.ONE_INCH_API_KEY,
  ETHERSCAN_BASE: process.env.EXPO_PUBLIC_ETHERSCAN_BASE ?? runtimeExtra.ETHERSCAN_BASE,
  ETH_RPC_URL: process.env.EXPO_PUBLIC_ETH_RPC_URL ?? runtimeExtra.ETH_RPC_URL,
  BSC_RPC_URL: process.env.EXPO_PUBLIC_BSC_RPC_URL ?? runtimeExtra.BSC_RPC_URL,
  BSCSCAN_BASE: process.env.EXPO_PUBLIC_BSCSCAN_BASE ?? runtimeExtra.BSCSCAN_BASE,
  WALLET_CONNECT_PROJECT_ID: process.env.EXPO_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? runtimeExtra.WALLET_CONNECT_PROJECT_ID,
  ONE_INCH_API_BASE: process.env.EXPO_PUBLIC_ONE_INCH_API_BASE ?? runtimeExtra.ONE_INCH_API_BASE,
  UNISWAP_ROUTER_ADDRESS: process.env.EXPO_PUBLIC_UNISWAP_ROUTER_ADDRESS ?? runtimeExtra.UNISWAP_ROUTER_ADDRESS,
  USDC_ADDRESS: process.env.EXPO_PUBLIC_USDC_ADDRESS ?? runtimeExtra.USDC_ADDRESS,
  WETH_ADDRESS: process.env.EXPO_PUBLIC_WETH_ADDRESS ?? runtimeExtra.WETH_ADDRESS,
  CONTRACT_ADDRESS: process.env.EXPO_PUBLIC_CONTRACT_ADDRESS ?? runtimeExtra.CONTRACT_ADDRESS,
  ALCHEMY_KEY: process.env.EXPO_PUBLIC_ALCHEMY_KEY ?? runtimeExtra.ALCHEMY_KEY,
  POLYGON_RPC_URL: process.env.EXPO_PUBLIC_POLYGON_RPC_URL ?? runtimeExtra.POLYGON_RPC_URL,
} as const;