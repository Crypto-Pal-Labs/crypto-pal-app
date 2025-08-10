// src/screens/MnemonicBackupScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getSavedMnemonic } from '../utils/wallet';

export default function MnemonicBackupScreen() {
  const navigation          = useNavigation();
  const { params }          = useRoute<any>();
  const isRestore           = params?.isRestore ?? false;
  const [mnemonic, setMnemonic] = useState<string>('');

  useEffect(() => {
    (async () => setMnemonic((await getSavedMnemonic()) ?? ''))();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{isRestore ? 'Restore Complete' : 'Backup Your Wallet'}</Text>
      <ScrollView style={styles.phraseContainer} contentContainerStyle={{ padding: 16 }}>
        <Text selectable style={styles.phraseText}>{mnemonic}</Text>
      </ScrollView>

      <TouchableOpacity style={styles.button} onPress={() => navigation.replace('WalletRoot')}>
        <Text style={styles.buttonText}>I’ve backed it up — Go to Wallet</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  header:        { fontSize: 28, fontWeight: '700', color: '#0A84FF', textAlign: 'center', marginBottom: 24 },
  phraseContainer:{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, maxHeight: 160, marginBottom: 24 },
  phraseText:    { fontSize: 18, lineHeight: 28, color: '#111' },
  button:        { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 12 },
  buttonText:    { textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
});


