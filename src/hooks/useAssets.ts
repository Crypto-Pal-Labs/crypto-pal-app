 // src/hooks/useAssets.ts
  import { useState, useEffect } from 'react';
  import { useWalletStore } from '../store/useWalletStore';
  import { COVALENT_KEY } from '@env';
  import { ethers } from 'ethers';

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
      let ethPriceNzd = 0;
      try {
        const priceUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=nzd';
        const priceResp = await fetch(priceUrl);
        if (priceResp.ok) {
          const priceData = await priceResp.json();
          ethPriceNzd = priceData.ethereum.nzd || 0;
          console.log('ETH price in NZD:', ethPriceNzd); // Debug
        }
      } catch (err) {
        console.error('Price fetch error:', err);
      }

      const chains = [11155111]; // Sepolia ETH; add 97 for BSC later
      let allBalances: BalanceItem[] = [];
      let allNfts: NFTItem[] = [];
      for (const chainId of chains) {
        // Balances
        try {
          const balanceUrl = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?key=${COVALENT_KEY}`;
          const balanceResp = await fetch(balanceUrl);
          if (balanceResp.ok) {
            const balanceData = await balanceResp.json();
            let items = balanceData.data?.items || [];
            items = items.map((item: BalanceItem) => {
              if (item.contract_ticker_symbol.toUpperCase() === 'ETH' && (item.quote === 0 || item.quote === null)) {
                item.quote = Number(ethers.formatEther(item.balance)) * ethPriceNzd;
                console.log('Updated ETH quote:', item.quote); // Debug
              }
              return item;
            });
            allBalances = [...allBalances, ...items];
          }
        } catch (err) {
          console.error('Balances error for chain', chainId, ':', err);
        }

        // NFTs
        try {
          const nftUrl = `https://api.covalenthq.com/v1/${chainId}/address/${address}/nft_token_ids/?key=${COVALENT_KEY}`;
          const nftResp = await fetch(nftUrl);
          if (nftResp.ok) {
            const nftData = await nftResp.json();
            allNfts = [...allNfts, ...(nftData.data?.items || [])];
          }
        } catch (err) {
          console.error('NFTs error for chain', chainId, ':', err);
        }
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