import { useState, useEffect, useCallback } from 'react';
import { formatEther } from 'ethers'; // Correct import for v6
import { COVALENT_KEY } from '@env';
import { Alert } from 'react-native'; // For user alerts
import { getWalletAddress } from '../utils/wallet'; // Import for address

interface BalanceItem {
  contract_address: string;
  contract_ticker_symbol: string;
  balance: string; // Formatted readable balance (e.g., '0.05')
  quote: number; // USD
  quote_nzd: number; // NZD
  chain_id: number; // To track origin
  raw_balance: string; // Original wei for reference
}

const useBalancesCore = () => {
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usdToNzd, setUsdToNzd] = useState(1.6); // Default; fetch real

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
      const address = await getWalletAddress();
      if (!address) throw new Error('No wallet address');
      const response = await fetch(`https://api.covalenthq.com/v1/11155111/address/${address}/balances_v2/?key=${COVALENT_KEY}&quote-currency=USD`);
      if (!response.ok) throw new Error('Network request failed');
      const data = await response.json();
      const items = data.data.items.filter(item => Number(item.balance) > 0).map((item: BalanceItem) => ({
        ...item,
        balance: formatEther(item.balance),
        quote_nzd: item.quote * usdToNzd,
      }));
      setBalances(items);
    } catch (e: any) {
      console.error('Balance fetch error:', e);
      setError(e.message || 'Failed to load balances');
      Alert.alert('Balance Fetch Error', 'Network request failed. Check internet.');
    } finally {
      setLoading(false);
    }
  }, [usdToNzd]);

  useEffect(() => {
    fetchRate();
    fetchBalances(); // Initial fetch
  }, [fetchRate, fetchBalances]);

  return { balances, loading, error, refetch: fetchBalances };
};

// Export for old behavior (BACK-COMPAT)
export function useBalances() {
  return useBalancesCore().balances;
}

// Export for new behavior (ENHANCED with refresh/loading/error)
export function useBalancesEx() {
  const { balances, refetch, loading, error } = useBalancesCore();
  return [balances, refetch, { loading, error }];
};