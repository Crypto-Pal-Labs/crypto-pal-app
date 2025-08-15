// App.js — single entry point for Crypto Pal

// Must be first so ethers/randomness works correctly in RN
import 'react-native-get-random-values';

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator'; // From remote backup for scan feature

export default function App() {
  useEffect(() => {
    // Redact long values so we don’t leak secrets in logs
    const redact = (v? : string) =>
      typeof v === 'string' && v.length > 14 ? `${v.slice(0, 10)}…` : v ?? 'undefined';

    console.log('🔧 Env check:');
    console.log('  COVALENT_KEY  :', redact(process.env.COVALENT_KEY));
    console.log('  ETH_RPC_URL   :', redact(process.env.ETH_RPC_URL));
    console.log('  BSC_RPC_URL   :', redact(process.env.BSC_RPC_URL));
    console.log('  ETHERSCAN_BASE:', process.env.ETHERSCAN_BASE || 'undefined');
    console.log('  BSCSCAN_BASE  :', process.env.BSCSCAN_BASE || 'undefined');
    console.log('DEBUG ENV:', process.env.COVALENT_KEY); // Should log your key

    // Helpful warnings in dev if something’s missing
    if (!process.env.COVALENT_KEY) {
      console.warn('⚠️ Missing COVALENT_KEY in .env — balances/history will fail.');
    }
    if (!process.env.ETH_RPC_URL) {
      console.warn('⚠️ Missing ETH_RPC_URL in .env — ETH send/fee estimates will fail.');
    }
    if (!process.env.BSC_RPC_URL) {
      console.warn('⚠️ Missing BSC_RPC_URL in .env — BSC features will fail.');
    }
  }, []);

  return (
    <AppNavigator />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});