// src/screens/HistoryTab.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet, Linking, TouchableOpacity, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useHistory } from '../hooks/useHistory';
import { useWalletStore } from '../store/useWalletStore';
import { getWalletAddress } from '../utils/wallet';
import * as ethers from 'ethers';
import { useFocusEffect } from '@react-navigation/native';
import { ETHERSCAN_BASE } from '@env';
import * as Localization from 'expo-localization'; // Added for dynamic local currency

interface TxDetails {
  amount: string;
  unit: string;
}

const HistoryTab = () => {
  const setAddress = useWalletStore((state) => state.setAddress);
  const { transactions, loading, error, refetch } = useHistory();
  const address = useWalletStore((state) => state.address);
  const [ethPriceUSD, setEthPriceUSD] = useState(0);
  const [ethPriceLocal, setEthPriceLocal] = useState(0); // Generalized from usdToNzd
  const [displayUnit, setDisplayUnit] = useState('TOKEN'); // Defaults to TOKEN as requested
  const [txDetailsMap, setTxDetailsMap] = useState<Record<string, TxDetails>>({});
  const [mergedTransactions, setMergedTransactions] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isActiveRef = useRef(true);

  // Get user local currency (dynamic, not hard-fixed to NZD)
  const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
  const localCurrency = (locale.currencyCode || 'USD').toUpperCase(); // E.g., 'NZD', 'EUR'; fallback USD if null

  useEffect(() => {
    const loadAddress = async () => {
      const currentAddress = await getWalletAddress();
      if (currentAddress) setAddress(currentAddress);
    };
    loadAddress();
  }, [setAddress]);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const vsCurrencies = `usd,${localCurrency.toLowerCase()}`;
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=${vsCurrencies}`);
        const data = await response.json();
        setEthPriceUSD(data?.ethereum?.usd || 2000);
        setEthPriceLocal(data?.ethereum?.[localCurrency.toLowerCase()] || data?.ethereum?.usd || 2000); // Fallback to USD if local fails
      } catch (e) {
        console.warn('Rate fetch error:', e);
      }
    };
    fetchRates();
  }, [localCurrency]); // Re-fetch if local changes (rare)

  const mergeTransactions = useCallback(async () => {
    try {
      const storedDetails = await AsyncStorage.getItem('txDetails');
      setTxDetailsMap(storedDetails ? JSON.parse(storedDetails) : {});

      const storedLocalTxs = await AsyncStorage.getItem('localTxs');
      let localTxs = storedLocalTxs ? JSON.parse(storedLocalTxs) : [];

      localTxs = localTxs.map((tx: any) => ({
        tx_hash: tx.hash || tx.tx_hash || `local-${Date.now()}`,
        from_address: tx.from,
        to_address: tx.to,
        value: tx.value,
        block_signed_at: tx.timestamp,
        successful: true,
        gas_spent: '0',
        value_quote: 0,
        fiatSnapshot: tx.fiatSnapshot,
        frozenUsd: tx.frozenUsd, // Preserve if already frozen
        frozenLocal: tx.frozenLocal,
      }));

      const allTxs = [...transactions, ...localTxs];
      const uniqueTxs = allTxs.reduce((acc: any[], tx: any) => {
        if (tx.tx_hash && !acc.some((t) => t.tx_hash === tx.tx_hash)) {
          // Freeze fiat values if not already set
          const ethValueNum = Number(ethers.utils.formatEther(tx.value || '0'));
          if (!tx.frozenUsd) {
            tx.frozenUsd = ethValueNum * ethPriceUSD;
          }
          if (!tx.frozenLocal) {
            tx.frozenLocal = ethValueNum * ethPriceLocal;
          }
          // Prioritize fiatSnapshot for sender-side if present
          if (tx.fiatSnapshot) {
            // Parse snapshot for USD/local (assume format like "$3 USD (0.0015 ETH)")
            const match = tx.fiatSnapshot.match(/\$([\d.]+) (\w+)/);
            if (match) {
              const amount = parseFloat(match[1]);
              const unit = match[2].toUpperCase();
              if (unit === 'USD') tx.frozenUsd = amount;
              if (unit === localCurrency) tx.frozenLocal = amount;
            }
          }
          acc.push(tx);
        }
        return acc;
      }, []);

      uniqueTxs.sort((a, b) => new Date(b.block_signed_at).getTime() - new Date(a.block_signed_at).getTime());

      if (isActiveRef.current) {
        setMergedTransactions(uniqueTxs);
      }

      const syncedHashes = transactions.filter(tx => tx.successful).map((tx) => tx.tx_hash);
      localTxs = localTxs.filter((tx: any) => !syncedHashes.includes(tx.tx_hash));
      await AsyncStorage.setItem('localTxs', JSON.stringify(localTxs));
    } catch (e) {
      console.warn('AsyncStorage fetch error:', e);
    }
  }, [transactions, ethPriceUSD, ethPriceLocal, localCurrency]);

  useEffect(() => {
    mergeTransactions();
  }, [transactions, mergeTransactions]);

  // Debounce wrapper for refetch
  const debounce = (fn: () => Promise<void>, ms: number) => {
    let timeout: NodeJS.Timeout | null = null;
    return () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(fn, ms);
    };
  };
  const debouncedRefetch = debounce(async () => {
    await refetch();
    await mergeTransactions();
  }, 500);

  useFocusEffect(
    useCallback(() => {
      isActiveRef.current = true;
      debouncedRefetch(); // Initial debounced refetch

      const interval = setInterval(() => {
        if (!isRefreshing && !loading && isActiveRef.current) {
          debouncedRefetch(); // Debounced auto-refresh
        }
      }, 10000);

      return () => {
        isActiveRef.current = false;
        clearInterval(interval);
      };
    }, []) // Empty deps for single run per focus
  );

  const getValueDisplay = (tx: any) => {
    const ethValue = tx.value || '0';
    const ethValueNum = Number(ethers.utils.formatEther(ethValue));
    const details = txDetailsMap[tx.tx_hash] || {};
    if (details.amount && details.unit) {
      return `${details.amount} ${details.unit} (${ethValueNum.toFixed(4)} ETH)`;
    }
    if (displayUnit === 'TOKEN') return `${ethValueNum.toFixed(4)} ETH`;
    // Use frozen values if available, else fallback to current calculation
    const usdValue = tx.frozenUsd ?? (ethValueNum * ethPriceUSD);
    if (displayUnit === 'USD') return `$${usdValue.toFixed(2)} USD (${ethValueNum.toFixed(4)} ETH)`;
    const localValue = tx.frozenLocal ?? (ethValueNum * ethPriceLocal);
    return `$${localValue.toFixed(2)} ${localCurrency} (${ethValueNum.toFixed(4)} ETH)`;
  };

  const getIconName = (tx: any) => {
    if (tx.from_address?.toLowerCase() === address.toLowerCase()) {
      return 'arrow-up';
    }
    return 'arrow-down';
  };

  const getIconColor = (tx: any) => {
    if (tx.from_address?.toLowerCase() === address.toLowerCase()) {
      return 'red';
    }
    return 'green';
  };

  const renderTxItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.txItem} onPress={() => Linking.openURL(`${ETHERSCAN_BASE}${item.tx_hash}`)}>
      <Ionicons name={getIconName(item)} size={24} color={getIconColor(item)} style={styles.icon} />
      <View style={styles.txInfo}>
        <Text style={styles.txDate}>{item.block_signed_at ? new Date(item.block_signed_at).toLocaleString() : 'Unknown Date'}</Text>
        <Text style={styles.txValue}>Value: {getValueDisplay(item)}</Text>
        <Text style={[styles.txStatus, { color: item.successful ? 'green' : 'red' }]}>Status: {item.successful ? 'Success' : 'Failed'}</Text>
        <Text style={styles.txFromTo}>
          From: {item.from_address ? item.from_address.slice(0, 6) + '...' + item.from_address.slice(-4) : 'N/A'}
        </Text>
        <Text style={styles.txFromTo}>
          To: {item.to_address ? item.to_address.slice(0, 6) + '...' + item.to_address.slice(-4) : 'N/A'}
        </Text>
        <Text style={styles.txFee}>Fee: {ethers.utils.formatEther(item.gas_spent || '0')} ETH</Text>
      </View>
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={styles.center}>
      <Text style={styles.empty}>No transactions to display yet!</Text>
    </View>
  );

  if (error) return <View style={styles.center}><Text style={styles.errorText}>Failed to load history. Pull to refresh.</Text><TouchableOpacity onPress={refetch}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Transaction History</Text>
      <View style={styles.unitRow}>
        <TouchableOpacity style={displayUnit === 'TOKEN' ? styles.unitButtonActive : styles.unitButton} onPress={() => setDisplayUnit('TOKEN')}>
          <Text style={displayUnit === 'TOKEN' ? styles.unitTextActive : styles.unitText}>TOKEN</Text>
        </TouchableOpacity>
        <TouchableOpacity style={displayUnit === 'USD' ? styles.unitButtonActive : styles.unitButton} onPress={() => setDisplayUnit('USD')}>
          <Text style={displayUnit === 'USD' ? styles.unitTextActive : styles.unitText}>USD</Text>
        </TouchableOpacity>
        <TouchableOpacity style={displayUnit === localCurrency ? styles.unitButtonActive : styles.unitButton} onPress={() => setDisplayUnit(localCurrency)}>
          <Text style={displayUnit === localCurrency ? styles.unitTextActive : styles.unitText}>{localCurrency}</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View>
      ) : (
        <FlatList
          data={mergedTransactions}
          renderItem={renderTxItem}
          keyExtractor={(item) => item.tx_hash || item.block_signed_at}
          ListEmptyComponent={EmptyState}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} colors={['#0A84FF']} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 32, fontWeight: 'bold', color: '#0A84FF', marginTop: 35, padding: 20, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16 },
  txItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  icon: { marginRight: 10 },
  txInfo: { flex: 1 },
  txDate: { fontWeight: 'bold' },
  txValue: { color: '#000' },
  txStatus: { fontWeight: 'bold' },
  txFromTo: { color: '#888' },
  txFee: { color: '#888' },
  empty: { textAlign: 'center', color: '#888', marginTop: 10 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  retry: { color: '#0A84FF' },
  unitRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 10 },
  unitButton: { padding: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginHorizontal: 5 },
  unitButtonActive: { padding: 8, backgroundColor: '#0A84FF', borderRadius: 4, marginHorizontal: 5 },
  unitText: { color: '#0A84FF', fontWeight: 'bold' },
  unitTextActive: { color: '#fff', fontWeight: 'bold' },
});

export default HistoryTab;