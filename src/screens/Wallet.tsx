import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as SecureStore from 'expo-secure-store';
import useAssets from '../hooks/useAssets';
import { ChainKey } from '../hooks/chains';

const Wallet = () => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<ChainKey>('eth');
  const { balances, loading, error } = useAssets(selectedChain, walletAddress || '');

  useEffect(() => {
    const fetchAddress = async () => {
      const address = await SecureStore.getItemAsync('walletAddress'); // Adjust key if different
      setWalletAddress(address);
    };
    fetchAddress();
  }, []);

  if (!walletAddress) return <Text>Loading wallet address...</Text>;
  if (loading) return <ActivityIndicator size="large" color="#0A84FF" />;
  if (error) return <Text>Error: {error}</Text>;
  if (balances.length === 0) return <Text>No balances found for {chains[selectedChain].name}.</Text>;

  return (
    <View style={styles.container}>
      <Picker selectedValue={selectedChain} onValueChange={setSelectedChain} style={styles.picker}>
        <Picker.Item label="Sepolia (ETH)" value="eth" />
        <Picker.Item label="BSC Testnet" value="bsc" />
        <Picker.Item label="Polygon Amoy" value="polygon" />
      </Picker>
      <FlatList
        data={balances}
        keyExtractor={(item) => item.contract_address || 'native'}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text>{item.contract_name}: {item.balance}</Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  picker: { marginBottom: 16 },
  item: { padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
});

export default Wallet;