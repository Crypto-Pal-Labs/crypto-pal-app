// src/hooks/useAssets.ts
import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { COVALENT_KEY } from '@env';

export type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;
  quote: number;
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

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    if (!address) {
      setError('No wallet address found.');
      setLoading(false);
      return;
    }
    try {
      const chains = [11155111]; // Sepolia ETH; add 97 for BSC later
      let allBalances: BalanceItem[] = [];
      let allNfts: NFTItem[] = [];
      for (const chainId of chains) {
        // Balances
        const balanceUrl = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?key=${COVALENT_KEY}`;
        const balanceResp = await fetch(balanceUrl);
        if (!balanceResp.ok) throw new Error('Balances fetch failed');
        const balanceData = await balanceResp.json();
        allBalances = [...allBalances, ...(balanceData.data?.items || [])];

        // NFTs
        const nftUrl = `https://api.covalenthq.com/v1/${chainId}/address/${address}/nft_token_ids/?key=${COVALENT_KEY}`;
        const nftResp = await fetch(nftUrl);
        if (!nftResp.ok) throw new Error('NFT fetch failed');
        const nftData = await nftResp.json();
        allNfts = [...allNfts, ...(nftData.data?.items || [])];
      }
      setBalances(allBalances);
      setNfts(allNfts);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch assets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [address]);

  return { balances, nfts, loading, error, refetch: fetchAssets };
};