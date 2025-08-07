// src/screens/HistoryTab.tsx
import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from 'react-native';
import { useTransactions, Transaction } from '../hooks/useTransactions';

export default function HistoryTab() {
  const txns = useTransactions();

  const renderItem = ({ item }: { item: Transaction }) => {
    const date = new Date(item.block_signed_at).toLocaleString();
    const eth  = Number(item.value) / 1e18;
    const direction = item.from_address.toLowerCase() === item.to_address.toLowerCase()
      ? 'Self'
      : item.from_address.toLowerCase() === item.from_address.toLowerCase()
        ? 'Out'
        : 'In';

    return (
      <View style={styles.item}>
        <Text style={styles.date}>{date}</Text>
        <Text numberOfLines={1} style={styles.hash}>{item.tx_hash}</Text>
        <Text style={styles.amount}>
          {direction} {eth.toFixed(6)} ETH
        </Text>
        <Text style={styles.status}>
          {item.successful ? '✅ Success' : '❌ Failed'}
        </Text>
      </View>
    );
  };

  return (
    <FlatList
      data={txns}
      keyExtractor={item => item.tx_hash}
      renderItem={renderItem}
      contentContainerStyle={txns.length ? styles.list : styles.emptyContainer}
      ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 12,
  },
  date: { fontSize: 12, color: '#666' },
  hash: { fontSize: 14, fontFamily: 'monospace', marginVertical: 4 },
  amount: { fontSize: 16, fontWeight: 'bold' },
  status: { fontSize: 14, marginTop: 4 },
  empty: { color: '#888' },
});
