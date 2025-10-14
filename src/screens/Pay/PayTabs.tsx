// src/screens/Pay/PayTabs.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ReceiveTab from './ReceiveTab';
import SendTab from './SendTab';

type Mode = 'send' | 'receive';

export default function PayTabs() {
  const [mode, setMode] = useState<Mode>('receive');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payments</Text>

      {/* Segmented chips (match Buy tab look & feel) */}
      <View style={styles.segWrap}>
        <View style={styles.segRow}>
          <TouchableOpacity
            style={mode === 'send' ? styles.segChipActive : styles.segChip}
            onPress={() => setMode('send')}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Text style={mode === 'send' ? styles.segChipTxtActive : styles.segChipTxt}>SEND</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={mode === 'receive' ? styles.segChipActive : styles.segChip}
            onPress={() => setMode('receive')}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Receive"
          >
            <Text style={mode === 'receive' ? styles.segChipTxtActive : styles.segChipTxt}>RECEIVE</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Body */}
      <View style={{ flex: 1 }}>
        {mode === 'receive' ? <ReceiveTab /> : <SendTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 16 },
  title: {
    fontSize: 35,
    fontWeight: 'bold',
    color: '#0A84FF',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 16,
  },

  // Segmented chips (same visual language as Buy tab)
  segWrap: { marginBottom: 16 },
  segRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  segChip: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    marginHorizontal: 8,
    borderRadius: 999,
    minWidth: 120,
    alignItems: 'center',
    backgroundColor: '#e6ecff',
  },
  segChipActive: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    marginHorizontal: 8,
    borderRadius: 999,
    minWidth: 120,
    alignItems: 'center',
    backgroundColor: '#0A84FF',
  },
  segChipTxt: { color: '#0A84FF', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },
  segChipTxtActive: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },
});
