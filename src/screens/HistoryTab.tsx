// src/screens/HistoryTab.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Linking,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useHistory } from '../hooks/useHistory';
import { useWalletStore } from '../store/useWalletStore';
import { getWalletAddress } from '../utils/wallet';
import * as ethers from 'ethers';
import * as Localization from 'expo-localization';
import { useFocusEffect } from '@react-navigation/native';



// EAS-safe config (no @env in bundles)
import { getExtra } from '../config/extra';

type TxMeta = {
  amount?: string;     // what you saved in SendTab (displayAmount)
  unit?: string;       // 'TOKEN' | 'USD' | local code
  feeEth?: number;     // exact on-chain fee from receipt (preferred)
};

const DEFAULT_SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';

const HistoryTab = () => {
  const setAddress = useWalletStore((state) => state.setAddress);
  const { transactions, loading, error, refetch } = useHistory();
  const address = useWalletStore((state) => state.address);

  const [ethPriceUSD, setEthPriceUSD] = useState(0);
  const [ethPriceLocal, setEthPriceLocal] = useState(0);
  const [displayUnit, setDisplayUnit] = useState<'TOKEN' | 'USD' | string>('TOKEN'); // local uses actual code string
  const [txDetailsMap, setTxDetailsMap] = useState<Record<string, TxMeta>>({});
  const [mergedTransactions, setMergedTransactions] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isActiveRef = useRef(true);

  // Local currency
  const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
  const localCurrency = (locale.currencyCode || 'USD').toUpperCase(); // e.g., NZD, AUD, EUR

  // Explorer base (EAS-safe)
  const EXTRA = getExtra();
  const EXPLORER_BASE = (EXTRA?.ETHERSCAN_BASE as string) || DEFAULT_SEPOLIA_EXPLORER;

  // Load address once
  useEffect(() => {
    const loadAddress = async () => {
      const currentAddress = await getWalletAddress();
      if (currentAddress) setAddress(currentAddress);
    };
    loadAddress();
  }, []);

  // Prices for conversions
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const resp = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,${localCurrency.toLowerCase()}`
        );
        const data = await resp.json();
        setEthPriceUSD(Number(data?.ethereum?.usd || 0));
        setEthPriceLocal(Number(data?.ethereum?.[localCurrency.toLowerCase()] || 0));
      } catch (err) {
        console.error('Rate fetch error:', err);
      }
    };
    fetchRates();
  }, [localCurrency]);

  // Load tx meta stored by SendTab (NOTE: the key is 'txDetails' in your Send code)
  useEffect(() => {
    const loadTxMeta = async () => {
      try {
        const stored = await AsyncStorage.getItem('txDetails');
        if (stored) setTxDetailsMap(JSON.parse(stored));
      } catch {}
    };
    loadTxMeta();
  }, []);

  // Merge API transactions with local sends
  useEffect(() => {
    const mergeTransactions = async () => {
      const localTxsRaw = await AsyncStorage.getItem('localTxs');
      const localTxs = localTxsRaw ? JSON.parse(localTxsRaw) : [];

      // Use a Map keyed by lowercase hash
      const unique = new Map<string, any>();

      // First: API txs
      for (const tx of transactions || []) {
        const txHash = (tx.tx_hash || '').toLowerCase();
        if (!txHash) continue;
        unique.set(txHash, {
          ...tx,
          tx_hash: tx.tx_hash,
          hash: tx.tx_hash,
          from_address: tx.from_address?.toLowerCase() || '',
          to_address: tx.to_address?.toLowerCase() || '',
        });
      }

      // Then: local txs (override/add)
      for (const l of localTxs) {
        const txHash = (l.hash || '').toLowerCase();
        if (!txHash) continue;
        unique.set(txHash, {
          ...(unique.get(txHash) || {}),
          ...l,
          tx_hash: l.hash || l.tx_hash,
          hash: l.hash || l.tx_hash,
          from_address: (l.from || l.from_address || '').toLowerCase(),
          to_address: (l.to || l.to_address || '').toLowerCase(),
        });
      }

      // Sort by time (local has timestamp, API has block_signed_at)
      const sorted = Array.from(unique.values()).sort((a, b) => {
        const ta = new Date(a.timestamp || a.block_signed_at || 0).getTime();
        const tb = new Date(b.timestamp || b.block_signed_at || 0).getTime();
        return tb - ta;
      });

      setMergedTransactions(sorted);
    };

    mergeTransactions();
  }, [transactions]);

  // Pull-to-refresh wrapper
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      // Reload meta to keep in sync
      const stored = await AsyncStorage.getItem('txDetails');
      if (stored) setTxDetailsMap(JSON.parse(stored));
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Helpers
  const maskAddr = (a: string) =>
    a?.startsWith('0x') && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

  const fmt = (n: number, dp = 6) =>
    Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/,'').replace(/\.$/,'') : '…';

  const getValueEth = (item: any): number => {
    try {
      // Covalent items often have 'value' (wei) or 'value_wei'
      const wei = item.value ?? item.value_wei ?? '0';
      return parseFloat(ethers.utils.formatEther(wei.toString()));
    } catch {
      return 0;
    }
  };

  const getSavedMeta = (item: any): TxMeta | undefined => {
    const key = (item.hash || item.tx_hash || '').toString();
    return key ? txDetailsMap[key] : undefined;
    // SendTab saved under 'txDetails'[txHash] = { amount, unit, feeEth }
  };

  const getFeeEth = (item: any, saved?: TxMeta): number | null => {
    // 1) Prefer the exact on-chain fee saved by Send (feeEth)
    if (saved?.feeEth != null && Number.isFinite(saved.feeEth)) return saved.feeEth;

    // 2) Prefer localTx.feeEth if present
    if (typeof item.feeEth === 'number' && Number.isFinite(item.feeEth)) return item.feeEth;

    // 3) Try deriving from gas_spent * (effective_gas_price | gas_price)
    try {
      const gasUsed = item.gas_spent ?? item.gas_used ?? null; // Covalent sometimes uses gas_spent or gas_used
      const gasPrice = item.effective_gas_price ?? item.gas_price ?? null;
      if (gasUsed != null && gasPrice != null) {
        const feeWei = ethers.BigNumber.from(gasUsed.toString()).mul(ethers.BigNumber.from(gasPrice.toString()));
        return parseFloat(ethers.utils.formatEther(feeWei));
      }
    } catch {}

    // 4) Some APIs expose fees_paid (wei)
    if (item.fees_paid) {
      try {
        return parseFloat(ethers.utils.formatEther(item.fees_paid.toString()));
      } catch {}
    }

    return null;
  };

  const toDisplayAmount = (ethAmount: number): { text: string; unitLabel: string } => {
    if (displayUnit === 'USD') {
      const v = ethAmount * (ethPriceUSD || 0);
      return { text: v.toFixed(2), unitLabel: 'USD' };
    }
    if (displayUnit === localCurrency) {
      const v = ethAmount * (ethPriceLocal || 0);
      return { text: v.toFixed(2), unitLabel: localCurrency };
    }
    // TOKEN
    return { text: fmt(ethAmount, 6), unitLabel: 'ETH' };
  };

  const openExplorer = (hash: string | undefined) => {
    if (!hash) return;
    Linking.openURL(`${EXPLORER_BASE}/tx/${hash}`);
  };

  const renderTxItem = ({ item }: { item: any }) => {
    // Skip incomplete
    if (!item && !item.tx_hash && !item.hash) return null;

    const txHash = (item.hash || item.tx_hash || '').toString();
    const fromAddr = (item.from_address || '').toLowerCase();
    const toAddr = (item.to_address || '').toLowerCase();
    const isSend = address && fromAddr === address.toLowerCase();

    // ETH value
    const valueEth = getValueEth(item);

    // Saved meta (may include feeEth)
    const meta = getSavedMeta(item);
    const feeEth = getFeeEth(item, meta);
    const feeLine = feeEth != null ? `${fmt(feeEth, 6)} ETH` : '—';

    // Status (Covalent: successful boolean; default true for local)
    const successful =
      item.successful === false ? false : true; // treat undefined as true (local send)
    const statusText = successful ? 'Confirmed' : 'Failed';
    const statusStyle = successful ? styles.statusConfirmed : styles.statusFailed;

    // Convert value for current display unit
    const { text: amountText, unitLabel } = toDisplayAmount(valueEth);

    return (
      <TouchableOpacity activeOpacity={0.8} onPress={() => openExplorer(txHash)}>
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <Ionicons
              name={isSend ? 'arrow-up' : 'arrow-down'}
              size={22}
              color={isSend ? '#E11D48' : '#16A34A'} // red for send, green for receive
              style={{ marginRight: 8 }}
            />
            <Text style={styles.date}>
              {new Date(item.timestamp || item.block_signed_at).toLocaleString()}
            </Text>
          </View>

          <View style={styles.line} />

          <View style={styles.row}>
            <Text style={styles.label}>Amount:</Text>
            <Text style={styles.value}>
              {amountText} {unitLabel}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Status:</Text>
            <Text style={[styles.value, statusStyle]}>{statusText}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>{isSend ? 'To:' : 'From:'}</Text>
            <Text style={styles.valueAddr}>{isSend ? maskAddr(toAddr) : maskAddr(fromAddr)}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Fee:</Text>
            <Text style={styles.value}>{feeLine}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyState = () => <Text style={styles.empty}>No transactions yet.</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Transaction History</Text>

      {/* Rounded pill selector (Token / USD / Local) */}
      <View style={styles.unitRow}>
        <TouchableOpacity
          style={displayUnit === 'TOKEN' ? styles.unitButtonActive : styles.unitButton}
          onPress={() => setDisplayUnit('TOKEN')}
        >
          <Text style={displayUnit === 'TOKEN' ? styles.unitTextActive : styles.unitText}>
            TOKEN
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={displayUnit === 'USD' ? styles.unitButtonActive : styles.unitButton}
          onPress={() => setDisplayUnit('USD')}
        >
          <Text style={displayUnit === 'USD' ? styles.unitTextActive : styles.unitText}>
            USD
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={displayUnit === localCurrency ? styles.unitButtonActive : styles.unitButton}
          onPress={() => setDisplayUnit(localCurrency)}
        >
          <Text
            style={
              displayUnit === localCurrency ? styles.unitTextActive : styles.unitText
            }
          >
            {localCurrency}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0A84FF" />
        </View>
      ) : (
        <FlatList
          data={mergedTransactions}
          renderItem={renderTxItem}
          keyExtractor={(item, index) =>
            (item.tx_hash || item.hash || item.block_signed_at || index).toString()
          }
          ListEmptyComponent={EmptyState}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={['#0A84FF']}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  heading: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#0A84FF',
    marginTop: 50,
    paddingHorizontal: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  listContainer: { padding: 16 },

  // Card: very light blue/fade background
  card: {
    backgroundColor: '#F5F9FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6F0FF',
  },

  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },

  line: { height: 1, backgroundColor: '#E6EAF2', marginVertical: 6 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
  },

  label: {
    width: 86,
    fontWeight: 'bold',
    color: '#000',
  },

  value: {
    flex: 1,
    color: '#111',
  },

  valueAddr: {
  flex: 1,
  color: '#333',
  fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
},


  date: { color: '#333', fontWeight: '600' },

  statusConfirmed: { color: '#16A34A', fontWeight: '700' }, // green
  statusFailed: { color: '#DC2626', fontWeight: '700' },    // red

  // Rounded pill selector styles (match Send tab)
  unitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 8,
  },
  unitButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
  },
  unitButtonActive: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#0A84FF',
    borderRadius: 20,
  },
  unitText: { color: '#0A84FF', fontWeight: 'bold' },
  unitTextActive: { color: '#fff', fontWeight: 'bold' },

  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
});

export default HistoryTab;
