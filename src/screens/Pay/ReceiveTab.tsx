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
          {/* New instruction text above QR */}
          <Text style={styles.info}>
            This is the QR code of your Wallet. Show this to people you wish to receive crypto
            currency from. Your Wallet address is below.
          </Text>

          <QRCode value={address} size={220} />
          <Text selectable style={styles.address}>{address}</Text>
        </View>
      ) : (
        <Text style={styles.loading}>
          Preparing your details… Loading your QR code and Wallet address.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 2, padding: 16, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', maxWidth: 360 },
  info: {
    textAlign: 'center',
    color: '#334155',
    fontSize: 20,
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  address: { fontSize: 24, color: '#0A84FF', marginTop: 16, textAlign: 'center' },
  loading: { fontSize: 16, textAlign: 'center', color: '#0A84FF' },
});
