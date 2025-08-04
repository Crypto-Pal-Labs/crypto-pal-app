// src/screens/Pay/ScanTab.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ScanTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>QR Scan functionality coming soon!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 18, color: '#333', textAlign: 'center' },
});

