// App.js — single entry point for Crypto Pal

// Must be first so ethers/randomness works correctly in RN
import 'react-native-get-random-values';

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

// Env vars loaded via babel plugin: module:react-native-dotenv
import {
  COVALENT_KEY,
  ETH_RPC_URL,
  BSC_RPC_URL,
  ETHERSCAN_BASE,
  BSCSCAN_BASE,
} from '@env';

import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  useEffect(() => {
    // Redact long values so we don’t leak secrets in logs
    const redact = (v?: string) =>
      typeof v === 'string' && v.length > 14 ? `${v.slice(0, 10)}…` : v ?? 'undefined';

    console.log('🔧 Env check:');
    console.log('  COVALENT_KEY  :', redact(COVALENT_KEY));
    console.log('  ETH_RPC_URL   :', redact(ETH_RPC_URL));
    console.log('  BSC_RPC_URL   :', redact(BSC_RPC_URL));
    console.log('  ETHERSCAN_BASE:', ETHERSCAN_BASE || 'undefined');
    console.log('  BSCSCAN_BASE  :', BSCSCAN_BASE || 'undefined');

    // Helpful warnings in dev if something’s missing
    if (!COVALENT_KEY) {
      console.warn('⚠️  Missing COVALENT_KEY in .env — balances/history will fail.');
    }
    if (!ETH_RPC_URL) {
      console.warn('⚠️  Missing ETH_RPC_URL in .env — ETH send/fee estimates will fail.');
    }
    if (!BSC_RPC_URL) {
      console.warn('⚠️  Missing BSC_RPC_URL in .env — BSC features will fail.');
    }
  }, []);

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}

