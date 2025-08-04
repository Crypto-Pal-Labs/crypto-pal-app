// src/screens/Buy.tsx
import { StyleSheet, View } from 'react-native';
import { TransakWebView } from '@transak/react-native-sdk';   // ← named export ✅

import { TRANSAK_API_KEY, TRANSAK_ENV } from '../config/TransakKeys';

export default function Buy() {
  return (
    <View style={styles.container}>
      <TransakWebView
        transakConfig={{
          apiKey: TRANSAK_API_KEY,
          environment: TRANSAK_ENV,   // 'STAGING' for sandbox
          defaultFiatCurrency: 'NZD'
        }}
        containerStyle={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }
});


