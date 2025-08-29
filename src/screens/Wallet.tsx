import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TextInput, StyleSheet, Button, Image, RefreshControl, TouchableOpacity } from 'react-native';
import { ethers } from 'ethers';
import { useAssets } from '../hooks/useAssets';
import { resetRoot } from '../navigation/RootNavigation';
import { getWalletAddress } from '../utils/wallet';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '../store/useWalletStore';
import { Picker } from '@react-native-picker/picker';

const Wallet = () => {
  const setAddress = useWalletStore((state) => state.setAddress);
  const { balances, nfts, loading, error, refetch } = useAssets();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('crypto');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localAddress, setLocalAddress] = useState('');
  const [currency, setCurrency] = useState('NZD'); // Default to NZD per NZ focus

  useEffect(() => {
    loadAddress();
  }, [setAddress]);

  const loadAddress = async () => {
    setLoadError(null);
    try {
      const currentAddress = await getWalletAddress();
      if (currentAddress) {
        setAddress(currentAddress);
        setLocalAddress(currentAddress);
      } else {
        throw new Error('No address returned from secure store.');
      }
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load wallet address.');
    }
  };

  const handleLogout = () => {
    resetRoot([{ name: 'Welcome' }]);
  };

  const totalValue = balances.reduce((sum, item) => {
    const quote = currency === 'NZD' ? (item.quote || 0) : (item.quoteUsd || 0);
    return sum + quote;
  }, 0).toFixed(2);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filteredBalances = balances.filter((item) => Number(ethers.formatEther(item.balance)) > 0 && item.contract_ticker_symbol.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredNfts = nfts.filter((item) =>
    (item.contract_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.token_id.includes(searchQuery) // Enhanced for token_id search
  );

  const renderBalanceItem = ({ item }: { item: any }) => (
    <View style={styles.balanceItem}>
      <Image source={{ uri: item.logo_url || 'https://placeholder.com/40x40' }} style={styles.tokenLogo} />
      <View style={styles.tokenInfo}>
        <Text style={styles.assetName}>{item.contract_ticker_symbol}</Text>
        <Text style={styles.assetBalance}>{ethers.formatEther(item.balance)} {item.contract_ticker_symbol}</Text>
      </View>
      <Text style={styles.assetValue}>${currency === 'NZD' ? (item.quote ? item.quote.toFixed(2) : 'N/A') : (item.quoteUsd ? item.quoteUsd.toFixed(2) : 'N/A')} {currency}</Text>
    </View>
  );

  const renderNFTItem = ({ item }: { item: any }) => (
    <View style={styles.balanceItem}>
      <Image source={{ uri: item.logo_url || 'https://placeholder.com/40x40' }} style={styles.tokenLogo} />
      <View style={styles.tokenInfo}>
        <Text style={styles.assetName}>{item.contract_name || 'NFT'}</Text>
        <Text style={styles.assetBalance}>Token ID: {item.token_id}</Text>
      </View>
      <Text style={styles.assetValue}>Value: N/A</Text>
    </View>
  );

  const EmptyState = () => (
    <View style={styles.center}>
      <Text style={styles.empty}>No tokens to display yet</Text>
      <TouchableOpacity onPress={onRefresh}>
        <Ionicons name="refresh-circle" size={40} color="#0A84FF" />
      </TouchableOpacity>
    </View>
  );

  if (loadError) return <View style={styles.center}><Text style={styles.errorText}>{loadError}</Text><TouchableOpacity onPress={loadAddress}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Home</Text>
      <Text style={styles.totalLabel}>Total Balance:</Text>
      <Text style={styles.totalValue}>${totalValue} {currency}</Text>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput style={styles.searchInput} placeholder="Search your assets..." value={searchQuery} onChangeText={setSearchQuery} />
      </View>
      <View style={styles.switchButtons}>
        <TouchableOpacity style={viewMode === 'crypto' ? styles.activeToggle : styles.inactiveToggle} onPress={() => setViewMode('crypto')}>
          <Text style={viewMode === 'crypto' ? styles.activeToggleText : styles.inactiveToggleText}>CRYPTOs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={viewMode === 'nfts' ? styles.activeToggle : styles.inactiveToggle} onPress={() => setViewMode('nfts')}>
          <Text style={viewMode === 'nfts' ? styles.activeToggleText : styles.inactiveToggleText}>NFTs</Text>
        </TouchableOpacity>
      </View>
      <View style={{ alignSelf: 'center', width: 120, height: 60, overflow: 'visible' }}>
        <Picker
          selectedValue={currency}
          onValueChange={(itemValue) => setCurrency(itemValue)}
          style={{ height: 60, width: 120, color: '#0A84FF' }} // Blue text
          itemStyle={{ height: 60, fontSize: 16, color: '#0A84FF' }} // Blue item text
        >
          <Picker.Item label="NZD" value="NZD" />
          <Picker.Item label="USD" value="USD" />
        </Picker>
      </View>
      {error && <Text style={styles.errorText}>{error} <TouchableOpacity onPress={onRefresh}><Text style={styles.retry}>Retry</Text></TouchableOpacity></Text>}
      {loading ? (
        <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />
      ) : (
        <FlatList
          data={viewMode === 'crypto' ? filteredBalances : filteredNfts}
          renderItem={viewMode === 'crypto' ? renderBalanceItem : renderNFTItem}
          keyExtractor={(item) => item.contract_address + (item.token_id || '')}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={EmptyState}
        />
      )}
      <View style={styles.logoutContainer}>
        <Button title="LOGOUT" color="red" onPress={handleLogout} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  heading: { fontSize: 28, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', marginTop: 40 },
  totalLabel: { fontSize: 18, color: '#000', textAlign: 'center' },
  totalValue: { fontSize: 24, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingHorizontal: 10, margin: 10 },
  searchIcon: { marginRight: 5 },
  searchInput: { flex: 1, padding: 10 },
  switchButtons: { flexDirection: 'row', justifyContent: 'center', marginBottom: 10 },
  activeToggle: { borderBottomWidth: 2, borderBottomColor: '#0A84FF', padding: 10, marginHorizontal: 10 },
  inactiveToggle: { padding: 10, marginHorizontal: 10 },
  activeToggleText: { color: '#0A84FF', fontWeight: 'bold' },
  inactiveToggleText: { color: '#888' },
  balanceItem: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  tokenLogo: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  tokenInfo: { flex: 1 },
  assetName: { fontWeight: 'bold', fontSize: 16, color: '#0A84FF' }, // Blue
  assetBalance: { color: 'gray', fontSize: 14 },
  assetValue: { fontWeight: 'bold', fontSize: 16, color: '#0A84FF' }, // Blue
  empty: { textAlign: 'center', color: '#888', marginTop: 100 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  retry: { color: '#0A84FF', marginTop: 10 },
  logoutContainer: { padding: 10, position: 'absolute', bottom: 0, left: 0, right: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default Wallet;