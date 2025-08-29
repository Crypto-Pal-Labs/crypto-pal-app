// src/screens/Pay/PayTabs.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'; // Added TouchableOpacity
import ReceiveTab from './ReceiveTab';
import SendTab from './SendTab';

type Mode = 'send' | 'receive';

export default function PayTabs() {
  const [mode, setMode] = useState<Mode>('receive');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pay or Receive</Text>

      {/* Toggle with line under active */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={mode === 'send' ? styles.activeToggle : styles.inactiveToggle}
          onPress={() => setMode('send')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Text style={mode === 'send' ? styles.activeText : styles.inactiveText}>
            SEND
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={mode === 'receive' ? styles.activeToggle : styles.inactiveToggle}
          onPress={() => setMode('receive')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Receive"
        >
          <Text style={mode === 'receive' ? styles.activeText : styles.inactiveText}>
            RECEIVE
          </Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        {mode === 'receive' ? <ReceiveTab /> : <SendTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', marginTop: 40, marginBottom: 16 }, // Blue, centered, moved down
  toggleRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  activeToggle: { borderBottomWidth: 2, borderBottomColor: '#0A84FF', paddingVertical: 10, marginHorizontal: 10 },
  inactiveToggle: { paddingVertical: 10, marginHorizontal: 10 },
  activeText: { color: '#0A84FF', fontWeight: '700' },
  inactiveText: { color: '#ccc', fontWeight: '700' },
});