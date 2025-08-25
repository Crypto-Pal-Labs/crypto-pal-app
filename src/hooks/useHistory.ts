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
  from_address: string;
  to_address: string;
  gas_quote: number;
  tx_type: string; // e.g., 'transfer', 'mint', 'swap'
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
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed for chain ${chain.id}`);
        const data = await response.json();
        const chainTx: Transaction[] = (data.data?.items || []).map((tx: any) => ({
          tx_hash: tx.tx_hash,
          block_signed_at: tx.block_signed_at,
          value: tx.value,
          successful: tx.successful,
          chainId: chain.id,
          explorer: chain.explorer,
          from_address: tx.from_address || 'Unknown',
          to_address: tx.to_address || 'Unknown',
          gas_quote: tx.gas_quote || 0,
          tx_type: tx.tx_type || 'Unknown' // Add if Covalent provides; fallback
        }));
        allTx = [...allTx, ...chainTx];
      }
      allTx.sort((a, b) => new Date(b.block_signed_at).getTime() - new Date(a.block_signed_at).getTime());
      setTransactions(allTx);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [address]);

  return { transactions, loading, error, refetch: fetchHistory };
};