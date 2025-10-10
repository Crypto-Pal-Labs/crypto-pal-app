// src/hooks/useAssets.ts
import { useState, useRef } from 'react'; // Added useRef for active flag
import { useWalletStore } from '../store/useWalletStore';
import * as ethers from 'ethers'; // Star import for TS
import { useChain } from '../hooks/useChain';
import { useFocusEffect } from '@react-navigation/native'; // Correct import
import { useCallback } from 'react';
import * as Localization from 'expo-localization'; // For local currency
import Constants from 'expo-constants'; // For bundled env
import { Alert } from 'react-native'; // For errors
import { Buffer } from 'buffer'; // For Basic auth
import AsyncStorage from '@react-native-async-storage/async-storage'; // For caching

interface CovalentItem {
  contract_ticker_symbol?: string;
  balance: string;
  quote?: number;
  logo_url?: string;
  type: string;
  contract_address?: string;
  nft_data?: any[]; // Optional array
  contract_name?: string;
  contract_decimals?: number;
}

export type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;
  quoteLocal: number;
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

const useAssets = () => {
  const address = useWalletStore((state) => state.address);
  const { currentChain, chains } = useChain();
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isActiveRef = useRef(true); // Ref to track mounted/focused

  const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
  const localCurrency = (locale.currencyCode || 'usd').toLowerCase();

  // Bundled key read from Constants (for APK) with trim guard
  const COVALENT_KEY = (Constants.expoConfig?.extra?.EXPO_PUBLIC_COVALENT_KEY || '').trim();
  const ALCHEMY_KEY = (Constants.expoConfig?.extra?.EXPO_PUBLIC_ALCHEMY_KEY || '').trim();

  const fetchWithTimeout = async (url: string, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  };

  const retryFetch = async (fn: () => Promise<any>, retries = 3, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        console.error(`Retry attempt ${attempt} failed:`, (err as Error).message);
        if (attempt === retries) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const fetchPricesWithCache = async (uniqueIds: string[], vsCurrencies: string) => {
    const cacheKey = 'coingecko_prices';
    const cached = await AsyncStorage.getItem(cacheKey);
    const cachedData = cached ? JSON.parse(cached) : { timestamp: 0, prices: {} };
    const now = Date.now();
    if (now - cachedData.timestamp < 3600000) { // Cache 1hr
      return cachedData.prices;
    }

    try {
      const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=${vsCurrencies}`;
      const priceResp = await fetchWithTimeout(priceUrl);
      if (priceResp.ok) {
        const prices = await priceResp.json();
        await AsyncStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, prices }));
        return prices;
      } else {
        console.error(`CoinGecko error: ${priceResp.status}`);
        if (priceResp.status === 429) {
          Alert.alert('Rate Limit', 'CoinGecko limit reached - try later or use fallback.');
        }
        return {}; // Empty on error
      }
    } catch (err) {
      console.error('CoinGecko fetch failed:', err);
      return {};
    }
  };

  const fetchAssetsInternal = async () => {
    if (!isActiveRef.current || !address) return; // Early exit

    setError(null);
    let tempBalances: CovalentItem[] = [];
    let nftItems: NFTItem[] = [];
    let covalentSuccess = false;

    try {
      await retryFetch(async () => {
        if (!COVALENT_KEY) throw new Error('Covalent key missing');
        const chainConfig = chains[currentChain] || { covalentChainId: '11155111' };
        const balancesUrl = `https://api.covalenthq.com/v1/${chainConfig.covalentChainId}/address/${address}/balances_v2/?nft=true`;
        const basic = Buffer.from(`${COVALENT_KEY}:`).toString('base64');
        const resp = await fetch(balancesUrl, {
          headers: {
            Authorization: `Basic ${basic}`,
            Accept: 'application/json',
          },
        });
        if (!resp.ok) {
          const body = await resp.text();
          const msg = `Covalent error: ${resp.status} - ${body.slice(0, 120)}`;
          console.error(msg);
          if (resp.status === 402) Alert.alert('Quota Error', 'Covalent credit limit exceeded - Using Alchemy fallback.');
          throw new Error(msg);
        }
        const data = await resp.json();
        if (data.error) throw new Error(data.error_message);
        const items: CovalentItem[] = data.data.items || [];
        tempBalances = items.filter(item => item.type !== 'nft' && item.balance !== '0');
        nftItems = items.filter(item => item.type === 'nft' && (item.nft_data?.length ?? 0) > 0)
          .flatMap(item => item.nft_data?.map(nft => ({
            token_id: nft.token_id,
            token_balance: nft.token_balance,
            contract_name: item.contract_name || 'Unknown',
            contract_address: item.contract_address || '',
            logo_url: nft.token_url || item.logo_url || 'https://placeholder.com/40x40',
          })) || []);
        covalentSuccess = true;
      });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Unknown error';
      setError(msg);
      console.error('Covalent failed - falling back to Alchemy:', msg);
    }

    setNfts(nftItems);

    // Alchemy fallback if Covalent fails
    if (!covalentSuccess) {
      try {
        if (!ALCHEMY_KEY) throw new Error('Alchemy key missing for fallback');
        const provider = new ethers.providers.AlchemyProvider('sepolia', ALCHEMY_KEY);
        const ethBalance = await provider.getBalance(address);
        const formattedBalance = ethers.utils.formatEther(ethBalance);
        tempBalances = [{
          contract_ticker_symbol: 'ETH',
          balance: ethBalance.toString(),
          quote: 0, // Stub
          logo_url: 'https://placeholder.com/40x40',
          type: 'cryptocurrency',
          contract_decimals: 18,
        }];
        Alert.alert('Fallback Mode', 'Using Alchemy for ETH balance due to Covalent quota.');
      } catch (fallbackErr: unknown) {
        const fallbackMsg = (fallbackErr as Error).message || 'Fallback failed';
        setError(fallbackMsg);
        Alert.alert('Load Error', `Failed to load assets: ${fallbackMsg}. Pull to refresh.`);
      }
    }

    // CoinGecko prices with cache (shared)
    const tickerToIdMap = {
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'BNB': 'binancecoin',
      'MATIC': 'matic-network',
    } as const;
    const uniqueIds = [...new Set(tempBalances.map(item => tickerToIdMap[item.contract_ticker_symbol?.toUpperCase() as keyof typeof tickerToIdMap] || ''))].filter(id => id);
    let prices: any = {};
    if (uniqueIds.length > 0) {
      const vsCurrencies = `usd,${localCurrency}`;
      prices = await fetchPricesWithCache(uniqueIds, vsCurrencies);
    }

    const pricedBalances = tempBalances.map((item) => {
      const ticker = item.contract_ticker_symbol?.toUpperCase() ?? '';
      const id = tickerToIdMap[ticker as keyof typeof tickerToIdMap] || ''; // Type assertion
      const decimals = item.contract_decimals || 18;
      const parsedBalance = Number(ethers.utils.formatUnits(item.balance || '0', decimals)) || 0;
      let quoteLocal = parsedBalance * (prices[id]?.[localCurrency] ?? 0); // Nullish coalescing for prices
      let quoteUsd = parsedBalance * (prices[id]?.usd ?? 0);
      return {
        contract_ticker_symbol: item.contract_ticker_symbol ?? 'Unknown',
        balance: item.balance || '0',
        quoteLocal,
        quoteUsd,
        logo_url: item.logo_url ?? 'https://placeholder.com/40x40'
      };
    });

    setBalances(pricedBalances);
    setLoading(false);
  };

  // Debounce wrapper (unchanged)
  const debounce = (fn: () => void, ms: number) => {
    let timeout: NodeJS.Timeout | null = null;
    return () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(fn, ms);
    };
  };
  const debouncedFetch = debounce(fetchAssetsInternal, 500);

  useFocusEffect(
    useCallback(() => {
      isActiveRef.current = true;
      debouncedFetch(); // Initial

      const interval = setInterval(() => {
        if (!loading && isActiveRef.current) debouncedFetch(); // Poll
      }, 10000);

      return () => {
        isActiveRef.current = false;
        clearInterval(interval);
      };
    }, [loading]) // Add loading to deps if needed
  );

  return { balances, nfts, loading, error, refresh: debouncedFetch };
};

export default useAssets;