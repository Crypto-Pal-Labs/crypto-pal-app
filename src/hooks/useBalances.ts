import { useState, useEffect, useCallback } from 'react';
import { COVALENT_KEY } from '@env';
import { getWalletAddress } from '../utils/wallet';

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

  const chains = [5, 97]; // Sepolia (ETH testnet), BSC testnet

  const fetchRate = useCallback(async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usdt&vs_currencies=nzd');
      const data = await response.json();
      setUsdToNzd(data.usdt.nzd || 1.6);
    } catch {} // Fallback
  }, []);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBalances([]);
    try {
      const address = getWalletAddress();
      if (!address) {
        setError('No wallet found');
        return;
      }

      await fetchRate(); // Update rate if needed

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
      // Filter non-zero
      setBalances(allItems.filter(item => Number(item.balance || '0') > 0));
    } catch (err: any) {
      setError(err.message || 'Failed to load balances');
    } finally {
      setLoading(false);
    }
  }, [usdToNzd]);

  useEffect(() => {
    fetchBalances(); // Initial fetch
  }, [fetchBalances]);

  return { balances, loading, error, fetchBalances };
};