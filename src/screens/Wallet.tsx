// src/screens/Wallet.tsx
import 'react-native-get-random-values';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import {
  createWallet,
  restoreWallet,
  getSavedMnemonic,
} from '../utils/wallet';

// NEW: Balance hook and store
import { useBalances } from '../hooks/useBalances';
import { useWalletStore } from '../store/useWalletStore';

type Step = 'loading' | 'welcome' | 'backup' | 'restore' | 'home';

export default function Wallet() {
  const [step, setStep] = useState<Step>('loading');
  const [address, setAddress] = useState<string>('');
  const [mnemonic, setMnemonic] = useState<string>('');
  const [inputPhrase, setInputPhrase] = useState<string>('');

  // 1️⃣ On mount: check for existing mnemonic
  useEffect(() => {
    (async () => {
      try {
        const saved = await getSavedMnemonic();
        if (saved) {
          const { address } = await restoreWallet(saved);
          setAddress(address);
          setStep('home');
        } else {
          setStep('welcome');
        }
      } catch (e: any) {
        Alert.alert('Error', e.message);
        setStep('welcome');
      }
    })();
  }, []);

  // 2️⃣ When entering backup step, load the phrase
  useEffect(() => {
    if (step === 'backup') {
      (async () => {
        const saved = await getSavedMnemonic();
        setMnemonic(saved ?? '');
      })();
    }
  }, [step]);

  // 3️⃣ Fetch balances when address is set
  useBalances();
  const { ethBalance, usdcBalance } = useWalletStore();

  // --- UI for each step ---
  if (step === 'loading') {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Loading…</Text>
      </View>
    );
  }

  if (step === 'welcome') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Crypto Pal</Text>
        <Button
          title="Create New Wallet"
          onPress={async () => {
            try {
              const { address } = await createWallet();
              setAddress(address);
              setStep('backup');
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          }}
        />
        <View style={{ height: 12 }} />
        <Button
          title="Restore From Backup"
          onPress={() => setStep('restore')}
        />
      </View>
    );
  }

  if (step === 'backup') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Backup Phrase</Text>
        <Text selectable style={styles.phrase}>
          {mnemonic}
        </Text>
        <Text style={styles.subtitle}>
          Write down these 12 words in order and keep them safe.
        </Text>
        <Button
          title="I’ve backed it up — show my address"
          onPress={() => setStep('home')}
        />
      </ScrollView>
    );
  }

  if (step === 'restore') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Restore Wallet</Text>
        <Text style={styles.subtitle}>
          Paste your 12-word backup phrase below.
        </Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="word1 word2 … word12"
          value={inputPhrase}
          onChangeText={setInputPhrase}
        />
        <Button
          title="Restore Wallet"
          onPress={async () => {
            try {
              const words = inputPhrase.trim().split(/\s+/);
              if (words.length !== 12) {
                throw new Error('Please enter exactly 12 words.');
              }
              const { address } = await restoreWallet(inputPhrase);
              setAddress(address);
              setStep('home');
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          }}
        />
      </ScrollView>
    );
  }

  // step === 'home'
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your wallet address:</Text>
      <Text selectable style={styles.address}>
        {address}
      </Text>

      {/* Display live balances */}
      <Text style={styles.balanceLabel}>ETH Balance:</Text>
      <Text style={styles.balanceValue}>{ethBalance ?? '—'}</Text>

      <Text style={styles.balanceLabel}>USDC Balance:</Text>
      <Text style={styles.balanceValue}>{usdcBalance ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title:        { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  subtitle:     { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  phrase:       { fontSize: 18, lineHeight: 28, textAlign: 'center', marginVertical: 20 },
  address:      { fontSize: 14, marginTop: 8, textAlign: 'center' },
  input:        { width: '100%', minHeight: 80, borderColor: '#ccc', borderWidth: 1, padding: 10, marginBottom: 20 },
  balanceLabel: { marginTop: 20, fontSize: 16, fontWeight: 'bold' },
  balanceValue: { fontSize: 18, marginBottom: 8 },
});
