import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ethers } from 'ethers';
import { Ionicons } from '@expo/vector-icons';
import { saveMnemonic, getWalletAddress } from '../utils/wallet';
import { useWalletStore } from '../store/useWalletStore';
import { RootStackParamList } from '../types/navigation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CreateWalletScreen() {
  const navigation = useNavigation<NavigationProp>();
  const setAddress = useWalletStore((state) => state.setAddress);

  const handleCreate = async () => {
    try {
      const wallet = ethers.Wallet.createRandom();
      const phrase = wallet.mnemonic.phrase;
      await saveMnemonic(phrase);
      setAddress(wallet.address);
      navigation.replace('MnemonicBackup');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to create wallet.');
    }
  };

  const handleRestore = () => {
    navigation.navigate('RestoreWallet');
  };

  return (
    <View style={styles.container}>
      <Ionicons name="add-circle-outline" size={64} color="#0A84FF" style={styles.icon} />
      <Text style={styles.title}>Create a New Wallet</Text>

      <Text style={styles.subtitle}>Generate a new secure wallet with your own keys. You'll get a 12 word recovery phrase next write it down and keep it safe, as it's the only way to recover your funds if you lose access to this device.
      </Text>

      <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleCreate}>
        <Text style={styles.buttonText}>Create a New Wallet</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleRestore}>
        <Text style={styles.buttonText}>Restore From Backup</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  icon: { marginBottom: 16 },
  title: { textAlign: 'center', fontSize: 28, fontWeight: '700', color: '#0A84FF', marginBottom: 16 },
  subtitle: { textAlign: 'center', fontSize: 16, color: '#333', marginBottom: 32 },
  button: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 12, marginBottom: 16, width: '80%' },
  buttonText: { textAlign: 'center', color: 'white', fontSize: 18, fontWeight: '600' },
});