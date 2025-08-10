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
      <Text style={styles.title}>Pay or Receive</Text>

      {/* Toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'send' ? styles.btnActive : styles.btnInactive]}
          onPress={() => setMode('send')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Text style={[styles.btnText, mode === 'send' ? styles.textActive : styles.textInactive]}>
            SEND
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'receive' ? styles.btnActive : styles.btnInactive]}
          onPress={() => setMode('receive')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Receive"
        >
          <Text style={[styles.btnText, mode === 'receive' ? styles.textActive : styles.textInactive]}>
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
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#0A84FF',
    marginBottom: 16,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  btnActive: { backgroundColor: '#0A84FF' },
  btnInactive: { backgroundColor: '#fff' },
  btnText: { fontSize: 16, fontWeight: '700' },
  textActive: { color: '#fff' },
  textInactive: { color: '#0A84FF' },
});
