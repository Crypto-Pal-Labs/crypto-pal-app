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
import { Ionicons } from '@expo/vector-icons';

function normalizeMnemonic(raw: string) {
  // Lowercase, collapse all whitespace (spaces/newlines/tabs) to single spaces, trim ends
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

export default function RestoreWalletScreen() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const onRestore = useCallback(async () => {
    if (busy) return; // double-tap guard

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
      style={{ flex: 1, padding: 20, backgroundColor: '#F5F5F5', marginTop: 40 }} // Light gray background, moved down 2 lines
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Ionicons name="key-outline" size={64} color="#0A84FF" style={{ marginBottom: 16, alignSelf: 'center' }} /> {/* Added icon for confidence */}
      <Text style={{ fontSize: 28, fontWeight: '800', marginBottom: 16, color: '#0A84FF', textAlign: 'center' }}>Restore From Backup</Text>

      <Text style={{ color: '#444', marginBottom: 12, textAlign: 'center' }}>Paste or enter your 12 word recovery phrase below. Words can be separated by spaces or new lines. This will securely restore your wallet and your assets, make sure you're in a private location.</Text>

      <TextInput
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        textAlignVertical="top"
        placeholder="Enter your 12 word recovery phrase here separated by spaces no commas"
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