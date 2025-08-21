import React from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet, Linking, TouchableOpacity, RefreshControl } from 'react-native';
import { ethers } from 'ethers'; // For formatEther (v6 top-level)
import { useHistory } from '../hooks/useHistory';

const HistoryTab = () => {
  const { transactions, loading, error, refetch } = useHistory();

  const renderTxItem = ({ item }) => (
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
    <FlatList
      data={transactions}
      renderItem={renderTxItem}
      keyExtractor={(item) => item.tx_hash}
      ListEmptyComponent={<Text style={styles.empty}>No transactions to display yet</Text>}
      contentContainerStyle={styles.listContainer}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} colors={['#0A84FF']} />}
    />
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16 },
  txItem: { padding: 12, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  txDate: { fontWeight: 'bold' },
  link: { color: '#0A84FF', marginTop: 4 },
  empty: { textAlign: 'center', color: '#888', marginTop: 20 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  retry: { color: '#0A84FF', marginTop: 10 },
});

export default HistoryTab;