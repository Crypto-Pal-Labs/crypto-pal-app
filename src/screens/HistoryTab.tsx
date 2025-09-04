// src/screens/HistoryTab.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet, Linking, TouchableOpacity, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useHistory } from '../hooks/useHistory';
import { useWalletStore } from '../store/useWalletStore';
import { getWalletAddress } from '../utils/wallet';
import { formatEther } from 'ethers';

interface TxDetails {
  amount: string;
  unit: string;
}

const HistoryTab = () => {
  const setAddress = useWalletStore((state) => state.setAddress);
  const { transactions, loading, error, refetch } = useHistory();
  const address = useWalletStore((state) => state.address);
  const [txDetailsMap, setTxDetailsMap] = useState<Record<string, TxDetails>>({});

  useEffect(() => {
    const loadAddress = async () => {
      const currentAddress = await getWalletAddress();
      if (currentAddress) setAddress(currentAddress);
    };
    loadAddress();
  }, [setAddress]);

  useEffect(() => {
    const fetchTxDetails = async () => {
      try {
        const stored = await AsyncStorage.getItem('txDetails');
        setTxDetailsMap(stored ? JSON.parse(stored) : {});
      } catch (e) {
        console.error('AsyncStorage fetch error:', e);
      }
    };
    fetchTxDetails();
  }, []);

  const getValueDisplay = (tx: any) => {
    const stored = txDetailsMap[tx.tx_hash];
    if (stored && stored.unit !== 'TOKEN') {
      return `Value: $${stored.amount} ${stored.unit}`;
    }
    const ethValueStr = tx.value ? formatEther(tx.value) : '0';
    return `Value: ${Number(ethValueStr).toFixed(4)} ETH`;
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
    <TouchableOpacity style={styles.txItem} onPress={() => Linking.openURL(`${item.explorer}${item.tx_hash}`)}>
      <Ionicons name={getIconName(item)} size={24} color={getIconColor(item)} style={styles.icon} />
      <View style={styles.txInfo}>
        <Text style={styles.txDate}>{new Date(item.block_signed_at).toLocaleString()}</Text>
        <Text style={styles.txValue}>{getValueDisplay(item)}</Text>
        <Text style={[styles.txStatus, { color: item.successful ? 'green' : 'red' }]}>Status: {item.successful ? 'Success' : 'Failed'}</Text>
        <Text style={styles.txFromTo}>
          From: {item.from_address ? item.from_address.slice(0, 6) + '...' + item.from_address.slice(-4) : 'N/A'}
        </Text>
        <Text style={styles.txFromTo}>
          To: {item.to_address ? item.to_address.slice(0, 6) + '...' + item.to_address.slice(-4) : 'N/A'}
        </Text>
        <Text style={styles.txFee}>Fee: {formatEther(item.gas_spent || '0')} ETH</Text>
      </View>
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={styles.center}>
      <Text style={styles.empty}>No transactions to display yet!</Text>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View>;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>Failed to load history. Pull to refresh.</Text><TouchableOpacity onPress={refetch}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Transaction History</Text>
      <FlatList
        data={transactions}
        renderItem={renderTxItem}
        keyExtractor={(item) => item.tx_hash}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} colors={['#0A84FF']} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 32, fontWeight: 'bold', color: '#0A84FF', marginTop: 50, padding: 24, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16 },
  txItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#d6ecf4ff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  icon: { marginRight: 10 },
  txInfo: { flex: 1 },
  txDate: { fontWeight: 'bold' },
  txValue: { color: '#000' },
  txStatus: { fontWeight: 'bold' },
  txFromTo: { color: '#111111ff' },
  txFee: { color: '#888' },
  empty: { textAlign: 'center', color: '#888', marginTop: 10 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  retry: { color: '#0A84FF' },
});

export default HistoryTab;