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

export const useAssets = () => {
  const address = useWalletStore((state) => state.address);
  const { currentChain, chains } = useChain();
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isActiveRef = useRef(true); // Ref to track mounted/focused

  const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
  const localCurrency = (locale.currencyCode || 'usd').toLowerCase();

  // Bundled key from env (no hardcoded fallback—alert if missing)
  const COVALENT_KEY = Constants.expoConfig?.extra?.COVALENT_KEY;

  // Temp debug log: Print full key value (remove after verifying APK fix)
  console.log('Covalent key in build:', COVALENT_KEY ? `Set (${COVALENT_KEY})` : 'Missing - check app.config.js/EAS!');

  if (!COVALENT_KEY) {
    Alert.alert('Config Error', 'Covalent API key missing in build - check .env/app.config.js/EAS secrets.');
  }

  const retryFetch = async (fn: () => Promise<any>, retries = 3, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        console.warn(`Retry attempt ${attempt} failed:`, (err as Error).message);
        if (attempt === retries) {
          Alert.alert('Fetch Error', 'Could not load data after retries - check network.');
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const fetchWithTimeout = async (url: string, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  };

  const fetchAssetsInternal = async () => {
    if (!isActiveRef.current || !COVALENT_KEY) return; // Early exit if unfocused or no key

    setError(null);
    try {
      await retryFetch(async () => {
        const chainConfig = chains[currentChain] || { covalentChainId: '11155111' }; // Fallback to Sepolia
        const balancesUrl = `https://api.covalenthq.com/v1/${chainConfig.covalentChainId}/address/${address}/balances_v2/?key=${COVALENT_KEY}&nft=true`;
        const resp = await fetchWithTimeout(balancesUrl);
        if (!resp.ok) throw new Error(`Covalent error: ${resp.status}`);
        const data = await resp.json();
        if (data.error) throw new Error(data.error_message);
        const items: CovalentItem[] = data.data.items || [];
        const tempBalances = items.filter(item => item.type !== 'nft' && item.balance !== '0');
        const nftItems = items.filter(item => item.type === 'nft' && (item.nft_data?.length ?? 0) > 0) // Optional chaining with ?? 0
          .flatMap(item => item.nft_data?.map(nft => ({ // Optional chaining
            token_id: nft.token_id,
            token_balance: nft.token_balance,
            contract_name: item.contract_name || 'Unknown',
            contract_address: item.contract_address || '',
            logo_url: nft.token_url || item.logo_url || 'https://placeholder.com/40x40',
          })) || []);

        setNfts(nftItems); // Update NFTs

        // CoinGecko prices
        const tickerToIdMap = {
          'ETH': 'ethereum',
          'USDC': 'usd-coin',
          'BNB': 'binancecoin',
          'MATIC': 'matic-network',
        } as const; // 'as const' for literal types
        const uniqueIds = [...new Set(tempBalances.map(item => tickerToIdMap[item.contract_ticker_symbol?.toUpperCase() as keyof typeof tickerToIdMap] || ''))].filter(id => id);
        let prices: any = {};
        if (uniqueIds.length > 0) {
          const vsCurrencies = `usd,${localCurrency}`;
          const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=${vsCurrencies}`;
          const priceResp = await fetchWithTimeout(priceUrl);
          if (priceResp.ok) {
            prices = await priceResp.json();
          }
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
      });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Unknown error';
      setError(msg);
      Alert.alert('Load Error', `Failed to load assets: ${msg}. Pull to refresh.`);
    } finally {
      setLoading(false);
    }
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
    }, []) // Empty deps for once per focus
  );

  return { balances, nfts, loading, error, refresh: debouncedFetch };
};