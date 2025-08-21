// src/hooks/useHistory.ts
import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { COVALENT_KEY } from '@env';

interface Transaction {
  tx_hash: string;
  block_signed_at: string;
  value: string;
  successful: boolean;
  chainId: number;
  explorer: string;
}

interface Chain {
  id: number;
  explorer: string;
}

export const useHistory = () => {
  const address = useWalletStore((state) => state.address);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    if (!address) {
      setError('No wallet address found.');
      setLoading(false);
      return;
    }
    try {
      const chains: Chain[] = [
        { id: 11155111, explorer: 'https://sepolia.etherscan.io/tx/' },
        { id: 97, explorer: 'https://testnet.bscscan.com/tx/' }
      ];
      let allTx: Transaction[] = [];
      for (const chain of chains) {
        const url = `https://api.covalenthq.com/v1/${chain.id}/address/${address}/transactions_v3/?key=${COVALENT_KEY}`;
        console.log('Fetching Covalent URL:', url); // Debug log
        const response = await fetch(url);
        console.log('Covalent Response Status:', response.status); // Debug log
        if (!response.ok) throw new Error(`Failed for chain ${chain.id}: ${response.statusText}`);
        const data = await response.json();
        console.log('Covalent Data for chain', chain.id, ':', data); // Debug log full data
        const chainTx: Transaction[] = (data.items || []).map((tx: any) => ({
          tx_hash: tx.tx_hash,
          block_signed_at: tx.block_signed_at,
          value: tx.value,
          successful: tx.successful,
          chainId: chain.id,
          explorer: chain.explorer
        }));
        allTx = [...allTx, ...chainTx];
      }
      allTx.sort((a, b) => new Date(b.block_signed_at).getTime() - new Date(a.block_signed_at).getTime());
      setTransactions(allTx);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch history.');
      console.error('Fetch History Error:', err); // Debug log
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [address]);

  return { transactions, loading, error, refetch: fetchHistory };
};