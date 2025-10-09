// App.js — single entry point for Crypto Pal

// Must be first so ethers/randomness works correctly in RN
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import 'react-native-get-random-values';
import "@ethersproject/shims";  // Node.js globals for ethers in RN/Expo
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from './src/store/useAuthStore';
import AppNavigator from './src/navigation/AppNavigator';
import { COVALENT_KEY, ETH_RPC_URL, BSC_RPC_URL, ETHERSCAN_BASE, BSCSCAN_BASE } from '@env';
import { useWalletStore } from './src/store/useWalletStore';
import { getWalletAddress, clearWallet } from './src/utils/wallet'; // Updated: Added clearWallet

export default function App() {
  const { setAuthenticated, setHasMnemonic, setHasPin } = useAuthStore();
  const setAddress = useWalletStore((state) => state.setAddress);
  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Migrate old keys if exist (for legacy data)
        const oldMnemonic = await SecureStore.getItemAsync('user_mnemonic');
        if (oldMnemonic) {
          await SecureStore.setItemAsync('mnemonic', oldMnemonic);
          await SecureStore.deleteItemAsync('user_mnemonic');
          console.log('Migrated old mnemonic key.');
        }
        const oldPin = await SecureStore.getItemAsync('user_pin');
        if (oldPin) {
          await SecureStore.setItemAsync('pin', oldPin);
          await SecureStore.deleteItemAsync('user_pin');
          console.log('Migrated old pin key.');
        }

        const mnemonic = await SecureStore.getItemAsync('mnemonic');
        const pin = await SecureStore.getItemAsync('pin');
        const hasMn = !!mnemonic;
        const hasP = !!pin;
        setHasMnemonic(hasMn);
        setHasPin(hasP);
        setAuthenticated(hasMn && hasP);
        console.log('Auth check: hasMnemonic=', hasMn, 'hasPin=', hasP);

        if (hasMn && hasP) {
          if (!mnemonic) { // Mismatch handling
            console.error('Mismatch: hasMnemonic true but mnemonic null—resetting.');
            Alert.alert('Error', 'Wallet data inconsistent. Clearing storage and redirecting to setup.');
            await clearWallet(); // Clear all
            setHasMnemonic(false);
            setHasPin(false);
            setAuthenticated(false);
            setInitialRoute({ name: 'Welcome' });
          } else {
            const currentAddress = await getWalletAddress(); // Load address
            if (currentAddress) setAddress(currentAddress); // Set in store
            setInitialRoute({ name: 'Pin', params: { isSetup: false } });
          }
        } else {
          setInitialRoute({ name: 'Welcome' });
        }
      } catch (error) {
        console.error('Auth check error:', error);
        Alert.alert('Error', 'Failed to check authentication. Redirecting to Welcome.');
        setInitialRoute({ name: 'Welcome' });
      } finally {
        setLoading(false);
      }
    };
    checkAuth();

    // Env logging (unchanged)
    const redact = (v) =>
      typeof v === 'string' && v.length > 14 ? `${v.slice(0, 10)}…` : v || 'undefined';
    console.log('🔧 Env check:');
    console.log('  COVALENT_KEY  :', redact(COVALENT_KEY));
    console.log('  ETH_RPC_URL   :', redact(ETH_RPC_URL));
    console.log('  BSC_RPC_URL   :', redact(BSC_RPC_URL));
    console.log('  ETHERSCAN_BASE:', redact(ETHERSCAN_BASE));
    console.log('  BSCSCAN_BASE  :', redact(BSCSCAN_BASE));
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

  return <AppNavigator initialRoute={initialRoute} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});