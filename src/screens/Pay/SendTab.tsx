// src/screens/PayTabs/SendTab.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useWalletStore } from '../../store/useWalletStore';
import { useBalancesEx } from '../../hooks/useBalances';
import { estimateGas, sendTransaction } from '../../utils/wallet';
import { ETH_RPC_URL, BSC_RPC_URL, ETHERSCAN_BASE } from '@env';
import { Ionicons } from '@expo/vector-icons'; // For QR icon
import { useTokenPrice } from '../../hooks/useTokenPrice'; // For live prices

const SendTab = () => {
  const { chainId } = useWalletStore();
  const [balances, refreshBalances] = useBalancesEx();
  const [toAddress, setToAddress] = useState('');
  const [selectedToken, setSelectedToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [amountUnit, setAmountUnit] = useState('usd'); // Default to USD
  const [feeEstimate, setFeeEstimate] = useState('Calculating...');
  const [loading, setLoading] = useState(false);
  const [availableUnits, setAvailableUnits] = useState(['token', 'usd', 'nzd']);

  const chain = chainId === 1 ? 'ETH' : 'BSC';

  const tokenSymbol = selectedToken ? selectedToken.symbol : 'ETH'; // Default to ETH if no token selected
  const { prices, localCurrency } = useTokenPrice(tokenSymbol);

  useEffect(() => {
    if (localCurrency && !availableUnits.includes(localCurrency)) {
      setAvailableUnits((prev) => [...prev, localCurrency]);
    }
  }, [localCurrency]);

  const convertAmountToToken = (input) => {
    const parsed = parseFloat(input) || 0;
    if (amountUnit === 'token') return parsed;
    const price = prices[amountUnit] || 0;
    return price > 0 ? parsed / price : 0;
  };

  const handleScanQR = () => {
    Alert.alert('QR Scan Coming Soon', 'This will open the camera to scan recipient QR code and auto-fill the address.');
  };

  useEffect(() => {
    const estimateFee = async () => {
      if (!toAddress || !amount || !selectedToken) {
        setFeeEstimate('Enter details');
        return;
      }
      try {
        const fee = await estimateGas(toAddress, convertAmountToToken(amount).toString(), selectedToken.contract_address, chain);
        const feeUsd = (parseFloat(fee) * (prices['usd'] || 0)).toFixed(2);
        setFeeEstimate(`${fee} ETH (~$${feeUsd} USD)`);
      } catch (err) {
        setFeeEstimate('Error estimating fee');
      }
    };
    estimateFee();
  }, [toAddress, amount, selectedToken, prices, amountUnit]);

  const handleSend = async () => {
    if (!toAddress || !amount || !selectedToken) {
      Alert.alert('Missing fields', 'Please fill all fields.');
      return;
    }
    setLoading(true);
    try {
      const txHash = await sendTransaction(toAddress, convertAmountToToken(amount).toString(), selectedToken.contract_address, chain);
      Alert.alert('Transaction sent', `Hash: ${txHash}\nView on explorer: ${ETHERSCAN_BASE}/tx/${txHash}`);
      refreshBalances();
    } catch (err) {
      Alert.alert('Send failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const amountPlaceholder = amountUnit === 'token' ? 'Enter amount in token' : `Enter amount in ${amountUnit.toUpperCase()}`;

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Send to...</Text>
        <View style={styles.addressRow}>
          <TextInput style={styles.input} placeholder="Recipient address" value={toAddress} onChangeText={setToAddress} />
          <TouchableOpacity onPress={handleScanQR}>
            <Ionicons name="scan" size={24} color="#0A84FF" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>What crypto...</Text>
        <Picker selectedValue={selectedToken?.contract_address} onValueChange={(addr) => setSelectedToken(balances.find((b) => b.contract_address === addr) || null)}>
          <Picker.Item label="Select token" value={null} />
          {balances.map((item) => (
            <Picker.Item key={item.contract_address} label={`${item.symbol} (${item.balance})`} value={item.contract_address} />
          ))}
        </Picker>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>How much...</Text>
        <View style={styles.unitRow}>
          {availableUnits.map((unit) => (
            <TouchableOpacity key={unit} style={amountUnit === unit ? styles.unitButtonActive : styles.unitButton} onPress={() => setAmountUnit(unit)}>
              <Text style={amountUnit === unit ? styles.unitTextActive : styles.unitText}>{unit.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.amountInput} placeholder={amountPlaceholder} value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Button title={`ESTIMATE FEE: ${feeEstimate}`} onPress={() => {}} disabled color="#ccc" />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={loading}>
          <Text style={styles.sendButtonText}>SEND</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator color="#0A84FF" />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  section: { marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 16 },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  addressRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, padding: 8, borderColor: '#ddd', marginRight: 8, borderRadius: 4 },
  picker: { borderWidth: 1, borderColor: '#ddd', borderRadius: 4 },
  unitRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  unitButton: { padding: 8, backgroundColor: '#f0f0f0', borderRadius: 4 },
  unitButtonActive: { padding: 8, backgroundColor: '#0A84FF', borderRadius: 4 },
  unitText: { color: '#0A84FF', fontWeight: 'bold' },
  unitTextActive: { color: '#fff', fontWeight: 'bold' },
  amountInput: { borderWidth: 1, padding: 8, borderColor: '#ddd', borderRadius: 4, height: 40 }, // Slimmer height
  sendButton: { backgroundColor: '#0A84FF', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export default SendTab;