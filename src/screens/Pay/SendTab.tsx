// src/screens/SendTab.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useWalletStore } from '../../store/useWalletStore';
import { estimateGas, sendTransaction } from '../../utils/wallet'; // Updated for tx functions
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ETHERSCAN_BASE } from '@env'; // For explorer link
import AsyncStorage from '@react-native-async-storage/async-storage';  // Added for fiat storage

interface BalanceItem {
  contract_address: string;
  contract_ticker_symbol: string;
  // Add other properties as needed from your balances
}

const SendTab = () => {
  const { chainId, address: fromAddress } = useWalletStore(); // Added fromAddress
  const [toAddress, setToAddress] = useState('');
  const [selectedToken, setSelectedToken] = useState<BalanceItem | null>(null);
  const [amount, setAmount] = useState('');
  const [amountUnit, setAmountUnit] = useState('token'); // 'token', 'usd', 'nzd'
  const [feeEstimate, setFeeEstimate] = useState('Calculating...');
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [ethPriceUSD, setEthPriceUSD] = useState(2000); // Initial stub
  const [usdToNzd, setUsdToNzd] = useState(1.6); // Initial stub

  const chain = chainId === 1 ? 'ETH' : 'BSC'; // Determine chain

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const ethResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const ethData = await ethResponse.json();
        setEthPriceUSD(ethData?.ethereum?.usd || 2000);

        const nzdResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usdt&vs_currencies=nzd');
        const nzdData = await nzdResponse.json();
        setUsdToNzd(nzdData?.usdt?.nzd || 1.6);
      } catch (e) {
        console.error('Rate fetch error in SendTab:', e);
      }
    };
    fetchRates();
  }, []);

  const convertAmountToToken = (input: string) => {
    const numInput = parseFloat(input) || 0;
    let tokenAmount = 0;
    if (amountUnit === 'token') tokenAmount = numInput;
    if (amountUnit === 'usd') tokenAmount = numInput / ethPriceUSD;
    if (amountUnit === 'nzd') tokenAmount = numInput / (ethPriceUSD * usdToNzd);
    return tokenAmount.toFixed(18);  // Fix: Truncate to 18 decimals to avoid underflow error
  };

  useEffect(() => {
    if (showScanner && !permission?.granted) {
      console.log('Requesting camera permission');
      requestPermission();
    }
  }, [showScanner, permission, requestPermission]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    console.log('Scanned data:', data);
    setScanned(true);
    setShowScanner(false);
    if (isValidEthereumAddress(data)) { // Use regex for validation
      setToAddress(data);
      console.log('Valid address populated:', data);
    } else {
      Alert.alert('Invalid QR', 'Not a valid address.');
      console.log('Invalid address scanned');
    }
  };

  const isValidEthereumAddress = (address: string) => {
    return /^0x[0-9a-fA-F]{40}$/.test(address); // Simple regex for 0x + 40 hex chars
  };

  const handleScanQR = () => {
    console.log('SCAN QR button pressed');
    setShowScanner(true);
    setScanned(false);  // Reset scanned for new scan
  };

  useEffect(() => {
    if (!toAddress || !amount || !selectedToken) {
      setFeeEstimate('Enter details');
      return;
    }
    (async () => {
      try {
        const fee = await estimateGas(toAddress, convertAmountToToken(amount), selectedToken.contract_address, chain);
        const feeNzd = (parseFloat(fee) * ethPriceUSD * usdToNzd).toFixed(2); // Use real rates for fee
        setFeeEstimate(`~NZ$${feeNzd}`);
      } catch (error: any) {
        setFeeEstimate('Unable to estimate: ' + error.message);
      }
    })();
  }, [toAddress, amount, selectedToken, amountUnit, ethPriceUSD, usdToNzd, chain]);

  const resetFields = () => {
    setToAddress('');
    setSelectedToken(null);
    setAmount('');
    setAmountUnit('token');
    setFeeEstimate('Calculating...');
  };

  const handleSend = async () => {
    if (!toAddress || !amount) return Alert.alert('Error', 'Enter address and amount');

    let sendAmount = convertAmountToToken(amount);
    const displayAmount = amount;
    const displayUnit = amountUnit.toUpperCase();
    const tokenSymbol = selectedToken ? selectedToken.contract_ticker_symbol : (chain === 'ETH' ? 'ETH' : 'BNB');
    const nativeAmount = parseFloat(sendAmount).toFixed(4); // Approximate native for popup

    Alert.alert(
      'Warning',
      'Transactions are irreversible. Double check details.',
      [
        { text: 'Cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            Alert.alert(
              'Confirm Send',
              `Sending $${displayAmount} ${displayUnit} (${nativeAmount} ${tokenSymbol}) to ${toAddress}.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Send',
                  onPress: async () => {
                    setLoading(true);
                    try {
                      const hash = await sendTransaction(toAddress, sendAmount, selectedToken ? selectedToken.contract_address : null, chain);
                      Alert.alert(
                        'Success',
                        `Value: $${displayAmount} ${displayUnit} (${nativeAmount} ${tokenSymbol})\nStatus: Success\nFrom: ${fromAddress.slice(0, 6)}...${fromAddress.slice(-4)}\nTo: ${toAddress.slice(0, 6)}...${toAddress.slice(-4)}\nFee: 0.000000000000000021 ${tokenSymbol}`,
                      );

                      // Store frozen fiat snapshot for History (both sender and receiver can sync manually)
                      const txDetails = { amount: displayAmount, unit: displayUnit };
                      let storedDetails: Record<string, { amount: string; unit: string }> = {};  // Fix: Add Record type for TS
                      try {
                        const stored = await AsyncStorage.getItem('txDetails');
                        storedDetails = stored ? JSON.parse(stored) : {};
                      } catch (e) {}
                      storedDetails[hash] = txDetails;
                      await AsyncStorage.setItem('txDetails', JSON.stringify(storedDetails));

                      // P2P share snapshot to receiver (stub for MVP - Alert for now)
                      Alert.alert('Successful transaction!', `$${displayAmount} ${displayUnit} ${tokenSymbol} sent as requested.`);

                      resetFields(); // Reset fields after success
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
      ]
    );
  };

  const amountPlaceholder = amountUnit === 'token' ? 'Enter Crypto Amount' : amountUnit === 'usd' ? 'Enter USD Amount' : 'Enter NZD Amount';

  return (
    <View style={styles.container}>
      {/* Section 1: Send to... */}
      <View style={styles.section}>
        <Text style={styles.label}>Send to</Text>
        <View style={styles.addressRow}>
          <TextInput style={styles.input} placeholder="Wallet address of recipient" value={toAddress} onChangeText={setToAddress} />
          <Button title="SCAN QR" onPress={handleScanQR} color="#0A84FF" />
        </View>
      </View>

      {/* Section 2: What crypto... */}
      <View style={styles.section}>
        <Text style={styles.label}>What crypto currency would you like to send them</Text>
        <Picker selectedValue={selectedToken} onValueChange={setSelectedToken} style={styles.picker}>
          <Picker.Item label={chain === 'ETH' ? 'ETH' : 'BNB'} value={null} />
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
        <TextInput
          style={styles.amountInput}
          placeholder={amountPlaceholder}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />
        <Button title={`ESTIMATE FEE: $${feeEstimate}`} onPress={() => {}} disabled color="#ccc" />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={loading}>
          <Text style={styles.sendButtonText}>SEND</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator color="#0A84FF" />}
      </View>

      {/* QR Scanner Modal */}
      {showScanner && (
        <View style={styles.scannerContainer}>
          {permission?.granted ? (
            <>
              {!scanned && (
                <CameraView
                  style={styles.camera}  // Full screen camera
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                />
              )}
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowScanner(false)}>
                <Text style={styles.closeText}>Close Scanner</Text>
              </TouchableOpacity>
              {scanned && (
                <TouchableOpacity style={styles.scanAgainButton} onPress={() => setScanned(false)}>
                  <Text>Scan Again</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text>No camera access. Check settings.</Text>
          )}
        </View>
      )}

      {/* Centered Loading Overlay */}
      <Modal visible={loading} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <ActivityIndicator size="large" color="#0A84FF" />
        </View>
      </Modal>
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
  unitButton: { padding: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginHorizontal: 5 },
  unitButtonActive: { padding: 8, backgroundColor: '#0A84FF', borderRadius: 4, marginHorizontal: 5 },
  unitText: { color: '#0A84FF', fontWeight: 'bold' },
  unitTextActive: { color: '#fff', fontWeight: 'bold' },
  amountInput: { borderWidth: 1, padding: 8, borderColor: '#ddd', borderRadius: 4, height: 40 }, // Slimmer height
  sendButton: { backgroundColor: '#0A84FF', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  scannerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },  // Full screen modal
  camera: { flex: 1, width: '100%' },  // Full screen camera
  closeButton: { position: 'absolute', top: 40, right: 20, backgroundColor: 'white', padding: 10, borderRadius: 5 },
  closeText: { color: 'black' },
  scanAgainButton: { backgroundColor: 'white', padding: 10, borderRadius: 5, marginTop: 20 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' }, // Centered overlay
});

export default SendTab;