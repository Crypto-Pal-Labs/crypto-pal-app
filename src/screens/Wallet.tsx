import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TextInput, StyleSheet, Button, Image } from 'react-native';
import { useBalances } from '../hooks/useBalances';
import { resetRoot } from '../navigation/RootNavigation';
import { COVALENT_KEY } from '@env';
import { getWalletAddress } from '../utils/wallet'; // From v0.4.0

const Wallet = () => {
  const { balances, loading: cryptoLoading, error: cryptoError } = useBalances();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('crypto'); // Default to crypto
  const [nfts, setNfts] = useState([]);
  const [nftLoading, setNftLoading] = useState(false);
  const [nftError, setNftError] = useState(null);

  const address = getWalletAddress(); // User's address

  const handleLogout = () => {
    resetRoot([{ name: 'Welcome' }]);
  };

  const totalNzd = balances.reduce((sum, item) => sum + (item.quote_nzd || 0), 0).toFixed(2);

  // Fetch NFTs when switching to NFT view
  useEffect(() => {
    if (viewMode === 'nfts' && nfts.length === 0) {
      const fetchNFTs = async () => {
        setNftLoading(true);
        setNftError(null);
        try {
          const chainId = 1; // ETH; add BSC (56) later if needed
          const response = await fetch(`https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_nft/?key=${COVALENT_KEY}`);
          const data = await response.json();
          setNfts(data.data.items || []);
        } catch (err) {
          setNftError(err.message);
        } finally {
          setNftLoading(false);
        }
      };
      if (address) fetchNFTs();
    }
  }, [viewMode, address]);

  // Filter and sort crypto: by value descending, filter by search
  const filteredBalances = balances
    .filter(item => item.contract_address.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.quote_nzd || 0) - (a.quote_nzd || 0));

  const renderBalanceItem = ({ item }: { item: { contract_address: string; balance: string; quote_nzd: number; chain_id: number } }) => (
    <View style={styles.balanceItem}>
      <Text style={styles.assetName}>{item.contract_address} (Chain: {item.chain_id === 1 ? 'ETH' : 'BSC'})</Text>
      <Text>{item.balance} (NZ${(item.quote_nzd || 0).toFixed(2)})</Text>
    </View>
  );

  const renderNFTItem = ({ item }) => (
    <View style={styles.balanceItem}>
      <Image source={{ uri: item.nft_data?.external_data?.image || '' }} style={styles.nftImage} />
      <Text style={styles.assetName}>{item.contract_name || 'Unnamed NFT'}</Text>
      <Text>{item.nft_data?.external_data?.description?.slice(0, 50) || 'No description'}</Text>
    </View>
  );

  if (cryptoLoading && viewMode === 'crypto') {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View>;
  }

  if (cryptoError && viewMode === 'crypto') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{cryptoError}</Text>
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
        placeholder="Search..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <View style={styles.switchButtons}>
        <Button title="Crypto" onPress={() => setViewMode('crypto')} color={viewMode === 'crypto' ? '#0A84FF' : 'gray'} />
        <Button title="NFTs" onPress={() => setViewMode('nfts')} color={viewMode === 'nfts' ? '#0A84FF' : 'gray'} />
      </View>
      <Text style={styles.subtitle}>Holdings:</Text>
      {viewMode === 'crypto' ? (
        <FlatList
          data={filteredBalances}
          renderItem={renderBalanceItem}
          keyExtractor={(item) => `${item.contract_address}-${item.chain_id}`}
          ListEmptyComponent={<Text style={styles.empty}>No assets match your search or holdings yet.</Text>}
        />
      ) : (
        <>
          {nftLoading ? <View style={styles.center}><ActivityIndicator size="large" color="#0A84FF" /></View> : null}
          {nftError ? <Text style={styles.errorText}>{nftError}</Text> : null}
          <FlatList
            data={nfts}
            renderItem={renderNFTItem}
            keyExtractor={(item) => item.token_id.toString()}
            ListEmptyComponent={<Text style={styles.empty}>You don't hold any NFT's yet.</Text>}
          />
        </>
      )}
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
  switchButtons: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  subtitle: { fontSize: 18, marginBottom: 8 },
  balanceItem: { padding: 12, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  assetName: { fontWeight: 'bold' },
  nftImage: { width: 100, height: 100, borderRadius: 8, marginBottom: 8 },
  empty: { textAlign: 'center', color: '#888' },
  errorText: { color: 'red', marginBottom: 16 },
});

export default Wallet;