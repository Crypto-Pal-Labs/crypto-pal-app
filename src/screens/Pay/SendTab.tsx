import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useWalletStore } from '../../store/useWalletStore';
import { useBalancesEx } from '../../hooks/useBalances'; // Updated for refresh
import { estimateGas, sendTransaction } from '../../utils/wallet'; // Updated for tx functions
import { ETH_RPC_URL, BSC_RPC_URL, ETHERSCAN_BASE } from '@env';
import { Camera } from 'expo-camera';

const SendTab = () => {
  const { chainId } = useWalletStore();
  const [balances, refreshBalances] = useBalancesEx(); // Updated for refresh
  const [toAddress, setToAddress] = useState('');
  const [selectedToken, setSelectedToken] = useState(null); // Updated to null, select from balances
  const [amount, setAmount] = useState('');
  const [amountUnit, setAmountUnit] = useState('token'); // 'token', 'usd', 'nzd'
  const [feeEstimate, setFeeEstimate] = useState('Calculating...');
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const chain = chainId === 1 ? 'ETH' : 'BSC'; // Determine chain

  const convertAmountToToken = (input) => {
    if (amountUnit === 'token') return parseFloat(input) || 0;
    const ethPriceUSD = 2000; // Stub; replace with real from useEthPrice.ts later
    const usdToNzdRate = 1.6;
    if (amountUnit === 'usd') return input / ethPriceUSD;
    if (amountUnit === 'nzd') return input / (ethPriceUSD * usdToNzdRate);
    return 0;
  };

  useEffect(() => {
    if (showScanner) {
      (async () => {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
      })();
    }
  }, [showScanner]);

  const handleBarCodeScanned = ({ data }) => {
    setScanned(true);
    setShowScanner(false);
    if (ethers.utils.isAddress(data)) {
      setToAddress(data);
    } else {
      Alert.alert('Invalid QR', 'Not a valid address.');
    }
  };

  const handleScanQR = () => {
    setShowScanner(true);
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

  const amountPlaceholder = amountUnit === 'token' ? 'Enter Crypto Amount' : amountUnit === 'usd' ? 'Enter $USD Amount' : 'Enter $NZD Amount';

  return (
    <View style={styles.container}>
      {/* Section 1: Send to... */}
      <View style={styles.section}>
        <Text style={styles.label}>Send to ...</Text>
        <View style={styles.addressRow}>
          <TextInput style={styles.input} placeholder="Wallet address of recipient" value={toAddress} onChangeText={setToAddress} />
          <Button title="SCAN QR" onPress={handleScanQR} color="#0A84FF" />
        </View>
      </View>

      {/* Section 2: What crypto... */}
      <View style={styles.section}>
        <Text style={styles.label}>What crypto currency would you like to send them ...</Text>
        <Picker selectedValue={selectedToken} onValueChange={setSelectedToken} style={styles.picker}>
          <Picker.Item label={chain === 'ETH' ? 'ETH' : 'BNB'} value={null} />
          {balances.map((item) => (
            <Picker.Item key={item.contract_address} label={item.contract_ticker_symbol} value={item} />
          ))}
        </Picker>
      </View>

      {/* Section 3: How much... */}
      <View style={styles.section}>
        <View style={styles.unitRow}>
          <TouchableOpacity style={amountUnit === 'token' ? styles.unitButtonActive : styles.unitButton} onPress={() => setAmountUnit('token')}>
            <Text style={amountUnit === 'token' ? styles.unitTextActive : styles.unitText}>TOKEN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={amountUnit === 'usd' ? styles.unitButtonActive : styles.unitButton} onPress={() => setAmountUnit('usd')}>
            <Text style={amountUnit === 'usd' ? styles.unitTextActive : styles.unitText}>USD</Text>
          </TouchableOpacity>
          <TouchableOpacity style={amountUnit === 'nzd' ? styles.unitButtonActive : styles.unitButton} onPress={() => setAmountUnit('nzd')}>
            <Text style={amountUnit === 'nzd' ? styles.unitTextActive : styles.unitText}>NZD</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={styles.amountInput} placeholder={amountPlaceholder} value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Button title={`ESTIMATE FEE: ${feeEstimate}`} onPress={() => {}} disabled color="#ccc" />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={loading}>
          <Text style={styles.sendButtonText}>SEND</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator color="#0A84FF" />}
      </View>

      {/* QR Scanner View */}
      {showScanner && hasPermission && !scanned && (
        <Camera
          style={{ height: 300, width: '100%' }}
          onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
          barCodeScannerSettings={{ barCodeTypes: ['qr'] }}
        />
      )}
      {scanned && <TouchableOpacity onPress={() => setScanned(false)}><Text>Scan Again</Text></TouchableOpacity>}
      {hasPermission === false && <Text>No camera access.</Text>}
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