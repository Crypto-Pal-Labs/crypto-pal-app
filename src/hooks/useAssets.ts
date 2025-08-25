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
    const checksumAddress = ethers.getAddress(address); // Checksum for API

    let ethPriceNzd = 0;
    try {
      const priceUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=nzd';
      const priceResp = await fetch(priceUrl);
      if (priceResp.ok) {
        const priceData = await priceResp.json();
        ethPriceNzd = priceData.ethereum.nzd || 0;
        console.log('ETH price in NZD:', ethPriceNzd);
      }
    } catch (err) {
      console.error('Price fetch error:', err);
    }

    const chains = [11155111]; // Sepolia ETH; add 97 for BSC later
    let allBalances: BalanceItem[] = [];
    let allNfts: NFTItem[] = [];
    for (const chainId of chains) {
      try {
        const url = `https://api.covalenthq.com/v1/${chainId}/address/${checksumAddress}/balances_v2/?nft=true&key=${COVALENT_KEY}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          console.log('Balances response including NFTs:', data); // Debug log
          const items = data.data?.items || [];
          // Filter crypto balances
          allBalances = [...allBalances, ...items.filter((item: any) => item.type !== 'nft').map((item: any) => {
            if (item.contract_ticker_symbol.toUpperCase() === 'ETH' && (item.quote === 0 || item.quote === null)) {
              item.quote = Number(ethers.formatEther(item.balance)) * ethPriceNzd;
              console.log('Updated ETH quote:', item.quote);
            }
            return item;
          })];
          // Filter NFTs and add metadata if needed
          let nftItems = items.filter((item: any) => item.type === 'nft');
          for (let nft of nftItems) {
            if (!nft.contract_name) {
              try {
                const metaUrl = `https://api.covalenthq.com/v1/${chainId}/nft/${nft.contract_address}/metadata/?key=${COVALENT_KEY}`;
                const metaResp = await fetch(metaUrl);
                if (metaResp.ok) {
                  const metaData = await metaResp.json();
                  console.log('NFT metadata:', metaData);
                  const meta = metaData.data?.items[0] || {};
                  nft.contract_name = meta.contract_name || 'Unknown NFT';
                  nft.logo_url = meta.logo_url || 'https://placeholder.com/40x40';
                }
              } catch (metaErr) {
                console.error('Metadata error:', metaErr);
                nft.contract_name = 'Unknown NFT';
                nft.logo_url = 'https://placeholder.com/40x40';
              }
            }
            allNfts.push({
              token_id: nft.nft_data[0].token_id, // First token ID (for display)
              token_balance: nft.nft_data.length.toString(),
              contract_name: nft.contract_name,
              contract_address: nft.contract_address,
              logo_url: nft.logo_url
            });
          }
        } else {
          console.error('Balances fetch failed with status:', resp.status);
        }
      } catch (err) {
        console.error('Assets error for chain', chainId, ':', err);
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