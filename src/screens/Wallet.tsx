import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ethers from 'ethers';
import useAssets from '../hooks/useAssets';
import { Ionicons } from '@expo/vector-icons';

interface AssetItem {
  contract_name: string;
  balance: string;
  quote_rate: number;
  contract_address?: string;
}

const Wallet = () => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { balances, loading, error } = useAssets('eth', walletAddress || '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchOrDeriveAddress = async () => {
      try {
        let address = await SecureStore.getItemAsync('address');
        if (!address) {
          const mnemonic = await SecureStore.getItemAsync('mnemonic');
          if (!mnemonic) return Alert.alert('No Wallet', 'Complete onboarding.');
          const wallet = ethers.Wallet.fromPhrase(mnemonic);
          address = wallet.address;
          await SecureStore.setItemAsync('address', address);
        }
        setWalletAddress(address);
      } catch (error) {
        Alert.alert('Error', 'Failed to load wallet.');
      }
    };
    fetchOrDeriveAddress();
  }, []);

  const logout = async () => {
    await SecureStore.deleteItemAsync('mnemonic');
    await SecureStore.deleteItemAsync('address');
    Alert.alert('Logged Out', 'Return to welcome screen.');
  };

  const getFiatValue = (balance: string, quoteRate: number, currency: 'NZD' | 'USD') => {
    const rate = currency === 'NZD' ? 1.6 : 1; // Original stub
    return (parseFloat(balance) * quoteRate * rate).toFixed(2);
  };

  const filteredBalances = balances.filter((item: AssetItem) => item.contract_name.toLowerCase().includes(search.toLowerCase()));

  if (!walletAddress) return <Text>Loading wallet...</Text>;
  if (loading) return <ActivityIndicator size="large" color="#0A84FF" />;
  if (error) return <Text>Error: {error}</Text>;

  return (
    <View style={styles.container}>
      <TextInput style={styles.search} placeholder="Search assets..." value={search} onChangeText={setSearch} />
      <FlatList
        data={filteredBalances}
        keyExtractor={(item: AssetItem) => item.contract_address || 'native'}
        renderItem={({ item }: { item: AssetItem }) => (
          <View style={styles.card}>
            <Ionicons name="wallet-outline" size= {24} color="#0A84FF" style={styles.icon} />
            <View style={styles.info}>
              <Text style={styles.name}>{item.contract_name}</Text>
              <Text style={styles.balance}>{item.balance}</Text>
              <Text style={styles.fiat}>NZD: ${getFiatValue(item.balance, item.quote_rate, 'NZD')} (USD: ${getFiatValue(item.balance, item.quote_rate, 'USD')})</Text>
            </View>
          </View>
        )}
        ListEmptyComponent=<Text>No balances found.</Text>
      />
      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  search: { padding: 8, borderWidth: 1, borderColor: '#eee', borderRadius: 4, marginBottom: 16 },
  card: { flexDirection: 'row', padding: 16, marginVertical: 8, backgroundColor: '#f9f9f9', borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
  icon: { marginRight: 16 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: 'bold' },
  balance: { fontSize: 14, color: '#333' },
  fiat: { fontSize: 12, color: '#888' },
  logout: { padding: 16, backgroundColor: '#0A84FF', borderRadius: 4, alignItems: 'center', marginTop: 16 },
  logoutText: { color: '#fff', fontWeight: 'bold' },
});

export default Wallet;