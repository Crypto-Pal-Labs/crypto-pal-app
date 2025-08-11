import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Button, FlatList, TextInput, StyleSheet } from 'react-native';
import { useBalances } from '../hooks/useBalances';
import { resetRoot } from '../navigation/RootNavigation';

const Wallet = () => {
  const { balances, loading, error } = useBalances();
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = () => {
    resetRoot([{ name: 'Welcome' }]);
  };

  const totalNzd = balances.reduce((sum, item) => sum + (item.quote_nzd || 0), 0).toFixed(2);

  // Filter and sort: by value descending, filter by search
  const filteredBalances = balances
    .filter(item => item.contract_address.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.quote_nzd || 0) - (a.quote_nzd || 0));

  const renderBalanceItem = ({ item }: { item: { contract_address: string; balance: string; quote_nzd: number; chain_id: number } }) => (
    <View style={styles.balanceItem}>
      <Text style={styles.assetName}>{item.contract_address} (Chain: {item.chain_id === 1 ? 'ETH' : 'BSC'})</Text>
      <Text>{item.balance} (NZ${(item.quote_nzd || 0).toFixed(2)})</Text>
    </View>
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View>;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={() => { /* Refetch trigger if needed */ }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.homeTitle}>Home</Text>
      <Text style={styles.total}>Total Balance: NZ${totalNzd}</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search crypto currency..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <Text style={styles.subtitle}>Assets</Text>
      <FlatList
        data={filteredBalances}
        renderItem={renderBalanceItem}
        keyExtractor={(item) => `${item.contract_address}-${item.chain_id}`}
        ListEmptyComponent={<Text style={styles.empty}>No assets match your search or holdings yet.</Text>}
      />
      <Button title="Logout" onPress={handleLogout} color="red" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8f8f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  homeTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  total: { fontSize: 28, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', marginBottom: 16 },
  searchInput: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 8, marginBottom: 16 },
  subtitle: { fontSize: 18, marginBottom: 8 },
  balanceItem: { padding: 12, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  assetName: { fontWeight: 'bold' },
  empty: { textAlign: 'center', color: '#888' },
  errorText: { color: 'red', marginBottom: 16 },
});

export default Wallet;