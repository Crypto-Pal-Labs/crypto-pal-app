// src/screens/CreateWalletScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ethers } from 'ethers';

import { saveMnemonic } from '../utils/wallet';
import { useWalletStore } from '../store/useWalletStore';

export default function CreateWalletScreen() {
  const navigation = useNavigation();
  const setAddress = useWalletStore((s) => s.setAddress);

  const handleCreate = async () => {
    try {
      const wallet = ethers.Wallet.createRandom();   // v6
      const phrase = wallet.mnemonic.phrase;

      await saveMnemonic(phrase);                    // write to secure store
      setAddress(wallet.address);                    // push to global store

      // go to backup screen; it reads from SecureStore itself
      // (we renamed the stack screen to "WalletRoot" earlier)
      navigation.replace('MnemonicBackup');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to create wallet.');
    }
  };

  // keep this as a placeholder for a future restore flow
  const handleRestore = () => {
    navigation.navigate('RestoreWallet');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Crypto Pal</Text>

      <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleCreate}>
        <Text style={styles.buttonText}>Create New Wallet</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleRestore}>
        <Text style={styles.buttonText}>Restore From Backup</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff', justifyContent: 'center' },
  title: { textAlign: 'center', fontSize: 28, fontWeight: '700', color: '#0A84FF', marginBottom: 32 },
  button: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 12, marginBottom: 16 },
  buttonText: { textAlign: 'center', color: 'white', fontSize: 18, fontWeight: '600' },
});
