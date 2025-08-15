import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TextInput, StyleSheet, Button, Image, RefreshControl } from 'react-native';
import { useBalances } from '../hooks/useBalances';
import { resetRoot } from '../navigation/RootNavigation';
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
      const response = await fetch(`https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_nft/?key=${process.env.COVALENT_KEY}`);
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

  // ... (rest of the code, including JSX for views, flatlists, styles—include your truncated part)
};

const styles = StyleSheet.create({
  // ... (styles)
});

export default Wallet;