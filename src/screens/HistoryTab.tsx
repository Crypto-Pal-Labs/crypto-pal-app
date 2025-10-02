import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet, Linking, TouchableOpacity, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useHistory } from '../hooks/useHistory';
import { useWalletStore } from '../store/useWalletStore';
import { getWalletAddress } from '../utils/wallet';
import * as ethers from 'ethers'; // Corrected star import for TS
import { useFocusEffect } from '@react-navigation/native'; // For auto-refresh
import Constants from 'expo-constants';  // Added for build env fallback

interface TxDetails {
  amount: string;
  unit: string;
}

const HistoryTab = () => {
  const setAddress = useWalletStore((state) => state.setAddress);
  const { transactions, loading, error, refetch } = useHistory();
  const address = useWalletStore((state) => state.address);
  const [ethPriceUSD, setEthPriceUSD] = useState(0);
  const [usdToNzd, setUsdToNzd] = useState(1.6);
  const [displayUnit, setDisplayUnit] = useState('TOKEN');
  const [txDetailsMap, setTxDetailsMap] = useState<Record<string, TxDetails>>({});
  const [mergedTransactions, setMergedTransactions] = useState<any[]>([]); // Merged API + local
  const [isRefreshing, setIsRefreshing] = useState(false); // Debounce flag

  const ETHERSCAN_BASE = Constants.expoConfig?.extra?.ETHERSCAN_BASE || process.env.ETHERSCAN_BASE;  // Build/dev fallback

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
        const ethResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const ethData = await ethResponse.json();
        setEthPriceUSD(ethData?.ethereum?.usd || 2000);

        const nzdResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usdt&vs_currencies=nzd');
        const nzdData = await nzdResponse.json();
        setUsdToNzd(nzdData?.usdt?.nzd || 1.6);
      } catch (e) {
        console.error('Rate fetch error:', e);
      }
    };
    fetchRates();
  }, []);

  const mergeTransactions = useCallback(async () => {
    console.log('Merging transactions...');
    try {
      const storedDetails = await AsyncStorage.getItem('txDetails');
      setTxDetailsMap(storedDetails ? JSON.parse(storedDetails) : {});

      const storedLocalTxs = await AsyncStorage.getItem('localTxs');
      let localTxs = storedLocalTxs ? JSON.parse(storedLocalTxs) : [];
      console.log('LocalTxs length:', localTxs.length); // Debug: Local length

      // Standardize local keys to match Covalent (tx_hash, from_address, etc.)
      localTxs = localTxs.map((tx: any) => ({
        tx_hash: tx.hash || tx.tx_hash || `local-${Date.now()}`, // Standard to tx_hash
        from_address: tx.from,
        to_address: tx.to,
        value: tx.value,
        block_signed_at: tx.timestamp,
        successful: true,
        gas_spent: '0', // Stub
        value_quote: 0, // Stub
        fiatSnapshot: tx.fiatSnapshot,
      }));

      console.log('API transactions length:', transactions.length); // Debug: API length
      // Merge: Add local not in API (dedup by tx_hash)
      const allTxs = [...transactions, ...localTxs];
      const uniqueTxs = allTxs.reduce((acc: any[], tx: any) => {
        if (tx.tx_hash && !acc.some((t) => t.tx_hash === tx.tx_hash)) {
          acc.push(tx);
        }
        return acc;
      }, []);

      // Sort by block_signed_at desc
      uniqueTxs.sort((a, b) => new Date(b.block_signed_at).getTime() - new Date(a.block_signed_at).getTime());

      console.log('Merged uniqueTxs length:', uniqueTxs.length); // Debug: Final merged length
      setMergedTransactions(uniqueTxs);

      // Cleanup: Remove locals only if API has the exact hash and it's successful/mined
      const syncedHashes = transactions.filter(tx => tx.successful).map((tx) => tx.tx_hash);
      localTxs = localTxs.filter((tx: any) => !syncedHashes.includes(tx.tx_hash));
      await AsyncStorage.setItem('localTxs', JSON.stringify(localTxs));
    } catch (e) {
      console.error('AsyncStorage fetch error:', e);
    }
  }, [transactions]);

  useEffect(() => {
    mergeTransactions(); // Run merge when transactions change
  }, [transactions, mergeTransactions]);

  useFocusEffect(
    React.useCallback(() => {
      if (isRefreshing || loading) {
        console.log('Skipping focus refetch—already refreshing/loading');
        return;
      }
      console.log('Focus refetch triggered');
      setIsRefreshing(true);
      const timer = setTimeout(() => {
        refetch()
          .then(mergeTransactions) // Merge after refetch
          .finally(() => setIsRefreshing(false));
      }, 500);

      return () => clearTimeout(timer);
    }, [refetch, mergeTransactions, isRefreshing, loading])
  );

  const getValueDisplay = (tx: any) => {
    const ethValueNum = Number(ethers.utils.formatEther(tx.value || '0'));
    if (tx.fiatSnapshot) {
      return `${tx.fiatSnapshot.amount} ${tx.fiatSnapshot.unit} (${ethValueNum.toFixed(4) } ETH)`;
    }
    if (displayUnit === 'NZD') return `$${ (ethValueNum * ethPriceUSD * usdToNzd).toFixed(2) } NZD (${ethValueNum.toFixed(4)} ETH)`;
    if (displayUnit === 'USD') return `$${ (ethValueNum * ethPriceUSD).toFixed(2) } USD (${ethValueNum.toFixed(4)} ETH)`;
    return `${ethValueNum.toFixed(4)} ETH`;
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
        <TouchableOpacity style={displayUnit === 'NZD' ? styles.unitButtonActive : styles.unitButton} onPress={() => setDisplayUnit('NZD')}>
          <Text style={displayUnit === 'NZD' ? styles.unitTextActive : styles.unitText}>NZD</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View>
      ) : (
        <FlatList
          data={mergedTransactions} // Use merged list
          renderItem={renderTxItem}
          keyExtractor={(item) => item.tx_hash || item.block_signed_at} // Fallback to timestamp if no hash
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