// src/screens/Pay/ReceiveTab.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { getMnemonic, getWalletAddress } from '../../utils/wallet';

export default function ReceiveTab() {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    const deriveAddress = async () => {
      try {
        const mnemonic = await getMnemonic();
        if (!mnemonic) {
          Alert.alert('Error', 'Mnemonic not found—please create or restore wallet.');
          setAddress('0xFallbackStubAddressForTest');
          return;
        }
        const derivedAddress = await getWalletAddress();
        setAddress(derivedAddress);
      } catch (error: unknown) {
        console.error('ReceiveTab derive address failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', 'Failed to derive address: ' + errorMessage);
        setAddress('0xFallbackStubAddressForTest');
      }
    };
    deriveAddress();
  }, []);

  return (
    <View style={styles.container}>
      {address ? (
        <View style={styles.content}>
          <QRCode value={address} size={200} />
          <Text selectable style={styles.address}>{address}</Text>
        </View>
      ) : (
        <Text style={styles.loading}>Here is your QR code, and your Wallet address to receive Crypto. Loading...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 2, padding: 15, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center' },
  address: { fontSize: 22, color: '#111', marginTop: 30, textAlign: 'center' },
  loading: { fontSize: 22, textAlign: 'center', color: '#075bf7ff' },
});