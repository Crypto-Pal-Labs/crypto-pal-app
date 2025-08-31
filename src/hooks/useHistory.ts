import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { COVALENT_KEY } from '@env';

export const useHistory = () => {
  const address = useWalletStore((state) => state.address);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const retryFetch = async (fn: () => Promise<any>, retries = 3, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        console.log(`Retry attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt === retries) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    if (!address) {
      setError('No wallet address found.');
      setLoading(false);
      return;
    }

    const chains = [11155111]; // Sepolia; add 97 for BSC
    let allTx: any[] = [];
    for (const chainId of chains) {
      try {
        const data = await retryFetch(async () => {
          const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/transactions_v2/?key=${COVALENT_KEY}`;
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(`History fetch failed with status: ${resp.status}`);
          }
          return await resp.json();
        });
        allTx = [...allTx, ...(data.data.items || [])];
      } catch (err) {
        console.log('History fetch failed after retries:', (err as Error).message); // Log to console
        setError('Failed to load history. Pull to refresh.');
      }
    }
    setTransactions(allTx);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [address]);

  return { transactions, loading, error, refetch: fetchHistory };
};