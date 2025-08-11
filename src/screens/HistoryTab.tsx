import React from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useHistory } from '../hooks/useHistory';

const History = () => {
  const { transactions, loading, error } = useHistory();

  const explorerBase = 'https://etherscan.io/tx/'; // Update for BSC if needed

  const renderTxItem = ({ item }: { item: { tx_hash: string; block_signed_at: string; value: string; successful: boolean } }) => (
    <View style={styles.txItem}>
      <Text style={styles.txDate}>{new Date(item.block_signed_at).toLocaleString()}</Text>
      <Text>Value: {ethers.formatEther(item.value)}</Text>
      <Text>Status: {item.successful ? 'Success' : 'Failed'}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(`${explorerBase}${item.tx_hash}`)}>
        <Text style={styles.link}>View on Explorer</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View>;
  if (error) return <Text style={styles.errorText}>{error}</Text>;

  return (
    <FlatList
      data={transactions}
      renderItem={renderTxItem}
      keyExtractor={(item) => item.tx_hash}
      ListEmptyComponent={<Text style={styles.empty}>No transaction history yet. Your transactions will show here once completed...</Text>}
      contentContainerStyle={styles.listContainer}
    />
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16 },
  txItem: { padding: 12, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  txDate: { fontWeight: 'bold' },
  link: { color: 'blue', marginTop: 4 },
  empty: { textAlign: 'center', color: '#888', marginTop: 20 },
  errorText: { color: 'red', textAlign: 'center', marginTop: 20 },
});

export default History;