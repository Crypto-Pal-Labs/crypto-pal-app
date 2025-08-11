import { useState, useEffect } from 'react';
import { COVALENT_KEY } from '@env';
import { getSavedMnemonic } from '../utils/wallet';
import { ethers } from 'ethers';

interface BalanceItem {
  contract_address: string;
  balance: string;
  quote: number; // USD
  quote_nzd: number; // NZD
  chain_id: number; // To track origin
}

export const useBalances = () => {
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usdToNzd, setUsdToNzd] = useState(1.6); // Default; fetch real

  const chains = [1, 56]; // ETH, BSC

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usdt&vs_currencies=nzd');
        const data = await response.json();
        setUsdToNzd(data.usdt.nzd || 1.6);
      } catch {} // Fallback
    };
    fetchRate();
  }, []);

  useEffect(() => {
    const fetchAllBalances = async () => {
      setLoading(true);
      setError(null);
      setBalances([]);
      try {
        const mnemonic = await getSavedMnemonic();
        if (!mnemonic) {
          setError('No wallet found');
          return;
        }

        const wallet = ethers.Wallet.fromPhrase(mnemonic);
        const address = wallet.address;

        let allItems: BalanceItem[] = [];
        for (const chainId of chains) {
          const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?key=${COVALENT_KEY}`;
          const response = await fetch(url);
          if (!response.ok) continue; // Skip failed chains
          const data = await response.json();
          const items = Array.isArray(data.data.items) ? data.data.items : [];
          const itemsWithNzd = items.map(item => ({
            ...item,
            quote_nzd: (item.quote || 0) * usdToNzd,
            chain_id: chainId,
          }));
          allItems = [...allItems, ...itemsWithNzd];
        }
        // Dedupe by contract_address if needed; for now, combine
        setBalances(allItems);
      } catch (err: any) {
        setError(err.message || 'Failed to load balances');
      } finally {
        setLoading(false);
      }
    };

    fetchAllBalances();
  }, [usdToNzd]);

  return { balances, loading, error };
};