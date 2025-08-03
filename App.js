// App.js
import 'react-native-get-random-values';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  TextInput,
  ScrollView,
} from 'react-native';
import {
  generateAndStoreWallet,
  getStoredAddress,
  getStoredMnemonic,
  restoreWalletFromMnemonic,
} from './src/services/WalletService';

export default function App() {
  const [step, setStep] = useState('loading');      // no TS types here
  const [address, setAddress] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [inputPhrase, setInputPhrase] = useState('');
  const [error, setError] = useState('');

  // 1) On startup, check for existing wallet
  useEffect(() => {
    (async () => {
      try {
        const storedAddr = await getStoredAddress();
        if (storedAddr) {
          setAddress(storedAddr);
          setStep('home');
        } else {
          setStep('welcome');
        }
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  // 2) When we hit the backup screen, load the mnemonic
  useEffect(() => {
    if (step === 'backup') {
      (async () => {
        const m = await getStoredMnemonic();
        setMnemonic(m || '');
      })();
    }
  }, [step]);

  // Error page
  if (error && step !== 'loading') {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Error: {error}</Text>
      </View>
    );
  }

  // Welcome screen
  if (step === 'welcome') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Crypto Pal</Text>
        <Button
          title="Create New Wallet"
          onPress={async () => {
            try {
              const { address: addr } = await generateAndStoreWallet();
              setAddress(addr);
              setStep('backup');
            } catch (e) {
              setError(e.message);
            }
          }}
        />
        <View style={{ height: 12 }} />
        <Button title="Restore From Backup" onPress={() => setStep('restore')} />
      </View>
    );
  }

  // Backup screen
  if (step === 'backup') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Backup Phrase</Text>
        <Text style={styles.phrase}>{mnemonic}</Text>
        <Text style={styles.subtitle}>
          Write down these 24 words in order and keep them safe.
        </Text>
        <Button
          title="I’ve backed it up—show my address"
          onPress={() => setStep('home')}
        />
      </ScrollView>
    );
  }

  // Restore screen
  if (step === 'restore') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Restore Wallet</Text>
        <Text style={styles.subtitle}>
          Paste your 24-word backup phrase below.
        </Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="word1 word2 … word24"
          value={inputPhrase}
          onChangeText={setInputPhrase}
        />
        <Button
          title="Restore Wallet"
          onPress={async () => {
            try {
              const words = inputPhrase.trim().split(/\s+/);
              if (words.length !== 24) {
                throw new Error('Please enter exactly 24 words.');
              }
              const addr = await restoreWalletFromMnemonic(inputPhrase);
              setAddress(addr);
              setStep('home');
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      </ScrollView>
    );
  }

  // Home screen
  if (step === 'home') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your wallet address:</Text>
        <Text style={styles.address}>{address}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  // Loading
  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Loading…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, padding:20, alignItems:'center', justifyContent:'center' },
  title:     { fontSize:24, fontWeight:'bold', marginBottom:12 },
  subtitle:  { fontSize:16, textAlign:'center', marginBottom:20 },
  phrase:    { fontSize:18, lineHeight:28, textAlign:'center', marginVertical:20 },
  address:   { fontSize:14, marginTop:8, textAlign:'center' },
  input:     { width:'100%', minHeight:80, borderColor:'#ccc', borderWidth:1, padding:10, marginBottom:20 },
  error:     { color:'red', textAlign:'center', padding:20 },
});

