import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TextInput, StyleSheet, Button, Image, RefreshControl, TouchableOpacity } from 'react-native';
import { useAssets } from '../hooks/useAssets';
import { resetRoot } from '../navigation/RootNavigation';
import { getWalletAddress } from '../utils/wallet';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '../store/useWalletStore';
import { Picker } from '@react-native-picker/picker';
import { useEthPrice } from '../hooks/useEthPrice'; // For live prices

interface BalanceItem {
  contract_address: string;
  contract_name: string | null;
  contract_ticker_symbol: string | null;
  logo_url: string | null;
  balance: string;
  contract_decimals: number;
  quote: number;
  type: string | null;
}

interface NFTItem {
  contract_address: string;
  contract_name: string | null;
  contract_ticker_symbol: string | null;
  logo_url: string | null;
  token_id: string;
  description: string | null;
  quote: number;
  type: string | null;
}

const Wallet = () => {
  const setAddress = useWalletStore((state) => state.setAddress);
  const { balances, nfts, loading, error, refetch } = useAssets();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('crypto');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localAddress, setLocalAddress] = useState('');
  const [currency, setCurrency] = useState('usd'); // Default to USD
  const [availableCurrencies, setAvailableCurrencies] = useState(['usd', 'nzd']);

  const { prices: ethPrices, localCurrency } = useEthPrice();

  useEffect(() => {
    if (localCurrency && !availableCurrencies.includes(localCurrency)) {
      setAvailableCurrencies((prev) => [...prev, localCurrency]);
    }
  }, [localCurrency]);

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

  const formatBalance = (balance: string, decimals = 18) => {
    balance = balance || '0';
    let str = balance.toString();
    const len = str.length;
    if (len <= decimals) {
      str = '0.' + '0'.repeat(decimals - len) + str;
    } else {
      str = str.slice(0, len - decimals) + '.' + str.slice(len - decimals);
    }
    return parseFloat(str).toFixed(4); // Limit to 4 decimals for display
  };

  const totalValue = balances.reduce((sum, item: BalanceItem) => {
    const formattedBalance = formatBalance(item.balance, item.contract_decimals);
    const price = ethPrices[currency] || 0;
    const quote = parseFloat(formattedBalance) * price;
    return sum + quote;
  }, 0).toFixed(2);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filteredAssets = (viewMode === 'crypto' ? balances : nfts).filter(item => 
    (item.contract_name ? item.contract_name.toLowerCase() : '').includes(searchQuery.toLowerCase()) || (item.contract_ticker_symbol ? item.contract_ticker_symbol.toLowerCase() : '').includes(searchQuery.toLowerCase())
  );

  const renderItem = ({ item }: { item: BalanceItem | NFTItem }) => {
    const price = ethPrices[currency] || 0;
    const formattedBalance = 'balance' in item ? formatBalance(item.balance, item.contract_decimals) : '1'; // NFTs have 1 unit
    const formattedValue = (viewMode === 'crypto' ? parseFloat(formattedBalance) * price : (item.quote || 0)).toFixed(2);
    const name = (item.contract_ticker_symbol === 'ETH' && (item.contract_name === 'Unknown' || item.contract_name == null || item.type === 'cryptocurrency' || item.contract_address === '0x0000000000000000000000000000000000000000')) ? 'Ethereum' : item.contract_name || 'Unknown';
    const symbol = viewMode === 'crypto' ? (item.contract_ticker_symbol || 'UNK') : ''; // Hide symbol for NFTs
    const description = viewMode === 'nft' ? (item.description || 'No description') : formattedBalance;
    return (
      <View style={styles.balanceItem}>
        <Image source={{ uri: item.logo_url }} style={styles.tokenLogo} />
        <View style={styles.tokenInfo}>
          <Text style={styles.assetName}><Text style={styles.assetSymbol}>{symbol}</Text> {name}</Text>
          <Text style={styles.assetBalance}>{description}</Text>
        </View>
        <Text style={styles.assetValue}>${formattedValue} {currency.toUpperCase()}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Wallet</Text>
      <Text style={styles.totalLabel}>Total Balance</Text>
      <View style={styles.totalRow}>
        <View style={styles.totalAmountContainer}>
          <Text style={styles.totalValue}>${totalValue}</Text>
        </View>
        <Picker selectedValue={currency} onValueChange={setCurrency} style={styles.currencyPicker}>
          {availableCurrencies.map((curr) => (
            <Picker.Item key={curr} label={curr.toUpperCase()} value={curr} />
          ))}
        </Picker>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput style={styles.searchInput} placeholder="Search your assets ..." value={searchQuery} onChangeText={setSearchQuery} />
      </View>
      <View style={styles.switchButtons}>
        <TouchableOpacity style={viewMode === 'crypto' ? styles.activeToggle : styles.inactiveToggle} onPress={() => setViewMode('crypto')}>
          <Text style={viewMode === 'crypto' ? styles.activeToggleText : styles.inactiveToggleText}>Crypto</Text>
        </TouchableOpacity>
        <TouchableOpacity style={viewMode === 'nft' ? styles.activeToggle : styles.inactiveToggle} onPress={() => setViewMode('nft')}>
          <Text style={viewMode === 'nft' ? styles.activeToggleText : styles.inactiveToggleText}>NFTs</Text>
        </TouchableOpacity>
      </View>
      {loading || refreshing ? (
        <ActivityIndicator style={styles.center} />
      ) : filteredAssets.length === 0 ? (
        <Text style={styles.empty}>No {viewMode} to display yet</Text>
      ) : (
        <FlatList
          data={filteredAssets}
          renderItem={renderItem}
          keyExtractor={(item) => item.contract_address || item.token_id || Math.random().toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
      {loadError && <Text style={styles.errorText}>{loadError}</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {loadError && <TouchableOpacity onPress={loadAddress} style={styles.retry}>
        <Text>Retry</Text>
      </TouchableOpacity>}
      <View style={styles.logoutContainer}>
        <Button title="LOGOUT" color="red" onPress={handleLogout} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  heading: { fontSize: 34, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', marginTop: 40 },
  totalLabel: { fontSize: 22, color: '#000', textAlign: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '110%', paddingHorizontal: 20, marginBottom: 10 },
  totalAmountContainer: { flex: 1, alignItems: 'center' },
  totalValue: { fontSize: 24, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center' },
  currencyPicker: { color: '#0A84FF', width: 100 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingHorizontal: 10, margin: 10 },
  searchIcon: { marginRight: 5 },
  searchInput: { flex: 1, padding: 10 },
  switchButtons: { flexDirection: 'row', justifyContent: 'center', marginBottom: 10 },
  activeToggle: { borderBottomWidth: 2, borderBottomColor: '#0A84FF', padding: 10, marginHorizontal: 10 },
  inactiveToggle: { padding: 10, marginHorizontal: 10 },
  activeToggleText: { color: '#0A84FF', fontWeight: 'bold' },
  inactiveToggleText: { color: '#888' },
  balanceItem: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  tokenLogo: { width: 50, height: 80, borderRadius: 0, marginRight: 10 },
  tokenInfo: { flex: 1 },
  assetName: { fontWeight: 'bold', fontSize: 16, color: '#0A84FF' },
  assetSymbol: { fontSize: 20, fontWeight: 'bold', color: '#0A84FF' }, // Larger symbol
  assetBalance: { color: 'gray', fontSize: 14 },
  assetValue: { fontWeight: 'bold', fontSize: 16, color: '#0A84FF' },
  empty: { textAlign: 'center', color: '#888', marginTop: 100 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10 },
  retry: { color: '#0A84FF', marginTop: 10, textAlign: 'center' },
  logoutContainer: { padding: 10, position: 'absolute', bottom: 10, left: 10, right: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default Wallet;