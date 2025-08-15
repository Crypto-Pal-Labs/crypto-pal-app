import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useWalletStore } from '../../store/useWalletStore';
import { useBalancesEx } from '../../hooks/useBalances'; // Updated for refresh
import { estimateGas, sendTransaction } from '../../utils/wallet'; // Updated for tx functions
import { ETH_RPC_URL, BSC_RPC_URL, ETHERSCAN_BASE } from '@env';

const SendTab = () => {
  const { chainId } = useWalletStore();
  const [balances, refreshBalances] = useBalancesEx(); // Updated for refresh
  const [toAddress, setToAddress] = useState('');
  const [selectedToken, setSelectedToken] = useState(null); // Updated to null, select from balances
  const [amount, setAmount] = useState('');
  const [amountUnit, setAmountUnit] = useState('token'); // 'token', 'usd', 'nzd'
  const [feeEstimate, setFeeEstimate] = useState('Calculating...');
  const [loading, setLoading] = useState(false);

  const chain = chainId === 1 ? 'ETH' : 'BSC'; // Determine chain

  const convertAmountToToken = (input) => {
    if (amountUnit === 'token') return parseFloat(input) || 0;
    const ethPriceUSD = 2000; // Stub; replace with real from useEthPrice.ts later
    const usdToNzdRate = 1.6;
    if (amountUnit === 'usd') return input / ethPriceUSD;
    if (amountUnit === 'nzd') return input / (ethPriceUSD * usdToNzdRate);
    return 0;
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
        const feeNzd = (parseFloat(fee) * 1500 * 1.6).toFixed(2); // Stub conversion
        setFeeEstimate(`~NZ$${feeNzd}`);
      } catch (error) {
        setFeeEstimate('Unable to estimate: ' + error.message);
      }
    };
    estimateFee();
  }, [toAddress, amount, selectedToken, amountUnit, chain]);

  const handleSend = async () => {
    if (!toAddress || !amount) return Alert.alert('Error', 'Enter address and amount');

    let sendAmount = convertAmountToToken(amount).toString();

    Alert.alert('Warning', 'Transactions are irreversible. Double-check details.', [
      { text: 'Cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          Alert.alert(
            'Confirm Send',
            `Sending ${sendAmount} ${selectedToken ? selectedToken.contract_ticker_symbol : (chain === 'ETH' ? 'ETH' : 'BNB')} to ${toAddress}.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Send',
                onPress: async () => {
                  setLoading(true);
                  try {
                    const hash = await sendTransaction(toAddress, sendAmount, selectedToken ? selectedToken.contract_address : null, chain);
                    Alert.alert('Success', `Tx: ${hash}\nView on Explorer: ${ETHERSCAN_BASE}/tx/${hash}`);
                    refreshBalances(); // Refresh balances after send
                  } catch (err: any) {
                    Alert.alert('Error', err.message);
                  } finally {
                    setLoading(false);
                  }
                },
              },
            ]
          );
        },
      },
    ]);
  };

  const amountPlaceholder = amountUnit === 'token' ? 'Enter Crypto Amount' : amountUnit === 'usd' ? 'Enter USD Amount' : 'Enter NZD Amount';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send to ...</Text>
      <View style={styles.addressRow}>
        <TextInput style={styles.input} placeholder="Wallet address of recipient" value={toAddress} onChangeText={setToAddress} />
        <Button title="Scan QR" onPress={handleScanQR} />
      </View>
      <Text style={styles.label}>What crypto currency would you like to send ...</Text>
      <Picker selectedValue={selectedToken} onValueChange={setSelectedToken} style={styles.picker}>
        <Picker.Item label={chain === 'ETH' ? 'ETH' : 'BNB'} value={null} />
        {balances.map((item) => (
          <Picker.Item key={item.contract_address} label={item.contract_ticker_symbol} value={item} />
        ))}
      </Picker>
      <View style={styles.toggleRow}>
        <Button title="TOKEN" onPress={() => setAmountUnit('token')} color={amountUnit === 'token' ? '#0A84FF' : '#ccc'} />
        <Button title="USD" onPress={() => setAmountUnit('usd')} color={amountUnit === 'usd' ? '#0A84FF' : '#ccc'} />
        <Button title="NZD" onPress () => setAmountUnit('nzd') } color={amountUnit === 'nzd' ? '#0A84FF' : '#ccc'} />
      </View>
      <TextInput style={styles.input} placeholder={amountPlaceholder} value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Button title={`Estimate Fee: ${feeEstimate}`} onPress={() => {}} disabled />
      <Button title="Send" onPress={handleSend} disabled={loading} />
      {loading && <ActivityIndicator />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, padding: 8, borderColor: '#ddd', marginRight: 8 },
  label: { fontSize: 16, marginBottom: 8, fontWeight: 'bold' },
  picker: { marginBottom: 16 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
});

export default SendTab;