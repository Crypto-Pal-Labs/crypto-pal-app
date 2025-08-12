import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useWalletStore } from '../../store/useWalletStore';
import { useBalances } from '../../hooks/useBalances';
import { ethers } from 'ethers';
import { getSavedMnemonic } from '../../utils/wallet';
import { ETH_RPC_URL, BSC_RPC_URL } from '@env';

const SendTab = () => {
  const { chainId } = useWalletStore();
  const { balances } = useBalances();
  const [toAddress, setToAddress] = useState('');
  const [selectedToken, setSelectedToken] = useState('native');
  const [amount, setAmount] = useState('');
  const [amountUnit, setAmountUnit] = useState('token'); // 'token', 'usd', 'nzd'
  const [feeEstimate, setFeeEstimate] = useState('Calculating...');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const estimateFee = async () => {
      try {
        const rpc = chainId === 1 ? ETH_RPC_URL : BSC_RPC_URL;
        const provider = new ethers.JsonRpcProvider(rpc);
        const gasPrice = await provider.getGasPrice();
        const gasLimit = 21000;
        const feeEth = ethers.formatEther(gasPrice * BigInt(gasLimit));
        const feeNzd = (parseFloat(feeEth) * 1500 * 1.6).toFixed(2);
        setFeeEstimate(`~NZ$${feeNzd}`);
      } catch {
        setFeeEstimate('Unable to estimate');
      }
    };
    estimateFee();
  }, [chainId, selectedToken]);

  const handleSend = async () => {
    if (!toAddress || !amount) return Alert.alert('Error', 'Enter address and amount');

    let sendAmount = amount;
    if (amountUnit !== 'token') {
      // Simplified conversion; add real CoinGecko fetch for accuracy
      const tokenPriceUsd = selectedToken === 'native' ? 1500 : 1; // ETH ~1500 USD, USDT ~1
      const usdToNzd = 1.6;
      const tokenPrice = amountUnit === 'usd' ? tokenPriceUsd : tokenPriceUsd * usdToNzd;
      sendAmount = (parseFloat(amount) / tokenPrice).toString();
    }

    Alert.alert('Warning', 'Transactions are irreversible. Double-check details.', [
      { text: 'Cancel' },
      {
        text: 'Confirm',
        onPress: () => {
          Alert.alert(
            'Confirm Send',
            `Sending ${sendAmount} ${selectedToken === 'native' ? (chainId === 1 ? 'ETH' : 'BNB') : 'Token'} to ${toAddress}.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Send',
                onPress: async () => {
                  setLoading(true);
                  try {
                    const mnemonic = await getSavedMnemonic();
                    if (!mnemonic) throw new Error('No wallet');

                    const rpc = chainId === 1 ? ETH_RPC_URL : BSC_RPC_URL;
                    const provider = new ethers.JsonRpcProvider(rpc);
                    const wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider);

                    let tx;
                    if (selectedToken === 'native') {
                      tx = await wallet.sendTransaction({
                        to: toAddress,
                        value: ethers.parseEther(sendAmount),
                      });
                    } else {
                      const tokenContract = new ethers.Contract(selectedToken, ['function transfer(address to, uint amount)'], wallet);
                      tx = await tokenContract.transfer(toAddress, ethers.parseUnits(sendAmount, 18));
                    }
                    Alert.alert('Success', `Tx: ${tx.hash}`);
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
      <TextInput style={styles.input} placeholder="Wallet address of recipient" value={toAddress} onChangeText={setToAddress} />
      <Text style={styles.label}>What crypto currency would you like to send ...</Text>
      <Picker selectedValue={selectedToken} onValueChange={setSelectedToken} style={styles.picker}>
        <Picker.Item label={chainId === 1 ? 'ETH' : 'BNB'} value="native" />
        {balances.map((item) => (
          <Picker.Item key={item.contract_address} label={item.contract_address.slice(0, 6)} value={item.contract_address} />
        ))}
      </Picker>
      <View style={styles.toggleRow}>
        <Button title="TOKEN" onPress={() => setAmountUnit('token')} color={amountUnit === 'token' ? '#0A84FF' : '#ccc'} />
        <Button title="USD" onPress={() => setAmountUnit('usd')} color={amountUnit === 'usd' ? '#0A84FF' : '#ccc'} />
        <Button title="NZD" onPress={() => setAmountUnit('nzd')} color={amountUnit === 'nzd' ? '#0A84FF' : '#ccc'} />
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
  label: { fontSize: 16, marginBottom: 8, fontWeight: 'bold' },
  input: { borderWidth: 1, marginBottom: 16, padding: 8, borderColor: '#ddd' },
  picker: { marginBottom: 16 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
});

export default SendTab;