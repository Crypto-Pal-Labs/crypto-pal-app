import { useState, useEffect, useCallback } from 'react';
import { formatEther } from 'ethers';
import { COVALENT_KEY } from '@env';
import { getWalletAddress } from '../utils/wallet';

interface BalanceItem {
  contract_address: string;
  balance: string; // Formatted readable balance (e.g., '0.05')
  quote: number; // USD
  quote_nzd: number; // NZD
  chain_id: number; // To track origin
  raw_balance: string; // Original wei for reference
}

export const useBalances = () => {
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usdToNzd, setUsdToNzd] = useState(1.6); // Default; fetch real

  const chains = [11155111, 97]; // Sepolia (ETH testnet), BSC testnet

  const fetchRate = useCallback(async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usdt&vs_currencies=nzd');
      const data = await response.json();
      setUsdToNzd(data.usdt.nzd || 1.6);
    } catch {} // Fallback
  }, []);

  const fetchEthPrice = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const data = await response.json();
      return data.ethereum.usd || 0;
    } catch {
      return 0; // Fallback
    }
  };

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBalances([]);
    try {
      const address = await getWalletAddress();
      console.log('Fetched address:', address);
      if (!address) {
        setError('No wallet found');
        return;
      }

      await fetchRate();

      let allItems: BalanceItem[] = [];
      for (const chainId of chains) {
        const url = `https://api.covalenthq.com/v1/${chainId}/address/${address.toLowerCase()}/balances_v2/?key=${COVALENT_KEY}&quote-currency=USD`;
        console.log('Covalent URL for chain', chainId, ':', url);
        const response = await fetch(url);
        if (!response.ok) {
          console.log('Failed response for chain', chainId, response.status);
          continue;
        }
        const data = await response.json();
        console.log('Raw Covalent response for chain', chainId, ':', data);
        let items = Array.isArray(data.data.items) ? data.data.items : [];

        // Fallback price if quote null
        const ethUsdPrice = await fetchEthPrice();

        const itemsWithNzd = items.map(item => {
          let quote = item.quote || 0;
          const rawBalance = item.balance || '0';
          const formattedBalance = formatEther(rawBalance);
          if (quote === 0 && item.contract_ticker_symbol === 'ETH') {
            quote = ethUsdPrice * Number(formattedBalance);
          }
          return {
            ...item,
            balance: formattedBalance, // Format to ETH
            raw_balance: rawBalance, // Keep wei for reference
            quote_nzd: quote * usdToNzd,
            chain_id: chainId,
          };
        });
        allItems = [...allItems, ...itemsWithNzd];
      }
      const filteredItems = allItems.filter(item => Number(item.balance) > 0);
      setBalances(filteredItems);
      console.log('Fetched balances:', filteredItems); // Fixed closing parenthesis
    } catch (err: any) {
      console.error('Balance fetch error:', err);
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