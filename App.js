// App.js — single entry point for Crypto Pal

// Must be first so ethers/randomness works correctly in RN
import 'react-native-get-random-values';

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from './src/store/useAuthStore';
import AppNavigator from './src/navigation/AppNavigator';
import { COVALENT_KEY, ETH_RPC_URL, BSC_RPC_URL, ETHERSCAN_BASE, BSCSCAN_BASE } from '@env';

export default function App() {
  const { setAuthenticated, setHasMnemonic, setHasPin } = useAuthStore();
  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const mnemonic = await SecureStore.getItemAsync('user_mnemonic');
        const pin = await SecureStore.getItemAsync('user_pin');
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay for lag
        const hasMn = !!mnemonic;
        const hasP = !!pin;
        setHasMnemonic(hasMn);
        setHasPin(hasP);
        setAuthenticated(hasMn && hasP);
        console.log('Auth check: hasMnemonic=', hasMn, 'hasPin=', hasP);
        setInitialRoute(hasMn && hasP ? 'Pin' : 'Welcome');
      } catch (error) {
        console.error('Auth check error:', error);
        setInitialRoute('Welcome');
      } finally {
        setLoading(false);
      }
    };
    checkAuth();

    // Env logging (unchanged)
    const redact = (v?: string) =>
      typeof v === 'string' && v.length > 14 ? `${v.slice(0, 10)}…` : v ?? 'undefined';
    console.log('🔧 Env check:');
    console.log('  COVALENT_KEY  :', redact(COVALENT_KEY));
    console.log('  ETH_RPC_URL   :', redact(ETH_RPC_URL));
    console.log('  BSC_RPC_URL   :', redact(BSC_RPC_URL));
    console.log('  ETHERSCAN_BASE:', ETHERSCAN_BASE || 'undefined');
    console.log('  BSCSCAN_BASE  :', BSCSCAN_BASE || 'undefined');
    if (!COVALENT_KEY) console.warn('⚠️ Missing COVALENT_KEY');
    if (!ETH_RPC_URL) console.warn('⚠️ Missing ETH_RPC_URL');
    if (!BSC_RPC_URL) console.warn('⚠️ Missing BSC_RPC_URL');
  }, []);

  if (loading || !initialRoute) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  return <AppNavigator initialRouteName={initialRoute} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});