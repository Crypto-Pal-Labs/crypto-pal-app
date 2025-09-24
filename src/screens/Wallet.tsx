import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, TextInput, StyleSheet, Button, Image, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackActions } from '@react-navigation/native';
import { ethers } from 'ethers';
import { useAssets } from '../hooks/useAssets';
import { getWalletAddress, clearWallet } from '../utils/wallet';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '../store/useWalletStore';
import { Picker } from '@react-native-picker/picker';
import { useChain } from '../hooks/useChain';

const Wallet = () => {
  const navigation = useNavigation();
  const isMounted = useRef(true);
  const setAddress = useWalletStore((state) => state.setAddress);
  const { currentChain, setCurrentChain, chains } = useChain();
  const { balances, nfts, loading, error, refresh } = useAssets();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('crypto');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localAddress, setLocalAddress] = useState('');
  const [currency, setCurrency] = useState('USD'); // Fixed: Hardcode 'USD' default

  useEffect(() => {
    loadAddress();
    return () => {
      isMounted.current = false;
    };
  }, [setAddress]);

  const loadAddress = async () => {
    if (!isMounted.current) return;
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
      if (isMounted.current) setLoadError((err as Error).message || 'Failed to load wallet address.');
    }
  };

  const handleLogout = async () => {
    if (!isMounted.current) return;
    try {
      await clearWallet();
      console.log('Logout: Cleared storage, dispatching nav to Welcome');
      navigation.dispatch(StackActions.replace('Welcome'));
    } catch (error) {
      if (isMounted.current) {
        console.error('Logout error:', error);
        Alert.alert('Error', 'Failed to logout.');
      }
    }
  };

  const totalValue = balances.reduce((sum, item) => {
    const quote = currency === 'NZD' ? (item.quote || 0) : (item.quoteUsd || 0);
    return sum + quote;
  }, 0).toFixed(2);

  const onRefresh = async () => {
    if (!isMounted.current) return;
    setRefreshing(true);
    await refresh();
    if (isMounted.current) setRefreshing(false);
  };

  const filteredBalances = balances.filter((item) => Number(ethers.utils.formatEther(item.balance)) > 0 && item.contract_ticker_symbol.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredNfts = nfts.filter((item) =>
    (item.contract_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.token_id.includes(searchQuery)
  );

  const renderBalanceItem = ({ item }: { item: any }) => (
    <View style={styles.balanceItem}>
      <Image source={{ uri: item.logo_url || 'https://placeholder.com/40x40' }} style={styles.tokenLogo} />
      <View style={styles.tokenInfo}>
        <Text style={styles.assetName}>{item.contract_ticker_symbol} {item.contract_name ? `(${item.contract_name})` : ''}</Text>
        <Text style={styles.assetBalance}>{Number(ethers.utils.formatEther(item.balance)).toFixed(8)} {item.contract_ticker_symbol}</Text>
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
        <Ionicons name="refresh-circle" size={50} color="#0A84FF" />
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
      <View style={styles.pickerRow}>
        <Picker
          selectedValue={currentChain}
          onValueChange={(itemValue) => setCurrentChain(itemValue)}
          style={styles.picker}
          itemStyle={styles.pickerItem}
          mode="dropdown"
        >
          {Object.keys(chains).map((key) => (
            <Picker.Item key={key} label={chains[key].name} value={key} />
          ))}
        </Picker>
        <Picker
          selectedValue={currency}
          onValueChange={(itemValue) => setCurrency(itemValue)}
          style={styles.picker}
          itemStyle={styles.pickerItem}
          mode="dropdown"
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
          style={styles.assetList}
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
  container: { flex: 1, backgroundColor: '#fff' },
  heading: { fontSize: 36, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', marginTop: 20 },
  totalLabel: { fontSize: 20, color: '#000', textAlign: 'center', marginBottom: 5 },
  totalValue: { fontSize: 27, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', marginBottom: 5 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingHorizontal: 5, marginHorizontal: 10, marginBottom: 5 },
  searchIcon: { marginRight: 5 },
  searchInput: { flex: 1, padding: 5 },
  switchButtons: { flexDirection: 'row', justifyContent: 'center', marginBottom: 5 },
  activeToggle: { borderBottomWidth: 2, borderBottomColor: '#0A84FF', padding: 5, marginHorizontal: 10 },
  inactiveToggle: { padding: 5, marginHorizontal: 10 },
  activeToggleText: { color: '#0A84FF', fontWeight: 'bold' },
  inactiveToggleText: { color: '#888' },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 10, marginBottom: 5 },
  picker: { height: 30, width: '48%', color: '#0A84FF' },
  pickerItem: { height: 30, fontSize: 12, color: '#0A84FF' },
  assetList: { flex: 1 },
  balanceItem: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#f1f7deff', borderRadius: 8, shadowColor: '#0004ffff', shadowOpacity: 0.1, shadowRadius: 12, elevation: 4, marginBottom:10 },
  tokenLogo: { width: 60, height: 80, borderRadius: 0, marginRight: 20 },
  tokenInfo: { flex: 1 },
  assetName: { fontWeight: 'bold', fontSize: 20, color: '#0A84FF' },
  assetBalance: { color: 'gray', fontSize: 12 },
  assetValue: { fontWeight: 'bold', fontSize: 20, color: '#0A84FF' },
  empty: { textAlign: 'center', color: '#888', marginTop: 50 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 5 },
  retry: { color: '#0A84FF', marginTop: 5 },
  logoutContainer: { padding: 10, position: 'absolute', bottom: 20, left: 0, right: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default Wallet;