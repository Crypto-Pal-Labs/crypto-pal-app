// src/screens/Pay/ScanTab.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  sendTransaction,
  sendERC20Transaction,
} from '../../utils/wallet';
import { useTokenPrice } from '../../hooks/useTokenPrice';

// Extend this list as you add more tokens
const TOKEN_OPTIONS = [
  { label: 'ETH', value: 'ETH' },
  { label: 'USDC', value: 'USDC' },
];

// Token decimals for ERC-20 sends
const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  USDC: 6,
};

export default function ScanTab() {
  const [token, setToken]         = useState<'ETH'|'USDC'>('ETH');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount]       = useState('');
  const [fiatAmount, setFiatAmount] = useState('');
  const [sending, setSending]     = useState(false);

  // NZD price for the selected token
  const price = useTokenPrice(token);

  // Sync: whenever "amount" or price changes, update NZD
  useEffect(() => {
    if (price === null) return;
    const amt = parseFloat(amount);
    if (!isNaN(amt)) {
      setFiatAmount((amt * price).toFixed(2));
    }
  }, [amount, price]);

  // Sync: whenever "fiatAmount" or price changes, update token amount
  useEffect(() => {
    if (price === null) return;
    const nz = parseFloat(fiatAmount);
    if (!isNaN(nz)) {
      // display up to 6 decimals for tokens
      setAmount((nz / price).toFixed(6));
    }
  }, [fiatAmount, price]);

  const handleSend = async () => {
    if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
      return Alert.alert('Invalid address', 'Enter a valid 0x… address');
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return Alert.alert('Invalid amount', `Enter a valid ${token} amount`);
    }

    try {
      setSending(true);
      let hash: string;

      if (token === 'ETH') {
        // ETH uses parseEther internally
        hash = await sendTransaction(toAddress.trim(), amount.trim());
      } else {
        // ERC-20 send
        const decimals = TOKEN_DECIMALS[token];
        // Example uses mainnet USDC address; replace per-token as needed
        const tokenAddress =
          token === 'USDC'
            ? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
            : '';
        hash = await sendERC20Transaction(
          tokenAddress,
          toAddress.trim(),
          amount.trim(),
          decimals
        );
      }

      Alert.alert('Transaction sent', `Hash:\n${hash}`);
      setToAddress('');
      setAmount('');
      setFiatAmount('');
    } catch (e: any) {
      Alert.alert('Send failed', e.message);
    } finally {
      setSending(false);
    }
  };

  if (price === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text>Loading {token} price…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding' })}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>Recipient Address</Text>
        <TextInput
          style={styles.input}
          placeholder="0xabc123…"
          value={toAddress}
          onChangeText={setToAddress}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Token</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={token}
            onValueChange={v => setToken(v as 'ETH'|'USDC')}
            mode="dropdown"
          >
            {TOKEN_OPTIONS.map(o => (
              <Picker.Item key={o.value} label={o.label} value={o.value} />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Amount ({token})</Text>
        <TextInput
          style={styles.input}
          placeholder={token === 'ETH' ? 'e.g. 0.05' : 'e.g. 100'}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Amount (NZD)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 45.00"
          value={fiatAmount}
          onChangeText={setFiatAmount}
          keyboardType="decimal-pad"
        />

        {sending ? (
          <ActivityIndicator size="large" style={{ marginTop: 20 }} />
        ) : (
          <Button title="Send" onPress={handleSend} />
        )}

        <Text style={styles.note}>
          {`(1 ${token} ≈ NZD$${price.toFixed(2)})`}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1 },
  container: { padding: 20, justifyContent: 'center' },
  loading:   { flex:1, alignItems:'center', justifyContent:'center' },
  label:     { marginBottom: 6, fontSize: 16, fontWeight: '500' },
  input:     {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 4,
    marginBottom: 20,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    marginBottom: 20,
    overflow: 'hidden',
  },
  note:      { marginTop: 12, textAlign: 'center', color: '#666' },
});


