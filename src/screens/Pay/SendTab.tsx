import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image, Modal, StyleSheet,
} from 'react-native';
import { ethers } from 'ethers';
import { useBalances } from '../../hooks/useBalances';
import { useWalletStore } from '../../store/useWalletStore';
import { getSavedMnemonic } from '../../utils/wallet'; // already in your project

type Unit = 'token' | 'nzd';

type TokenItem = {
  contract_ticker_symbol: string;
  contract_address: string;        // empty/0xeeee.../null for native from Covalent
  contract_decimals: number;
  balance: string;                 // raw integer as string
  logo_url?: string;
  quote?: number;                  // NZD value of full balance
};

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

function isNativeAddress(addr?: string | null) {
  if (!addr) return true;
  const a = addr.toLowerCase();
  return a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || a === '0x0000000000000000000000000000000000000000';
}

function format(num: number, maxFrac: number = 6) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxFrac }).format(num);
}

// Temporary dev RPCs – swap to your own (Infura/Alchemy/QuickNode) for production.
function getRpcUrl(chainId: number) {
  switch (chainId) {
    case 1:  return 'https://cloudflare-eth.com';                      // Ethereum
    case 56: return 'https://bsc-dataseed.binance.org';                // BSC
    default: return 'https://cloudflare-eth.com';
  }
}

export default function SendTab() {
  const { address, chainId } = useWalletStore();
  const items = useBalances() as TokenItem[];

  const tokens = useMemo(() => {
    return (items || [])
      .map((it) => {
        const balRaw = Number(it.balance || '0');
        const decimals = it.contract_decimals ?? 18;
        const amount = balRaw / Math.pow(10, decimals);
        const nzdValue = it.quote ?? 0;
        const priceNzd = amount > 0 ? nzdValue / amount : 0;
        return { ...it, amount, nzdValue, priceNzd };
      })
      .filter(it => it.amount > 0);
  }, [items]);

  const [selected, setSelected] = useState<any | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unit, setUnit] = useState<Unit>('token');
  const [amountToken, setAmountToken] = useState<string>('');
  const [toAddress, setToAddress] = useState<string>('');
  const [estimating, setEstimating] = useState(false);
  const [sending, setSending] = useState(false);
  const [feePreview, setFeePreview] = useState<{ gasLimit?: string; gasPriceWei?: string; maxFeeWei?: string; feeWei?: string } | null>(null);
  const [status, setStatus] = useState<string>('');

  React.useEffect(() => {
    if (!selected && tokens.length > 0) setSelected(tokens[0]);
  }, [tokens, selected]);

  const amountNzd = useMemo(() => {
    const a = parseFloat(amountToken || '0');
    if (!selected || !isFinite(a)) return '';
    return selected.priceNzd ? String(a * selected.priceNzd) : '';
  }, [amountToken, selected]);

  const displayAmount = unit === 'token' ? amountToken : amountNzd;

  const onChangeDisplayAmount = (txt: string) => {
    const clean = txt.replace(/[^0-9.]/g, '');
    if (!selected) {
      unit === 'token' ? setAmountToken(clean) : setAmountToken('');
      return;
    }
    if (unit === 'token') {
      setAmountToken(clean);
    } else {
      const nzd = parseFloat(clean || '0');
      const tokenVal = selected.priceNzd && isFinite(nzd) ? nzd / selected.priceNzd : 0;
      setAmountToken(tokenVal ? String(tokenVal) : '');
    }
  };

  const parsedAmount = useMemo(() => {
    if (!selected) return null;
    const dec = selected.contract_decimals ?? 18;
    const val = amountToken.trim() ? Number(amountToken) : 0;
    if (!isFinite(val) || val <= 0) return null;
    try {
      return ethers.parseUnits(val.toString(), dec); // BigInt
    } catch {
      return null;
    }
  }, [amountToken, selected]);

  const canSend =
    !!selected &&
    !!toAddress &&
    /^0x[0-9a-fA-F]{40}$/.test(toAddress.trim()) &&
    !!parsedAmount &&
    parseFloat(amountToken || '0') > 0 &&
    parseFloat(amountToken || '0') <= (selected?.amount ?? 0);

  async function getSigner() {
    const phrase = await getSavedMnemonic();
    if (!phrase) throw new Error('No wallet found. Please (re)create your wallet.');
    const provider = new ethers.JsonRpcProvider(getRpcUrl(chainId || 1), chainId || 1);
    return ethers.Wallet.fromPhrase(phrase).connect(provider);
  }

  const handleEstimateFee = async () => {
    if (!selected || !parsedAmount || !/^0x[0-9a-fA-F]{40}$/.test(toAddress.trim())) return;
    setStatus('');
    setFeePreview(null);
    setEstimating(true);
    try {
      const signer = await getSigner();
      const provider = signer.provider!;
      const native = isNativeAddress(selected.contract_address);

      let gasLimit: bigint;
      let feeWei: bigint;
      let gasPriceWei: bigint | undefined;
      let maxFeePerGas: bigint | undefined;

      if (native) {
        // Native transfer
        const tx = { to: toAddress.trim(), value: parsedAmount };
        gasLimit = await provider.estimateGas(tx);
        const feeData = await provider.getFeeData();
        // prefer EIP-1559 if available
        if (feeData.maxFeePerGas) {
          maxFeePerGas = feeData.maxFeePerGas;
          feeWei = gasLimit * maxFeePerGas;
        } else if (feeData.gasPrice) {
          gasPriceWei = feeData.gasPrice;
          feeWei = gasLimit * gasPriceWei;
        } else {
          throw new Error('Unable to get fee data');
        }
      } else {
        // ERC-20 transfer
        const contract = new ethers.Contract(selected.contract_address, ERC20_ABI, signer);
        const txReq = await contract.transfer.populateTransaction(toAddress.trim(), parsedAmount);
        // Some providers require 'from' for accurate gas estimate
        txReq.from = address;
        gasLimit = await provider.estimateGas(txReq);
        const feeData = await provider.getFeeData();
        if (feeData.maxFeePerGas) {
          maxFeePerGas = feeData.maxFeePerGas;
          feeWei = gasLimit * maxFeePerGas;
        } else if (feeData.gasPrice) {
          gasPriceWei = feeData.gasPrice;
          feeWei = gasLimit * gasPriceWei;
        } else {
          throw new Error('Unable to get fee data');
        }
      }

      setFeePreview({
        gasLimit: gasLimit.toString(),
        gasPriceWei: gasPriceWei ? gasPriceWei.toString() : undefined,
        maxFeeWei: maxFeePerGas ? maxFeePerGas.toString() : undefined,
        feeWei: feeWei.toString(),
      });
      setStatus('Fee estimated.');
    } catch (e: any) {
      setStatus(`Estimate failed: ${e?.message ?? String(e)}`);
    } finally {
      setEstimating(false);
    }
  };

  const handleSend = async () => {
    if (!selected || !parsedAmount || !/^0x[0-9a-fA-F]{40}$/.test(toAddress.trim())) return;
    setStatus('');
    setSending(true);
    try {
      const signer = await getSigner();
      const provider = signer.provider!;
      const native = isNativeAddress(selected.contract_address);

      let txHash: string;

      if (native) {
        // Native transfer
        const txResp = await signer.sendTransaction({
          to: toAddress.trim(),
          value: parsedAmount,
        });
        setStatus(`Broadcasted: ${txResp.hash}`);
        await txResp.wait(); // wait 1 confirmation
        txHash = txResp.hash;
      } else {
        // ERC-20 transfer
        const contract = new ethers.Contract(selected.contract_address, ERC20_ABI, signer);
        const txResp = await contract.transfer(toAddress.trim(), parsedAmount);
        setStatus(`Broadcasted: ${txResp.hash}`);
        await txResp.wait();
        txHash = txResp.hash;
      }

      // simple refresh hint
      setStatus((s) => (s ? `${s}\nConfirmed. Balances will refresh shortly.` : 'Confirmed.'));
      // optional: trigger a balances refresh in your store if you expose one
    } catch (e: any) {
      setStatus(`Send failed: ${e?.shortMessage ?? e?.message ?? String(e)}`);
    } finally {
      setSending(false);
    }
  };

  const feeInNative = useMemo(() => {
    if (!feePreview?.feeWei) return null;
    // Native decimals: 18 on both ETH/BSC
    const eth = Number(ethers.formatUnits(BigInt(feePreview.feeWei), 18));
    return isFinite(eth) ? eth : null;
  }, [feePreview]);

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Send</Text>

      {/* Token selector */}
      <TouchableOpacity onPress={() => setPickerOpen(true)} activeOpacity={0.8} style={styles.tokenSelector}>
        {selected?.logo_url ? (
          <Image source={{ uri: selected.logo_url }} style={styles.logo} />
        ) : (
          <View style={[styles.logo, styles.logoPlaceholder]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.tokenSymbol}>{selected?.contract_ticker_symbol ?? 'Select token'}</Text>
          {selected && (
            <Text style={styles.balanceLine}>
              {format(selected.amount)} {selected.contract_ticker_symbol} · NZD {format(selected.nzdValue, 2)}
            </Text>
          )}
        </View>
        <Text style={styles.chev}>▾</Text>
      </TouchableOpacity>

      {/* Recipient */}
      <TextInput
        style={styles.input}
        placeholder="Recipient address (0x...)"
        value={toAddress}
        onChangeText={setToAddress}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Amount + unit toggle */}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder={unit === 'token' ? 'Amount (token)' : 'Amount (NZD)'}
          keyboardType="decimal-pad"
          value={displayAmount}
          onChangeText={onChangeDisplayAmount}
        />
        <View style={styles.unitToggle}>
          <TouchableOpacity
            onPress={() => setUnit('token')}
            style={[styles.unitBtn, unit === 'token' && styles.unitActive]}
          >
            <Text style={[styles.unitText, unit === 'token' && styles.unitTextActive]}>
              {selected?.contract_ticker_symbol ?? 'TOKEN'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setUnit('nzd')}
            style={[styles.unitBtn, unit === 'nzd' && styles.unitActive]}
          >
            <Text style={[styles.unitText, unit === 'nzd' && styles.unitTextActive]}>NZD</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Fee preview */}
      {feePreview && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: '#6b7280' }}>
            Gas limit: {feePreview.gasLimit}
          </Text>
          {feePreview.maxFeeWei && (
            <Text style={{ color: '#6b7280' }}>
              Max fee per gas (wei): {feePreview.maxFeeWei}
            </Text>
          )}
          {feePreview.gasPriceWei && (
            <Text style={{ color: '#6b7280' }}>
              Gas price (wei): {feePreview.gasPriceWei}
            </Text>
          )}
          {feeInNative !== null && (
            <Text style={{ color: '#6b7280' }}>
              Est. network fee (~native): {format(feeInNative, 6)}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity
        style={[styles.button, styles.buttonGhost, estimating && styles.buttonDisabled]}
        onPress={handleEstimateFee}
        activeOpacity={0.8}
        disabled={estimating || !canSend}
      >
        <Text style={[styles.buttonText, styles.buttonGhostText]}>{estimating ? 'Estimating…' : 'Estimate Fee'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, (!canSend || sending) && styles.buttonDisabled]}
        onPress={handleSend}
        disabled={!canSend || sending}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Send'}</Text>
      </TouchableOpacity>

      {!!status && (
        <Text style={{ marginTop: 10, color: status.includes('failed') ? '#dc2626' : '#111827' }}>
          {status}
        </Text>
      )}

      {/* Token picker modal */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalWrap}>
          <Text style={styles.modalTitle}>Select a token</Text>
          <FlatList
            data={tokens}
            keyExtractor={(it) => `${it.contract_address || 'native'}:${it.contract_ticker_symbol}`}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.tokenRow}
                onPress={() => {
                  setSelected(item);
                  setPickerOpen(false);
                }}
              >
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={styles.logo} />
                ) : (
                  <View style={[styles.logo, styles.logoPlaceholder]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.tokenSymbol}>{item.contract_ticker_symbol}</Text>
                  <Text style={styles.balanceLine}>
                    {format(item.amount)} · NZD {format(item.nzdValue, 2)}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={[styles.button, { margin: 16 }]} onPress={() => setPickerOpen(false)}>
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  h1: { fontSize: 28, fontWeight: '800', marginBottom: 12 },
  tokenSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e5ea', marginBottom: 12,
  },
  logo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f2f2f7' },
  logoPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  tokenSymbol: { fontSize: 16, fontWeight: '700' },
  balanceLine: { color: '#6b7280', marginTop: 2 },
  chev: { fontSize: 16, color: '#6b7280' },
  input: {
    borderWidth: 1, borderColor: '#e5e5ea', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  unitToggle: {
    flexDirection: 'row', borderWidth: 1, borderColor: '#0A84FF', borderRadius: 12, overflow: 'hidden',
  },
  unitBtn: { paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#fff' },
  unitActive: { backgroundColor: '#0A84FF' },
  unitText: { fontSize: 12, fontWeight: '700', color: '#0A84FF' },
  unitTextActive: { color: '#fff' },
  button: {
    backgroundColor: '#0A84FF', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 6,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  buttonGhost: {
    backgroundColor: '#E5F0FF', borderWidth: 1, borderColor: '#0A84FF',
  },
  buttonGhostText: { color: '#0A84FF' },
  modalWrap: { flex: 1, backgroundColor: '#fff', paddingTop: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', paddingHorizontal: 16, marginBottom: 8 },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
});
