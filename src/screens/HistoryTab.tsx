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
  }, []);

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,${localCurrency.toLowerCase()}`);
        const data = await resp.json();
        setEthPriceUSD(data.ethereum.usd || 0);
        setEthPriceLocal(data.ethereum[localCurrency.toLowerCase()] || 0);
      } catch (err) {
        console.error('Rate fetch error:', err);
      }
    };
    fetchRates();
  }, [localCurrency]);

  useEffect(() => {
    const loadTxDetails = async () => {
      const stored = await AsyncStorage.getItem('txDetailsMap');
      if (stored) setTxDetailsMap(JSON.parse(stored));
    };
    loadTxDetails();
  }, []);

  useEffect(() => {
    const mergeTransactions = async () => {
      const localTxs = await AsyncStorage.getItem('localTxs');
      const parsedLocalTxs = localTxs ? JSON.parse(localTxs) : [];
      const merged = [...transactions, ...parsedLocalTxs].sort((a, b) => new Date(b.timestamp || b.block_signed_at).getTime() - new Date(a.timestamp || a.block_signed_at).getTime()); // Use getTime() to fix TS2362/2363
      setMergedTransactions(merged);
    };
    mergeTransactions();
  }, [transactions]);

  const displayInUnit = (val: number, unit: string) => { // Type unit as string to fix TS7006
    if (unit === 'USD') return (val * ethPriceUSD).toFixed(2);
    if (unit === localCurrency) return (val * ethPriceLocal).toFixed(2);
    return val;
  };

  const renderTxItem = ({ item }: { item: any }) => { // Type item as any to fix TS7031
    const isSend = item.from_address.toLowerCase() === address.toLowerCase();
    const value = ethers.utils.formatEther(item.value || item.value_wei || '0');
    const fee = item.gas_spent ? ethers.utils.formatEther(item.gas_spent) : '0';
    const txDetails = txDetailsMap[item.hash || item.tx_hash];
    const displayValue = txDetails ? txDetails.amount : value;
    const unit = txDetails ? txDetails.unit : 'ETH';

    return (
      <TouchableOpacity onPress={() => Linking.openURL(`${ETHERSCAN_BASE}/tx/${item.hash || item.tx_hash}`)}>
        <View style={styles.txItem}>
          <Ionicons name={isSend ? 'arrow-up' : 'arrow-down'} size={24} color={isSend ? 'red' : 'green'} style={styles.icon} />
          <View style={styles.txInfo}>
            <Text style={styles.txDate}>{new Date(item.timestamp || item.block_signed_at).toLocaleString()}</Text>
            <Text style={styles.txValue}>{displayInUnit(parseFloat(displayValue), displayUnit)} {displayUnit}</Text>
            <Text style={styles.txStatus}>Status: Confirmed</Text>
            <Text style={styles.txFromTo}>{isSend ? 'To' : 'From'}: {isSend ? item.to_address : item.from_address}</Text>
            <Text style={styles.txFee}>Fee: {fee} ETH</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyState = () => <Text style={styles.empty}>No transactions yet.</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>History</Text>
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