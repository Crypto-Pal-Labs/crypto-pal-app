import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ethers } from 'ethers';
import { Ionicons } from '@expo/vector-icons';
import { saveMnemonic } from '../utils/wallet';
import { useWalletStore } from '../store/useWalletStore';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList } from '../types/navigation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function RestoreWalletScreen() {
  const navigation = useNavigation<NavigationProp>();
  const setAddress = useWalletStore((state) => state.setAddress);
  const setHasMnemonic = useAuthStore((state) => state.setHasMnemonic);
  const [phrase, setPhrase] = useState('');

  const handleRestore = async () => {
    try {
      console.log('Restoring phrase:', phrase); // Debug
      const wallet = ethers.Wallet.fromMnemonic(phrase);
      await saveMnemonic(phrase);
      console.log('Mnemonic saved successfully'); // Debug
      setAddress(wallet.address);
      setHasMnemonic(true); // Set true on success
      navigation.replace('AppTabs'); // Go to Wallet Tab
    } catch (e: any) {
      console.error('Restore error:', e); // Debug
      Alert.alert('Error', e?.message ?? 'Invalid phrase or storage failed. Make sure you have 12 words separated with a space and no commas—try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Ionicons name="refresh-circle-outline" size={64} color="#0A84FF" style={styles.icon} />
      <Text style={styles.title}>Restore Wallet</Text>
      <Text style={styles.subtitle}>Enter your 12-word recovery phrase to restore your wallet. Words are case-sensitive and space-separated.</Text>
      <TextInput
        style={styles.input}
        multiline
        numberOfLines={3}
        placeholder="Enter recovery phrase"
        value={phrase}
        onChangeText={setPhrase}
      />
      <TouchableOpacity style={styles.button} disabled={phrase.split(' ').length !== 12} onPress={handleRestore}>
        <Text style={styles.buttonText}>Restore</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F5F5F5', justifyContent: 'center' },
  icon: { marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#0A84FF', textAlign: 'center', marginBottom: 16 },
  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, padding: 16, fontSize: 18, marginBottom: 24 },
  button: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 12 },
  buttonText: { textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
});