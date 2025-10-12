import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Button, Alert, StyleSheet,
  ActivityIndicator, TouchableOpacity, Modal, Linking
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useWalletStore } from '../../store/useWalletStore';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ethers from 'ethers';
import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';

// EAS-safe config
import { getExtra } from '../../config/extra';

interface BalanceItem {
  contract_address: string;
  contract_ticker_symbol: string;
}

const SEPOLIA = { name: 'sepolia', chainId: 11155111 };
const DEFAULT_SEPOLIA_RPC = 'https://rpc.sepolia.org';
const DEFAULT_SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
const TOKEN_SYMBOL = 'ETH';

// ---- fast-fee constants/helpers ----
const FEE_TIMEOUT_MS = 1500; // tighter timeout to feel snappy
const FALLBACK_GAS_LIMIT = ethers.BigNumber.from(65000);
const FALLBACK_GAS_PRICE = ethers.utils.parseUnits('2', 'gwei'); // safe small default

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let settled = false;
  return new Promise(async (resolve) => {
    const t = setTimeout(() => {
      if (!settled) resolve(onTimeout());
    }, ms);
    try {
      const v = await p;
      settled = true;
      clearTimeout(t);
      resolve(v);
    } catch {
      settled = true;
      clearTimeout(t);
      resolve(onTimeout());
    }
  });
}

async function getQuickFeeData(provider: ethers.providers.Provider) {
  // Prefer EIP-1559 maxFeePerGas; fall back to legacy gasPrice
  const fd = await withTimeout(
    (provider as any).getFeeData?.() ?? Promise.reject(null),
    FEE_TIMEOUT_MS,
    () => ({ maxFeePerGas: null, gasPrice: FALLBACK_GAS_PRICE })
  );
  const gasPrice = (fd.maxFeePerGas ?? fd.gasPrice ?? FALLBACK_GAS_PRICE) as ethers.BigNumber;
  return { gasPrice };
}

// ---- format + UI helpers ----
const maskAddr = (a: string) =>
  (a?.startsWith('0x') && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

const fmt = (n: number, dp = 6) =>
  Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/,'').replace(/\.$/,'') : '…';

const SendTab = () => {
  const { address: fromAddress } = useWalletStore();
  const [toAddress, setToAddress] = useState('');
  const [selectedToken, setSelectedToken] = useState<BalanceItem | null>(null);
  const [amount, setAmount] = useState('');
  const [amountUnit, setAmountUnit] = useState<'token' | 'usd' | 'local'>('token');

  // Fee preview (inline)
  const [feeEstimate, setFeeEstimate] = useState('Enter details'); // e.g. "~0.00042 ETH"
  const [gasPrice, setGasPrice] = useState<ethers.BigNumber | null>(null);
  const [gasEstimate, setGasEstimate] = useState<ethers.BigNumber | null>(null);

  // Blocking/spinner during the Step-3 fee confirmation
  const [estimatingNow, setEstimatingNow] = useState(false);

  // Send flow
  const [loading, setLoading] = useState(false);

  // Camera
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Prices for amount conversion
  const [ethPriceUSD, setEthPriceUSD] = useState(2000);
  const deviceCurrencyCode = Localization.getLocales()?.[0]?.currencyCode || 'USD'; // e.g., NZD, AUD, EUR
  const localCode = deviceCurrencyCode.toUpperCase();
  const localVsParam = localCode.toLowerCase(); // for CoinGecko vs_currencies
  const [usdToLocal, setUsdToLocal] = useState(1); // USD -> Local multiplier

  const EXTRA = getExtra();
  const RPC_URL = (EXTRA?.ETH_RPC_URL as string) || DEFAULT_SEPOLIA_RPC;
  const EXPLORER_BASE = (EXTRA?.ETHERSCAN_BASE as string) || DEFAULT_SEPOLIA_EXPLORER;

  // ---- helpers ----
  const normalizeAddress = (raw: string) => {
    const trimmed = raw.trim();
    if (/^[0-9a-fA-F]{40}$/.test(trimmed)) return `0x${trimmed}`;
    return trimmed;
  };
  const isValidEthereumAddress = (address: string) => /^0x[0-9a-fA-F]{40}$/.test(address);

  const convertAmountToToken = (input: string) => {
    const numInput = parseFloat(input) || 0;
    let tokenAmount = 0;
    if (amountUnit === 'token') tokenAmount = numInput;
    if (amountUnit === 'usd')   tokenAmount = numInput / ethPriceUSD;
    if (amountUnit === 'local') tokenAmount = numInput / (ethPriceUSD * usdToLocal);
    return tokenAmount.toFixed(18);
  };

  const makeProvider = () => new ethers.providers.StaticJsonRpcProvider(RPC_URL, SEPOLIA);

  const getSigner = async () => {
    const mnemonic = await SecureStore.getItemAsync('mnemonic');
    if (!mnemonic) throw new Error('No mnemonic found—cannot sign transaction.');
    const wallet = ethers.Wallet.fromMnemonic(mnemonic);
    return wallet.connect(makeProvider());
  };

  // ---- effects ----
  useEffect(() => {
    // Fetch ETH price in USD (for USD conversion) and USD->Local (via USDT→local)
    const fetchRates = async () => {
      try {
        // ETH → USD
        const ethResp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd`);
        const ethData = await ethResp.json();
        setEthPriceUSD(ethData?.ethereum?.usd || 2000);

        // USD → Local via USDT in local currency (acts as approx USD->local)
        const localResp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=usdt&vs_currencies=${localVsParam}`);
        const localData = await localResp.json();
        const maybeLocal = Number(localData?.usdt?.[localVsParam]);
        setUsdToLocal(Number.isFinite(maybeLocal) && maybeLocal > 0 ? maybeLocal : 1);
      } catch {
        setUsdToLocal(1);
      }
    };
    fetchRates();
  }, [localVsParam]);

  useEffect(() => {
    if (showScanner && !permission?.granted) requestPermission();
  }, [showScanner, permission, requestPermission]);

  // Pre-calc fee preview — fast, non-blocking, TOKEN ONLY
  useEffect(() => {
    const candidate = normalizeAddress(toAddress);
    if (!candidate || !amount || !selectedToken) {
      setFeeEstimate('Enter details');
      return;
    }
    if (!isValidEthereumAddress(candidate)) {
      setFeeEstimate('Invalid recipient');
      return;
    }

    setFeeEstimate('Calculating…');

    (async () => {
      try {
        const signer = await getSigner();
        const provider = signer.provider!;
        const value = ethers.utils.parseEther(convertAmountToToken(amount));

        // race both calls with a timeout and defaults
        const [{ gasPrice: gp }, gasLim] = await Promise.all([
          getQuickFeeData(provider),
          withTimeout(
            signer.estimateGas({ to: candidate, value }),
            FEE_TIMEOUT_MS,
            () => FALLBACK_GAS_LIMIT
          ),
        ]);

        setGasPrice(gp);
        setGasEstimate(gasLim);

        const feeWei = gasLim.mul(gp);
        const feeEthNum = parseFloat(ethers.utils.formatEther(feeWei));
        setFeeEstimate(`~${fmt(feeEthNum)} ${TOKEN_SYMBOL}`);
      } catch {
        // Provide a reasonable token fallback so UI never looks stuck
        const feeWei = FALLBACK_GAS_LIMIT.mul(FALLBACK_GAS_PRICE);
        const feeEthNum = parseFloat(ethers.utils.formatEther(feeWei));
        setFeeEstimate(`~${fmt(feeEthNum)} ${TOKEN_SYMBOL} (fallback)`);
      }
    })();
  }, [toAddress, amount, selectedToken, amountUnit, ethPriceUSD, usdToLocal]);

  // ---- QR ----
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    const candidate = normalizeAddress(data);
    setScanned(true);
    setShowScanner(false);
    if (isValidEthereumAddress(candidate)) setToAddress(candidate);
    else Alert.alert('Invalid QR', 'Not a valid address.');
  };
  const handleScanQR = () => {
    setShowScanner(true);
    setScanned(false);
  };

  // Quick fee compute used specifically for Step-3 (blocking) confirmation
  const computeConfirmFees = async (candidate: string, value: ethers.BigNumber) => {
    const signer = await getSigner();
    const provider = signer.provider!;
    const [{ gasPrice: gp }, gasLim] = await Promise.all([
      getQuickFeeData(provider),
      withTimeout(
        signer.estimateGas({ to: candidate, value }),
        FEE_TIMEOUT_MS,
        () => FALLBACK_GAS_LIMIT
      ),
    ]);
    return {
      gasLim: gasLim ?? FALLBACK_GAS_LIMIT,
      gp: gp ?? FALLBACK_GAS_PRICE,
    };
  };

  // ---- send flow with 3-step warnings ----
  const handleSend = async () => {
    const candidate = normalizeAddress(toAddress);
    if (!candidate || !amount) return Alert.alert('Error', 'Enter address and amount');
    if (!isValidEthereumAddress(candidate)) return Alert.alert('Error', 'Invalid recipient address');

    const sendAmountToken = convertAmountToToken(amount);
    const nativeAmount = parseFloat(sendAmountToken).toFixed(6);
    const prefix = amountUnit === 'usd' ? '$' : ''; // token & local: no $ prefix
    const displayUnit =
      amountUnit === 'token' ? 'TOKEN' :
      amountUnit === 'usd'   ? 'USD'   :
      localCode; // LOCAL shows actual currency code (e.g., AUD, EUR, GBP)

    // Step 1 — Irreversible warning
    Alert.alert(
      'WARNING',
      'Transactions are not reversible. Please check all details carefully.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            // Step 2 — Details confirmation
            Alert.alert(
              'Confirm Details',
              `You are about to send ${prefix}${amount} ${displayUnit} (${nativeAmount} ${TOKEN_SYMBOL})\nTo: ${maskAddr(candidate)}`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Next',
                  onPress: async () => {
                    try {
                      setEstimatingNow(true); // BLOCK INPUT + show spinner
                      const value = ethers.utils.parseEther(sendAmountToken);

                      // Always get fresh numbers here (fast, with timeout)
                      const { gasLim, gp } = await computeConfirmFees(candidate, value);
                      setGasEstimate(gasLim);
                      setGasPrice(gp);

                      const feeWei = gasLim.mul(gp);
                      const feeEthNum = parseFloat(ethers.utils.formatEther(feeWei));
                      const feeEthStr = `${fmt(feeEthNum)} ${TOKEN_SYMBOL}`;

                      setEstimatingNow(false);

                      // Step 3 — Fee confirmation (TOKEN ONLY)
                      Alert.alert(
                        'Fees',
                        `Fees for this transaction are approximately ${feeEthStr}.`,
                        [
                          { text: 'Back', style: 'cancel' },
                          {
                            text: 'Send',
                            onPress: () =>
                              executeSend(
                                candidate, sendAmountToken, prefix, amount, displayUnit, nativeAmount
                              ),
                          },
                        ]
                      );
                    } catch (e: any) {
                      setEstimatingNow(false);
                      Alert.alert('Error', e?.reason || e?.message || 'Failed to estimate fees.');
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

  // actual send + success message
  const executeSend = async (
    candidate: string,
    sendAmountToken: string,
    prefix: string,
    displayAmount: string,
    displayUnit: string,
    nativeAmount: string
  ) => {
    setLoading(true);
    try {
      const signer = await getSigner();
      const value = ethers.utils.parseEther(sendAmountToken);

      // ensure we always have safe overrides (no blocking)
      const overrides: any = {
        to: candidate,
        value,
        gasLimit: gasEstimate ?? FALLBACK_GAS_LIMIT
      };
      if (!gasPrice) {
        overrides.gasPrice = FALLBACK_GAS_PRICE; // legacy path
      }

      const response = await signer.sendTransaction(overrides);
      const receipt = await response.wait();

      // TRUE on-chain fee
      const feeEthTrue = parseFloat(
        ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice))
      );

      // Save extras for history/UI
      const txDetails = { amount: displayAmount, unit: displayUnit, feeEth: feeEthTrue };
      const stored = await AsyncStorage.getItem('txDetails');
      const storedDetails = stored ? JSON.parse(stored) : {};
      storedDetails[receipt.transactionHash] = txDetails;
      await AsyncStorage.setItem('txDetails', JSON.stringify(storedDetails));

      // Also store in localTx, so History can display consistent fee
      const localTx = {
        hash: receipt.transactionHash,
        from: fromAddress,
        to: candidate,
        value: value.toString(),
        timestamp: new Date().toISOString(),
        isSend: true,
        feeEth: feeEthTrue, // <— use this in History cards when available
        fiatSnapshot: `${prefix}${displayAmount} ${displayUnit} (${nativeAmount} ${TOKEN_SYMBOL})`,
      };
      const localTxs = JSON.parse((await AsyncStorage.getItem('localTxs')) || '[]');
      localTxs.push(localTx);
      await AsyncStorage.setItem('localTxs', JSON.stringify(localTxs));

      const delta = -parseFloat(sendAmountToken);
      const currentDelta = parseFloat((await AsyncStorage.getItem('localBalanceDelta')) || '0');
      await AsyncStorage.setItem('localBalanceDelta', String(currentDelta + delta));

      // Success popup with explorer action
      const txUrl = `${EXPLORER_BASE}/tx/${receipt.transactionHash}`;
      Alert.alert(
        'SUCCESS',
        `Payment sent: ${prefix}${displayAmount} ${displayUnit} (${nativeAmount} ${TOKEN_SYMBOL})\nTo: ${maskAddr(candidate)}\nFee: ${fmt(feeEthTrue)} ${TOKEN_SYMBOL}`,
        [
          { text: 'View on Etherscan', onPress: () => Linking.openURL(txUrl) },
          { text: 'Done' },
        ]
      );

      resetFields();
    } catch (err: any) {
      if (String(err?.code) === 'NETWORK_ERROR') {
        Alert.alert('Error', 'RPC network unavailable. Check ETH_RPC_URL.');
      } else if (String(err?.code) === 'INSUFFICIENT_FUNDS') {
        Alert.alert('Error', 'Insufficient funds for gas + value.');
      } else {
        Alert.alert('Error', err?.reason || err?.message || 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

  // misc UI
  const resetFields = () => {
    setToAddress('');
    setSelectedToken(null);
    setAmount('');
    setAmountUnit('token');
    setFeeEstimate('Enter details');
  };

  const amountPlaceholder =
    amountUnit === 'token' ? 'Enter Crypto Amount'
      : amountUnit === 'usd' ? 'Enter USD Amount'
      : `Enter ${localCode} Amount`;

  return (
    <View style={styles.container}>

      {/* Section 1: Send to */}
      <View style={styles.section}>
        <Text style={styles.label}>Send to:</Text>
        <View style={styles.addressRow}>
          <TextInput
            style={styles.input}
            placeholder="Wallet address of recipient"
            value={toAddress}
            onChangeText={(v) => setToAddress(normalizeAddress(v))}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button title="SCAN QR" onPress={handleScanQR} color="#0A84FF" />
        </View>
      </View>
      <View style={styles.separator} />

      {/* Section 2: What crypto */}
      <View style={styles.section}>
        <Text style={styles.label}>What crypto currency would you like to send:</Text>
        <Picker selectedValue={selectedToken} onValueChange={setSelectedToken} style={styles.picker as any}>
          <Picker.Item label="ETH" value={null} />
        </Picker>
      </View>
      <View style={styles.separator} />

      {/* Section 3: Toggle / Enter amount */}
      <View style={styles.section}>
        <Text style={styles.label}>How much do you want to send:</Text>
        <View style={styles.unitRow}>
          <TouchableOpacity
            style={amountUnit === 'token' ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setAmountUnit('token')}
          >
            <Text style={amountUnit === 'token' ? styles.unitTextActive : styles.unitText}>TOKEN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={amountUnit === 'usd' ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setAmountUnit('usd')}
          >
            <Text style={amountUnit === 'usd' ? styles.unitTextActive : styles.unitText}>USD</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={amountUnit === 'local' ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setAmountUnit('local')}
          >
            <Text style={amountUnit === 'local' ? styles.unitTextActive : styles.unitText}>{localCode}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.amountInput}
          placeholder={amountPlaceholder}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        {/* Passive fee line (token-only) */}
        <Text style={styles.feeInline}>Check entries carefully before sending payments: {feeEstimate}</Text>
      </View>
      <View style={styles.separator} />

      {/* Section 4: Send */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={loading}>
          <Text style={styles.sendButtonText}>SEND PAYMENT</Text>
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
                  style={styles.camera}
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
            <Text style={{ color: '#fff' }}>No camera access. Check settings.</Text>
          )}
        </View>
      )}

      {/* Blocking spinner just for the confirm-fee step */}
      <Modal visible={estimatingNow} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ActivityIndicator size="large" color="#0A84FF" />
          <Text style={{ color: '#fff', marginTop: 12 }}>Calculating fees…</Text>
        </View>
      </Modal>

      {/* Centered Loading Overlay for sending */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ActivityIndicator size="large" color="#0A84FF" />
          <Text style={{ color: '#fff', marginTop: 12 }}>Submitting transaction…</Text>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },

  section: { marginBottom: 16 },
  separator: { height: 1, backgroundColor: '#E6E6E6', marginVertical: 8 },

  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#111' },

  addressRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, padding: 10, borderColor: '#ddd', marginRight: 8, borderRadius: 8 },

  picker: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },

  unitRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  unitButton: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f3f4f6', borderRadius: 20 },
  unitButtonActive: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#0A84FF', borderRadius: 20 },
  unitText: { color: '#0A84FF', fontWeight: 'bold' },
  unitTextActive: { color: '#fff', fontWeight: 'bold' },

  amountInput: { borderWidth: 1, padding: 10, borderColor: '#ddd', borderRadius: 8, height: 44 },

  feeInline: { marginTop: 8, color: '#333', fontWeight: '600' },

  sendButton: { backgroundColor: '#0A84FF', padding: 14, borderRadius: 10, alignItems: 'center' },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  scannerContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'black', justifyContent: 'center', alignItems: 'center'
  },
  camera: { flex: 1, width: '100%' },
  closeButton: { position: 'absolute', top: 40, right: 20, backgroundColor: 'white', padding: 10, borderRadius: 5 },
  closeText: { color: 'black' },
  scanAgainButton: { backgroundColor: 'white', padding: 10, borderRadius: 5, marginTop: 20 },

  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
});

export default SendTab;
