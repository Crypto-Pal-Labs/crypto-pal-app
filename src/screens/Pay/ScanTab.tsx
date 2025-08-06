import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ScanTab() {
  return (
    <View style={styles.center}>
      <Text>QR Scan functionality coming soon!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});

