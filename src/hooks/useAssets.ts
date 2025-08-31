import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { COVALENT_KEY, ALCHEMY_KEY } from '@env';
import { ethers } from 'ethers';

interface CovalentItem {
  contract_ticker_symbol?: string;
  balance: string;
  quote?: number;
  logo_url?: string;
  type: string;
  contract_address?: string;
  nft_data?: any[];
  contract_name?: string;
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
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const retryFetch = async (fn: () => Promise<any>, retries = 3, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        console.log(`Retry attempt ${attempt} failed:`, err.message); // Log to console, not UI
        if (attempt === retries) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    if (!address) {
      setError('No wallet address found.');
      setLoading(false);
      return;
    }
    const checksumAddress = ethers.getAddress(address); // Checksum for API

    const chains = [11155111]; // Sepolia ETH; add 97 for BSC later
    let allBalances: BalanceItem[] = [];
    let allNfts: NFTItem[] = [];
    for (const chainId of chains) {
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
      } catch (err) {
        console.log('Covalent failed after retries:', err.message); // Log to console
      }

      let tempBalances: CovalentItem[] = [];
      let nftItems: CovalentItem[] = [];
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
            } catch (metaErr) {
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
        // Fallback to Alchemy for ETH balances on Sepolia
        try {
          const provider = new ethers.AlchemyProvider('sepolia', ALCHEMY_KEY);
          const ethBalance = await provider.getBalance(checksumAddress);
          tempBalances.push({
            contract_ticker_symbol: 'ETH',
            balance: ethBalance.toString(),
            quote: 0, // Filled in prices below
            logo_url: 'https://placeholder.com/40x40', // ETH logo URL
            type: 'cryptocurrency',
            contract_address: '0x0',
          });
        } catch (fallbackErr) {
          console.log('Alchemy fallback failed:', fallbackErr.message); // Log to console
          setError('Failed to load balances. Pull to refresh.');
        }
      }

      // Fetch prices from CoinGecko for tempBalances
      const tickerToIdMap: { [key: string]: string } = {
        'ETH': 'ethereum',
        'USDC': 'usd-coin',
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
        } catch (err) {
          console.warn('Price fetch error:', err);
        }
      }
      // Map prices
      const pricedBalances = tempBalances.map((item) => {
        const ticker = item.contract_ticker_symbol?.toUpperCase() ?? '';
        const id = tickerToIdMap[ticker];
        const parsedBalance = Number(ethers.formatEther(item.balance || '0'));
        let quoteNzd = item.quote || 0;
        let quoteUsd = item.quote || 0;
        if (id && prices[id]) {
          quoteNzd = parsedBalance * (prices[id].nzd || 0);
          quoteUsd = parsedBalance * (prices[id].usd || 0);
        } else if (ticker === 'ETH' && prices['ethereum']) {
          quoteNzd = parsedBalance * (prices['ethereum'].nzd || 0);
          quoteUsd = parsedBalance * (prices['ethereum'].usd || 0);
        }
        return {
          contract_ticker_symbol: item.contract_ticker_symbol ?? 'Unknown',
          balance: item.balance,
          quote: quoteNzd,
          quoteUsd: quoteUsd,
          logo_url: item.logo_url ?? 'https://placeholder.com/40x40'
        };
      });
      allBalances = [...allBalances, ...pricedBalances];
    }
    setBalances(allBalances);
    setNfts(allNfts);
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, [address]);

  return { balances, nfts, loading, error, refetch: fetchAssets };
};