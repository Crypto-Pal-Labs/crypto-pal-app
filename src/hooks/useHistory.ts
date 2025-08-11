import { useState, useEffect } from 'react';
import { COVALENT_KEY } from '@env';
import { useWalletStore } from '../store/useWalletStore';
import { getSavedMnemonic } from '../utils/wallet';
import { ethers } from 'ethers';

interface TxItem {
  tx_hash: string;
  from_address: string;
  to_address: string;
  value: string;
  successful: boolean;
  block_signed_at: string;
}

export const useHistory = () => {
  const { chainId } = useWalletStore();
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      setTransactions([]);
      try {
        const mnemonic = await getSavedMnemonic();
        if (!mnemonic) throw new Error('No wallet');

        const wallet = ethers.Wallet.fromPhrase(mnemonic);
        const address = wallet.address;

        const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/transactions_v2/?key=${COVALENT_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        setTransactions(Array.isArray(data.data.items) ? data.data.items : []);
      } catch (err: any) {
        setError(err.message || 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [chainId]);

  return { transactions, loading, error };
};