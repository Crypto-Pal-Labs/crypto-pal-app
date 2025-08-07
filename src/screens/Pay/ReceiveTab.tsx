// src/screens/Pay/ReceiveTab.tsx
import React from 'react';
import { View, Text, StyleSheet, Button, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { getStoredAddress } from '../../services/WalletService';

export default function ReceiveTab() {
  const [address, setAddress] = React.useState<string | null>(null);

  React.useEffect(() => {
    getStoredAddress().then(setAddress);
  }, []);

  const handleCopy = () => {
    if (address) {
      Clipboard.setStringAsync(address);
      Alert.alert('Copied!', 'Wallet address copied to clipboard.');
    }
  };

  if (!address) return <Text style={styles.loading}>Loading…</Text>;

  return (
    <View style={styles.container}>
      <QRCode value={address} size={220} />
      <Text style={styles.address}>{address}</Text>
      <View style={{ marginTop: 20, width: '80%' }}>
        <Button title="Copy Address" onPress={handleCopy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  address:   { marginTop: 20, textAlign: 'center', fontWeight: 'bold' },
  loading:   { flex: 1, textAlign: 'center', textAlignVertical: 'center' }
});

