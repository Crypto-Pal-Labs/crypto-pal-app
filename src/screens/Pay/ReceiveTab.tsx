import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Wallet } from 'ethers';            // ✅ v6 API
import { getSavedMnemonic } from '../../utils/wallet';

export default function ReceiveTab() {
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const mnemonic = await getSavedMnemonic();
        if (!mnemonic) {
          setError('No wallet found. Create or restore a wallet first.');
          setAddress(null);
          return;
        }
        // ✅ ethers v6 uses fromPhrase (not fromMnemonic)
        const wallet = Wallet.fromPhrase(mnemonic);
        setAddress(wallet.address);
      } catch (e) {
        console.error('ReceiveTab derive address failed:', e);
        setError('Could not load your address.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading address…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }

  if (!address) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No address available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Your Receiving Address</Text>
      <QRCode value={address} size={200} />
      <Text selectable style={styles.address}>{address}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16, alignItems: 'center' },
  center:    { flex: 1, backgroundColor: '#fff', padding: 16, alignItems: 'center', justifyContent: 'center' },
  header:    { fontSize: 22, fontWeight: '600', marginBottom: 24 },
  address:   { marginTop: 16, fontSize: 16, color: '#333', textAlign: 'center' },
  muted:     { marginTop: 8, color: '#666' },
});


