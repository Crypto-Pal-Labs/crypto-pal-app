// src/screens/HistoryTab.tsx
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet, Linking, TouchableOpacity, RefreshControl } from 'react-native';
import { ethers } from 'ethers';
import { useHistory } from '../hooks/useHistory';
import { useWalletStore } from '../store/useWalletStore';
import { getWalletAddress } from '../utils/wallet';

const HistoryTab = () => {
  const setAddress = useWalletStore((state) => state.setAddress);
  const { transactions, loading, error, refetch } = useHistory();

  useEffect(() => {
    const loadAddress = async () => {
      const currentAddress = await getWalletAddress();
      if (currentAddress) setAddress(currentAddress);
    };
    loadAddress();
  }, [setAddress]);

  const renderTxItem = ({ item }: { item: any }) => (
    <View style={styles.txItem}>
      <Text style={styles.txDate}>{new Date(item.block_signed_at).toLocaleString()}</Text>
      <Text>Value: {ethers.formatEther(item.value || '0')} {item.chainId === 97 ? 'BNB' : 'ETH'}</Text>
      <Text>Status: {item.successful ? 'Success' : 'Failed'}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(`${item.explorer}${item.tx_hash}`)}>
        <Text style={styles.link}>View on Explorer</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View>;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={refetch}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>History</Text>
      <FlatList
        data={transactions}
        renderItem={renderTxItem}
        keyExtractor={(item) => item.tx_hash}
        ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.empty}>No transactions to display yet</Text></View>}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} colors={['#0A84FF']} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontWeight: 'bold', color: '#0A84FF', padding: 16, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16 },
  txItem: { padding: 12, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  txDate: { fontWeight: 'bold' },
  link: { color: '#0A84FF', marginTop: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', height: '100%' }, // Center vertically
  empty: { textAlign: 'center', color: '#888' },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  retry: { color: '#0A84FF', marginTop: 10 },
});

export default HistoryTab;