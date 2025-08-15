import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TextInput, StyleSheet, Button, Image, RefreshControl } from 'react-native';
import { useBalances } from '../hooks/useBalances';
import { resetRoot } from '../navigation/RootNavigation';
import { COVALENT_KEY } from '@env';
import { getWalletAddress } from '../utils/wallet'; // From v0.4.0
import { Ionicons } from '@expo/vector-icons'; // Add for search icon

const Wallet = () => {
  const { balances, loading: cryptoLoading, error: cryptoError, fetchBalances } = useBalances();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('crypto'); // Default to crypto
  const [nfts, setNfts] = useState([]);
  const [nftLoading, setNftLoading] = useState(false);
  const [nftError, setNftError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [address, setAddress] = useState(''); // State for async address

  useEffect(() => {
    const loadAddress = async () => {
      const addr = await getWalletAddress();
      setAddress(addr);
    };
    loadAddress();
  }, []);

  const handleLogout = () => {
    resetRoot([{ name: 'Welcome' }]);
  };

  const totalNzd = balances.reduce((sum, item) => sum + (item.quote_nzd || 0), 0).toFixed(2);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchBalances(); // Refetch crypto balances
      if (viewMode === 'nfts') {
        await fetchNFTs();
      }
    } catch (err) {
      console.error('Refresh error', err);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchNFTs = async () => {
    setNftLoading(true);
    setNftError(null);
    try {
      const chainId = 11155111; // Sepolia (ETH testnet); add BSC testnet (97) later if needed
      const response = await fetch(`https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_nft/?key=${COVALENT_KEY}`);
      const data = await response.json();
      setNfts(data.data?.items || []);
    } catch (err) {
      setNftError(err.message);
    } finally {
      setNftLoading(false);
    }
  };

  // Fetch NFTs when switching to NFT view
  useEffect(() => {
    if (viewMode === 'nfts' && nfts.length === 0) {
      if (address) fetchNFTs();
    }
  }, [viewMode, address]);

<<<<<<< Updated upstream
  // Filter and sort crypto: by value descending, filter by search
  const filteredBalances = balances
    .filter(item => item.contract_address.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.quote_nzd || 0) - (a.quote_nzd || 0));

  const renderBalanceItem = ({ item }: { item: { contract_address: string; balance: string; quote_nzd: number; chain_id: number; logo_url: string; contract_ticker_symbol: string; contract_name: string } }) => (
    <View style={styles.balanceItem}>
      <Image source={{ uri: item.logo_url || 'https://logos.covalenthq.com/tokens/1/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png' }} style={styles.tokenLogo} />
      <View style={styles.tokenInfo}>
        <Text style={styles.assetName}>{item.contract_ticker_symbol || item.contract_name || 'ETH'} (Chain: {item.chain_id === 11155111 ? 'Sepolia (ETH)' : 'BSC Testnet'})</Text>
        <Text style={styles.assetBalance}>{item.balance}</Text>
      </View>
      <Text style={styles.assetValue}>NZ${(item.quote_nzd || 0).toFixed(2)}</Text>
    </View>
  );

  const renderNFTItem = ({ item }) => (
    <View style={styles.balanceItem}>
      <Image source={{ uri: item.nft_data?.external_data?.image || '' }} style={styles.nftImage} />
      <Text style={styles.assetName}>{item.contract_name || 'Unnamed NFT'}</Text>
      <Text>{item.nft_data?.external_data?.description?.slice(0, 50) || 'No description'}</Text>
    </View>
  );

  const data = viewMode === 'crypto' ? filteredBalances : nfts;
  const isLoading = viewMode === 'crypto' ? cryptoLoading : nftLoading;
  const error = viewMode === 'crypto' ? cryptoError : nftError;
  const emptyMessage = viewMode === 'crypto' ? 'You have no Tokens to display yet.' : 'You don\'t hold any NFT\'s yet.';

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View>;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={onRefresh} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.container}
        data={data}
        renderItem={viewMode === 'crypto' ? renderBalanceItem : renderNFTItem}
        keyExtractor={(item) => item.contract_address || item.token_id.toString()}
        ListEmptyComponent={<Text style={styles.empty}>{emptyMessage}</Text>}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.homeTitle}>Main Wallet</Text>
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total Balance</Text>
              <Text style={styles.totalValue}>NZ${totalNzd}</Text>
            </View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="gray" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search or enter code..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <View style={styles.switchButtons}>
              <Button title="Crypto" onPress={() => setViewMode('crypto')} color={viewMode === 'crypto' ? '#0A84FF' : 'gray'} style={styles.switchButton} />
              <Button title="NFTs" onPress={() => setViewMode('nfts')} color={viewMode === 'nfts' ? '#0A84FF' : 'gray'} style={styles.switchButton} />
            </View>
            <Text style={styles.subtitle}>Holdings:</Text>
          </View>
        }
        ListFooterComponent={null}
      />
      <View style={styles.logoutContainer}>
        <Button title="Logout" onPress={handleLogout} color="red" />
=======
  // Render crypto balance item
  const renderBalanceItem = ({ item }) => (
    <View style={styles.balanceItem}>
      <Image source={{ uri: item.logo_url }} style={styles.tokenLogo} />
      <View style={styles.tokenInfo}>
        <Text style={styles.assetName}>{item.contract_ticker_symbol} ({item.chain_id === 11155111 ? 'ETH' : 'BSC'})</Text>
        <Text style={styles.assetBalance}>{item.balance} {item.contract_ticker_symbol}</Text>
      </View>
      <Text style={styles.assetValue}>${item.quote_nzd.toFixed(2)} NZD</Text>
    </View>
  );

  // Render NFT item
  const renderNftItem = ({ item }) => (
    <View style={styles.balanceItem}>
      <Image source={{ uri: item.nft_data[0]?.external_data.image }} style={styles.nftImage} />
      <Text style={styles.assetName}>{item.contract_name}</Text>
      <Text style={styles.assetBalance}>Token ID: {item.nft_data[0]?.token_id}</Text>
    </View>
  );

  const filteredBalances = balances.filter(item => item.contract_ticker_symbol.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredNfts = nfts.filter(item => item.contract_name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <View style={styles.container}>
      <Text style={styles.homeTitle}>Home</Text>
      <View style={styles.totalContainer}>
        <Text style={styles.totalLabel}>Total Balance</Text>
        <Text style={styles.totalValue}>${totalNzd} NZD</Text>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="gray" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search assets..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      <View style={styles.switchButtons}>
        <Button title="Crypto" onPress={() => setViewMode('crypto')} color={viewMode === 'crypto' ? '#0A84FF' : 'gray'} style={styles.switchButton} />
        <Button title="NFTs" onPress={() => setViewMode('nfts')} color={viewMode === 'nfts' ? '#0A84FF' : 'gray'} style={styles.switchButton} />
      </View>
      {viewMode === 'crypto' ? (
        <FlatList
          data={filteredBalances}
          keyExtractor={(item) => item.contract_address + item.chain_id}
          renderItem={renderBalanceItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={cryptoLoading ? <ActivityIndicator /> : (
            <Text style={styles.empty}>{cryptoError ? cryptoError : 'No crypto assets yet'}</Text>
          )}
        />
      ) : (
        <FlatList
          data={filteredNfts}
          keyExtractor={(item) => item.contract_address + item.chain_id}
          renderItem={renderNftItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={nftLoading ? <ActivityIndicator /> : (
            <Text style={styles.empty}>{nftError ? nftError : 'No NFTs yet'}</Text>
          )}
        />
      )}
      <View style={styles.logoutContainer}>
        <Button title="Logout" onPress={handleLogout} color="#FF0000" />
>>>>>>> Stashed changes
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
<<<<<<< Updated upstream
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
=======
>>>>>>> Stashed changes
  homeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#0A84FF', // Blue color
    textAlign: 'center', // Centered
  },
  totalContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  totalLabel: {
    fontSize: 18,
    color: '#000',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20, // Curved edges
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 5,
  },
  searchInput: {
    flex: 1,
    padding: 10,
  },
  switchButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
  },
  switchButton: {
    borderRadius: 25, // Rounded like Get Started
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  balanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tokenLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  tokenInfo: {
    flex: 1,
  },
  assetName: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  assetBalance: {
    color: 'gray',
    fontSize: 14,
  },
  assetValue: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  nftImage: {
    width: 50,
    height: 50,
    marginBottom: 5,
  },
  empty: {
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
  },
  logoutContainer: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    padding: 10,
  },
});

export default Wallet;