import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ethers } from 'ethers';
import { saveMnemonic } from '../utils/wallet';
import { resetRoot } from '../navigation/RootNavigation';

function normalizeMnemonic(raw: string) {
  // Lowercase, collapse all whitespace (spaces/newlines/tabs) to single spaces, trim ends
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

export default function RestoreWalletScreen() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const onRestore = useCallback(async () => {
    if (busy) return; // double‑tap guard

    const phrase = normalizeMnemonic(input);
    const words = phrase ? phrase.split(' ') : [];

    if (words.length !== 12) {
      Alert.alert('Invalid phrase', 'Please enter exactly 12 words.');
      return;
    }

    try {
      setBusy(true);

      // Will throw if invalid (checksum/words)
      const wallet = ethers.Wallet.fromPhrase(phrase);

      await saveMnemonic(phrase);

      // Optional: show derived address once
      Alert.alert('Wallet restored', `Address:\n${wallet.address}`);

      // Jump into the app
      resetRoot([{ name: 'WalletRoot' }]);
    } catch (e: any) {
      console.log('[RestoreWalletScreen] restore failed:', e);
      const msg =
        typeof e?.message === 'string'
          ? e.message
          : 'Please check your phrase and try again.';
      Alert.alert('Restore failed', msg);
    } finally {
      setBusy(false);
    }
  }, [busy, input]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, padding: 20 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={{ fontSize: 28, fontWeight: '800', marginTop: 24, marginBottom: 16 }}>
        Restore From Backup
      </Text>

      <Text style={{ color: '#444', marginBottom: 12 }}>
        Paste your 12‑word recovery phrase. Words can be separated by spaces or new lines.
      </Text>

      <TextInput
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        textAlignVertical="top"
        placeholder="twelve words separated by spaces"
        editable={!busy}
        style={{
          minHeight: 140,
          borderWidth: 1,
          borderColor: '#ddd',
          borderRadius: 12,
          padding: 12,
          fontSize: 16,
        }}
      />

      <TouchableOpacity
        disabled={busy}
        onPress={onRestore}
        style={{
          marginTop: 20,
          backgroundColor: busy ? '#9ec5ff' : '#1d6ef2',
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: 'center',
        }}
        activeOpacity={0.8}
      >
        <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>
          {busy ? 'Restoring…' : 'Restore Wallet'}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

