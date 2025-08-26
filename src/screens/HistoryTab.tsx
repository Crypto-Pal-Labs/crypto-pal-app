// src/screens/HistoryTab.tsx
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet, Linking, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Add this import for icons
import { useHistory } from '../hooks/useHistory';
import { useWalletStore } from '../store/useWalletStore';
import { getWalletAddress } from '../utils/wallet';

const HistoryTab = () => {
  const setAddress = useWalletStore((state) => state.setAddress);
  const { transactions, loading, error, refetch } = useHistory();
  const address = useWalletStore((state) => state.address);

  useEffect(() => {
    const loadAddress = async () => {
      const currentAddress = await getWalletAddress();
      if (currentAddress) setAddress(currentAddress);
    };
    loadAddress();
  }, [setAddress]);

  const getIconName = (tx: any) => {
    if (tx.from_address.toLowerCase() === address.toLowerCase()) return 'arrow-forward'; // Sent
    return 'arrow-back'; // Received
  };

  const renderTxItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.txItem} onPress={() => Linking.openURL(`${item.explorer}${item.tx_hash}`)}>
      <Ionicons name={getIconName(item)} size={24} color="#0A84FF" style={styles.icon} />
      <View style={styles.txInfo}>
        <Text style={styles.txDate}>{new Date(item.block_signed_at).toLocaleString()}</Text>
        <Text style={styles.txValue}>Value: {item.value} ETH</Text>
        <Text style={[styles.txStatus, { color: item.successful ? 'green' : 'red' }]}>Status: {item.successful ? 'Success' : 'Failed'}</Text>
        <Text style={styles.txFromTo}>From: {item.from_address.slice(0, 6)}... To: {item.to_address.slice(0, 6)}...</Text>
        <Text style={styles.txFee}>Fee: {item.gas_quote.toFixed(4)} ETH</Text>
      </View>
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={styles.center}>
      <Ionicons name="wallet-outline" size={64} color="gray" />
      <Text style={styles.empty}>No transactions yet—try buying or sending!</Text>
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
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} colors={['#0A84FF']} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 28, fontWeight: 'bold', color: '#0A84FF', marginTop: 20, padding: 16, textAlign: 'center' },
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
});

export default HistoryTab;