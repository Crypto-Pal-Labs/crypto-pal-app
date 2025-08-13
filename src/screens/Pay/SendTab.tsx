import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useWalletStore } from '../../store/useWalletStore';
import { useBalances } from '../../hooks/useBalances';
import { ethers } from 'ethers';
import { getSavedMnemonic, getWalletSigner } from '../../utils/wallet';
import { ETH_RPC_URL, BSC_RPC_URL, ETHERSCAN_BASE } from '@env';

const SendTab = () => {
  const { chainId } = useWalletStore();
  const { balances } = useBalances();
  const [toAddress, setToAddress] = useState('');
  const [selectedToken, setSelectedToken] = useState('native');
  const [amount, setAmount] = useState('');
  const [amountUnit, setAmountUnit] = useState('token'); // 'token', 'usd', 'nzd'
  const [feeEstimate, setFeeEstimate] = useState('Calculating...');
  const [loading, setLoading] = useState(false);

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
      try {
        const signer = await getWalletSigner(chainId === 1 ? 'ETH' : 'BSC');
        let tx = { to: toAddress, value: ethers.parseEther(convertAmountToToken(amount).toString()) };
        if (selectedToken !== 'native') {
          const erc20Abi = ['function transfer(address,uint256) returns (bool)'];
          const contract = new ethers.Contract(selectedToken, erc20Abi, signer);
          tx.data = contract.interface.encodeFunctionData('transfer', [toAddress, ethers.parseUnits(convertAmountToToken(amount).toString(), 18)]);
          tx.value = 0;
        }
        const gasEstimate = await signer.estimateGas(tx);
        const gasPrice = await signer.provider.getGasPrice();
        const feeEth = ethers.formatEther(gasEstimate * gasPrice);
        const feeNzd = (parseFloat(feeEth) * 1500 * 1.6).toFixed(2);
        setFeeEstimate(`~NZ$${feeNzd}`);
      } catch (error) {
        setFeeEstimate('Unable to estimate: ' + error.message);
      }
    };
    if (toAddress && amount) estimateFee();
  }, [chainId, selectedToken, toAddress, amount]);

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
            `Sending ${sendAmount} ${selectedToken === 'native' ? (chainId === 1 ? 'ETH' : 'BNB') : 'Token'} to ${toAddress}.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Send',
                onPress: async () => {
                  setLoading(true);
                  try {
                    const signer = await getWalletSigner(chainId === 1 ? 'ETH' : 'BSC');

                    let tx;
                    if (selectedToken === 'native') {
                      tx = await signer.sendTransaction({
                        to: toAddress,
                        value: ethers.parseEther(sendAmount),
                      });
                    } else {
                      const tokenContract = new ethers.Contract(selectedToken, ['function transfer(address to, uint amount)'], signer);
                      tx = await tokenContract.transfer(toAddress, ethers.parseUnits(sendAmount, 18));
                    }
                    Alert.alert('Success', `Tx: ${tx.hash}\nView on Explorer: ${ETHERSCAN_BASE}/tx/${tx.hash}`);
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
  addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, padding: 8, borderColor: '#ddd', marginRight: 8 },
  label: { fontSize: 16, marginBottom: 8, fontWeight: 'bold' },
  picker: { marginBottom: 16 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
});

export default SendTab;