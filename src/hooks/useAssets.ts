// src/hooks/useAssets.ts
import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { COVALENT_KEY, ALCHEMY_KEY } from '@env';
import { ethers } from 'ethers';
import { useChain } from '../hooks/useChain';  // New: To get current chain internally
import { getProvider } from '../config/chains';  // New: For fallback provider

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
  quote: number;
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
  const { currentChain, chains } = useChain();  // New: Get current chain from hook
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const retryFetch = async (fn: () => Promise<any>, retries = 3, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        console.log(`Retry attempt ${attempt} failed:`, (err as Error).message); // Log to console, not UI
        if (attempt === retries) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    if (!address || !currentChain) {
      setError('No wallet address or chain found.');
      setLoading(false);
      return;
    }
    const chain = chains[currentChain];
    const chainId = chain.covalentChainId;
    const checksumAddress = ethers.getAddress(address); // Checksum for API

    let covalentData = null;
    try {
      covalentData = await retryFetch(async () => {
        const url = `https://api.covalenthq.com/v1/${chainId}/address/${checksumAddress}/balances_v2/?nft=true&key=${COVALENT_KEY}`;
        const resp = await fetch(url);
        if (resp.status === 503) {
          throw new Error(`Covalent fetch failed with status: 503 - Service Unavailable.`);
        }
        if (!resp.ok) {
          throw new Error(`Covalent fetch failed with status: ${resp.status}`);
        }
        return await resp.json();
      });
      console.log('Covalent fetch success for chainId', chainId, 'items:', covalentData.data.items.length);  // Log to see data
    } catch (err: unknown) {
      console.log('Covalent failed after retries for chainId', chainId, (err as Error).message); // Log to console
    }

    let tempBalances: CovalentItem[] = [];
    let nftItems: CovalentItem[] = [];
    let allNfts: NFTItem[] = [];  // Declared here to accumulate NFTs
    if (covalentData) {
      const items: CovalentItem[] = covalentData.data?.items || [];
      tempBalances = items.filter((item) => item.type !== 'nft');
      nftItems = items.filter((item) => item.type === 'nft');
      // Metadata for NFTs if missing
      for (let nft of nftItems) {
        if (!nft.contract_name) {
          try {
            const metaUrl = `https://api.covalenthq.com/v1/${chainId}/nft/${nft.contract_address}/metadata/?key=${COVALENT_KEY}`;
            const metaResp = await fetch(metaUrl);
            if (metaResp.ok) {
              const metaData = await metaResp.json();
              const meta = metaData.data?.items[0] || {};
              nft.contract_name = meta.contract_name || 'Unknown NFT';
              nft.logo_url = meta.logo_url || 'https://placeholder.com/40x40';
            }
          } catch (metaErr: unknown) {
            nft.contract_name = 'Unknown NFT';
            nft.logo_url = 'https://placeholder.com/40x40';
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
    } else {
      // Fallback to provider for native balance
      try {
        const provider = getProvider(currentChain);
        const nativeBalance = await provider.getBalance(checksumAddress);
        tempBalances.push({
          contract_ticker_symbol: chain.nativeCurrency.symbol,
          balance: nativeBalance.toString(),
          quote: 0, // Filled in prices below
          logo_url: 'https://placeholder.com/40x40', // Native logo URL
          type: 'cryptocurrency',
          contract_address: '0x0',
          contract_decimals: chain.nativeCurrency.decimals,  // Added for formatUnits
        });
        console.log('Fallback success for native balance on chain', currentChain);  // Added logging
      } catch (fallbackErr: unknown) {
        console.log('Provider fallback failed for chain', currentChain, (fallbackErr as Error).message); // Log to console
        setError('Failed to load balances. Pull to refresh.');
      }
    }

    // Force fallback if tempBalances empty (e.g., for Amoy lag)
    if (tempBalances.length === 0) {
      try {
        const provider = getProvider(currentChain);
        const nativeBalance = await provider.getBalance(checksumAddress);
        tempBalances.push({
          contract_ticker_symbol: chain.nativeCurrency.symbol,
          balance: nativeBalance.toString(),
          quote: 0, // Filled in prices below
          logo_url: 'https://placeholder.com/40x40', // Native logo URL
          type: 'cryptocurrency',
          contract_address: '0x0',
          contract_decimals: chain.nativeCurrency.decimals,  // Added for formatUnits
        });
        console.log('Forced fallback success for native balance on chain', currentChain);  // Added logging
      } catch (forceFallbackErr: unknown) {
        console.log('Forced fallback failed for chain', currentChain, (forceFallbackErr as Error).message); // Log to console
        setError('Failed to load balances. Pull to refresh.');
      }
    }

    // Fetch prices from CoinGecko for tempBalances
    const tickerToIdMap: { [key: string]: string } = {
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'BNB': 'binancecoin',  // New: For BSC
      'MATIC': 'matic-network',  // New: For Polygon
      // Add more as needed
    };
    const uniqueIds = [...new Set(tempBalances.map(item => tickerToIdMap[item.contract_ticker_symbol?.toUpperCase() ?? ''] || ''))].filter(id => id);
    let prices: any = {};
    if (uniqueIds.length > 0) {
      try {
        const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=nzd,usd`;
        const priceResp = await fetch(priceUrl);
        if (priceResp.ok) {
          prices = await priceResp.json();
        }
      } catch (err: unknown) {
        console.warn('Price fetch error:', (err as Error).message);
      }
    }
    // Map prices
    const pricedBalances = tempBalances.map((item) => {
      const ticker = item.contract_ticker_symbol?.toUpperCase() ?? '';
      const id = tickerToIdMap[ticker];
      const parsedBalance = Number(ethers.formatUnits(item.balance || '0', item.contract_decimals || chain.nativeCurrency.decimals));
      let quoteNzd = item.quote || 0;
      let quoteUsd = item.quote || 0;
      if (id && prices[id]) {
        quoteNzd = parsedBalance * (prices[id].nzd || 0);
        quoteUsd = parsedBalance * (prices[id].usd || 0);
      } else if (ticker === 'ETH' && prices['ethereum']) {
        quoteNzd = parsedBalance * (prices['ethereum'].nzd || 0);
        quoteUsd = parsedBalance * (prices['ethereum'].usd || 0);
      } else if (ticker === 'BNB' && prices['binancecoin']) {
        quoteNzd = parsedBalance * (prices['binancecoin'].nzd || 0);
        quoteUsd = parsedBalance * (prices['binancecoin'].usd || 0);
      } else if (ticker === 'MATIC' && prices['matic-network']) {
        quoteNzd = parsedBalance * (prices['matic-network'].nzd || 0);
        quoteUsd = parsedBalance * (prices['matic-network'].usd || 0);
      }
      return {
        contract_ticker_symbol: item.contract_ticker_symbol ?? 'Unknown',
        balance: item.balance,
        quote: quoteNzd,
        quoteUsd: quoteUsd,
        logo_url: item.logo_url ?? 'https://placeholder.com/40x40'
      };
    });
    setBalances(pricedBalances);
    setNfts(allNfts);
    setLoading(false);
  }};