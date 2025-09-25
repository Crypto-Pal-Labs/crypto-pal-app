// src/hooks/useAssets.ts
import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { COVALENT_KEY, ALCHEMY_KEY } from '@env';
import { ethers } from 'ethers';
import { useChain } from '../hooks/useChain';  // New: To get current chain internally
import { getProvider } from '../config/chains';  // New: For fallback provider
import { useFocusEffect } from '@react-navigation/native'; // Added for poll
import { useCallback } from 'react'; // Added: For useFocusEffect wrapper
import * as Localization from 'expo-localization'; // Added for local currency

interface CovalentItem {
  contract_ticker_symbol?: string;
  balance: string;
  quote?: number;
  logo_url?: string;
  type: string;
  contract_address?: string;
  nft_data?: any[];
  contract_name?: string;
  contract_decimals?: number;  // Added for formatUnits safety
}

export type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;
  quoteLocal: number; // Renamed for local currency
  quoteUsd: number;
  logo_url: string;
};

export type NFTItem = {
  token_id: string;
  token_balance: string;
  contract_name: string;
  contract_address: string;
  logo_url: string;
};

export const useAssets = () => {
  const address = useWalletStore((state) => state.address);
  const { currentChain, chains } = useChain();  // Get current chain from hook
  const [balances, setBalances] = useState<BalanceItem[]>([]);  // Default empty array
  const [nfts, setNfts] = useState<NFTItem[]>([]);  // Default empty array
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
  const localCurrency = (locale.currencyCode || 'usd').toLowerCase(); // Null-safe with default 'usd'

  const retryFetch = async (fn: () => Promise<any>, retries = 3, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Attempt ${attempt} for fetch...`);  // Debug
        return await fn();
      } catch (err: unknown) {
        console.log(`Retry attempt ${attempt} failed:`, (err as Error).message);
        if (attempt === retries) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const fetchWithTimeout = async (url: string, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return resp;
    } catch (err: unknown) {
      clearTimeout(id);
      throw err;
    }
  };

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    setBalances([]);  // Reset to empty
    setNfts([]);  // Reset to empty

    if (!address || !currentChain) {
      console.log('No address or chain:', { address, currentChain });  // Debug log
      setError('No wallet address or chain found.');
      setLoading(false);
      return;
    }

    const chain = chains[currentChain] || {};  // Safe access
    const chainId = chain.covalentChainId;
    const checksumAddress = ethers.utils.getAddress(address); // Fixed: utils.getAddress

    let covalentData: any = null;  // Fix: Add 'any' type to covalentData
    try {
      covalentData = await retryFetch(async () => {
        const url = `https://api.covalenthq.com/v1/${chainId}/address/${checksumAddress}/balances_v2/?nft=true&key=${COVALENT_KEY}`;
        const resp = await fetchWithTimeout(url);
        if (resp.status === 503) {
          throw new Error(`Covalent fetch failed with status: 503 - Service Unavailable.`);
        }
        if (!resp.ok) {
          throw new Error(`Covalent fetch failed with status: ${resp.status}`);
        }
        return await resp.json();
      });
      console.log('Covalent success for chainId', chainId, 'items:', covalentData?.data?.items?.length || 0);
    } catch (err: unknown) {
      console.log('Covalent failed:', (err as Error).message);
      setError('Covalent fetch failed—using fallback.');
    }

    let tempBalances: CovalentItem[] = [];
    let nftItems: CovalentItem[] = [];
    let allNfts: NFTItem[] = [];
    if (covalentData && covalentData.data && covalentData.data.items) {
      const items: CovalentItem[] = covalentData.data.items || [];
      tempBalances = items.filter((item) => item.type !== 'nft');
      nftItems = items.filter((item) => item.type === 'nft');
      // Metadata for NFTs
      for (let nft of nftItems) {
        if (!nft.contract_name) {
          try {
            const metaUrl = `https://api.covalenthq.com/v1/${chainId}/nft/${nft.contract_address}/metadata/?key=${COVALENT_KEY}`;
            const metaResp = await fetchWithTimeout(metaUrl);
            if (metaResp.ok) {
              const metaData = await metaResp.json();
              const meta = metaData.data?.items[0] || {};
              nft.contract_name = meta.contract_name || 'Unknown NFT';
              nft.logo_url = meta.logo_url || 'https://placeholder.com/40x40';
            }
          } catch (metaErr: unknown) {
            nft.contract_name = 'Unknown NFT';
            nft.logo_url = 'https://placeholder.com/40x40';
            console.log('NFT meta failed:', (metaErr as Error).message);
          }
        }
        allNfts.push({
          token_id: nft.nft_data?.[0]?.token_id ?? 'Unknown',
          token_balance: nft.nft_data?.length.toString() ?? '0',
          contract_name: nft.contract_name ?? 'Unknown NFT',
          contract_address: nft.contract_address ?? '',
          logo_url: nft.logo_url ?? 'https://placeholder.com/40x40'
        });
      }
    }

    // Always force fallback if tempBalances empty or Covalent failed
    if (tempBalances.length === 0 || !covalentData) {
      try {
        const provider = getProvider(currentChain);
        const nativeBalance = await provider.getBalance(checksumAddress);
        tempBalances.push({
          contract_ticker_symbol: chain.nativeCurrency?.symbol || 'Unknown',
          balance: nativeBalance.toString(),
          quote: 0,
          logo_url: 'https://placeholder.com/40x40',
          type: 'cryptocurrency',
          contract_address: '0x0',
          contract_decimals: chain.nativeCurrency?.decimals || 18,
        });
        console.log('Forced fallback success for', currentChain, 'balance:', nativeBalance.toString());
      } catch (forceFallbackErr: unknown) {
        console.log('Forced fallback failed:', (forceFallbackErr as Error).message);
        setError('Failed to load balances. Pull to refresh.');
      }
    }

    // Fetch prices with local currency
    const tickerToIdMap: { [key: string]: string } = {
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'BNB': 'binancecoin',
      'MATIC': 'matic-network',
      // Add more
    };
    const uniqueIds = [...new Set(tempBalances.map(item => tickerToIdMap[item.contract_ticker_symbol?.toUpperCase() ?? ''] || ''))].filter(id => id);
    let prices: any = {};
    if (uniqueIds.length > 0) {
      try {
        const vsCurrencies = `usd,${localCurrency}`;
        const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=${vsCurrencies}`;
        const priceResp = await fetchWithTimeout(priceUrl);
        if (priceResp.ok) {
          prices = await priceResp.json();
        }
      } catch (err: unknown) {
        console.warn('Price fetch error:', (err as Error).message);
      }
    }

    // Map prices with defaults
    const pricedBalances = tempBalances.map((item) => {
      const ticker = item.contract_ticker_symbol?.toUpperCase() ?? '';
      const id = tickerToIdMap[ticker] || '';
      const decimals = item.contract_decimals || chain.nativeCurrency?.decimals || 18;
      const parsedBalance = Number(ethers.utils.formatUnits(item.balance || '0', decimals)) || 0; // Fixed: utils.formatUnits
      let quoteLocal = parsedBalance * (prices[id]?.[localCurrency] || 0);
      let quoteUsd = parsedBalance * (prices[id]?.usd || 0);
      return {
        contract_ticker_symbol: item.contract_ticker_symbol ?? 'Unknown',
        balance: item.balance || '0',
        quoteLocal: quoteLocal,
        quoteUsd: quoteUsd,
        logo_url: item.logo_url ?? 'https://placeholder.com/40x40'
      };
    });

    setBalances(pricedBalances);
    setNfts(allNfts);
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, [address, currentChain]);  // Re-fetch on chain/address change

  return { balances, nfts, loading, error, refresh: fetchAssets };
};