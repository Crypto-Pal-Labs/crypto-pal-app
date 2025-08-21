// src/hooks/useHistory.ts
import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { COVALENT_KEY } from '@env';

export const useHistory = () => {
  const address = useWalletStore((state) => state.address);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHistory = async () => {
    if (!address) {
      setError('No wallet address found.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const chains = [
        { id: 11155111, explorer: 'https://sepolia.etherscan.io/tx/' }, // Sepolia ETH
        { id: 97, explorer: 'https://testnet.bscscan.com/tx/' } // BSC testnet
      ];
      let allTx = [];
      for (const chain of chains) {
        const url = `https://api.covalenthq.com/v1/${chain.id}/address/${address}/transactions_v3/?key=${COVALENT_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Covalent fetch failed for chain ${chain.id}`);
        const data = await response.json();
        const chainTx = (data.data?.items || []).map(tx => ({
          ...tx,
          chainId: chain.id,
          explorer: chain.explorer
        }));
        allTx = [...allTx, ...chainTx];
      }
      // Sort by date descending
      allTx.sort((a, b) => new Date(b.block_signed_at).getTime() - new Date(a.block_signed_at).getTime());
      setTransactions(allTx);
    } catch (err) {
      setError(err.message || 'Failed to fetch history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [address]);

  return { transactions, loading, error, refetch: fetchHistory };
};