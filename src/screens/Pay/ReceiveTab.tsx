// src/screens/Pay/ReceiveTab.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { getStoredAddress } from '../../services/WalletService';

export default function ReceiveTab() {
  const [address, setAddress] = React.useState<string | null>(null);

  React.useEffect(() => {
    getStoredAddress().then(setAddress);
  }, []);

  if (!address) return <Text style={styles.loading}>Loading…</Text>;

  return (
    <View style={styles.container}>
      <QRCode value={address} size={220} />
      <Text style={styles.address}>{address}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, alignItems:'center', justifyContent:'center', padding:20 },
  address:   { marginTop:20, textAlign:'center' },
  loading:   { flex:1, textAlign:'center', textAlignVertical:'center' }
});
