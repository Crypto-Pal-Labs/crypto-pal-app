// src/hooks/useHistory.ts
import { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { useWalletStore } from '../store/useWalletStore';
import { ENV } from '../utils/env'; // Static ENV
import { Buffer } from 'buffer'; // For Basic auth
import { useChain } from '../hooks/useChain'; // For chains and currentChain

export type Transaction = {
  tx_hash: string;
  signed_at: string;
  from_address: string;
  to_address: string;
  value: string; // As decimal string
  gas_spent: string;
  successful: boolean;
};

const useHistory = () => {
  const address = useWalletStore((state) => state.address);
  const { currentChain, chains } = useChain(); // For currentChain and chains

  const [transactions, setTransactions] = useState<Transaction[]>([]); // Renamed from txns to transactions
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const COVALENT_KEY = ENV.COVALENT_KEY || '';

  // Temp debug log: Masked key (length + last 4 chars) - remove after fix
  const mask = (v: string) => v ? `${v.length} chars …${v.slice(-4)}` : 'EMPTY';
  console.log('Covalent key (masked in useHistory):', mask(COVALENT_KEY));

  const fetchHistory = async () => {
    if (!address) {
      setError('No wallet address found.');
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const chainConfig = chains[currentChain] || { covalentChainId: '11155111' }; // Fallback to Sepolia
      const basic = Buffer.from(`${COVALENT_KEY}:`).toString('base64');
      const url = `https://api.covalenthq.com/v1/${chainConfig.covalentChainId}/address/${address}/transactions_v2/?page-size=20`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: 'application/json',
        },
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Covalent error: ${resp.status} ${body.slice(0, 120)}`);
      }
      const data = await resp.json();
      const items: any[] = data.data.items || []; // Type as any[]
      const mappedTxns = items.map((item: any) => ({ // Type 'item' as 'any'
        tx_hash: item.tx_hash,
        signed_at: item.block_signed_at,
        from_address: item.from_address,
        to_address: item.to_address,
        value: item.value, // As string, format later
        gas_spent: item.gas_spent,
        successful: item.successful,
      }));
      setTransactions(mappedTxns); // Renamed from setTxns
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Unknown error';
      setError(msg);
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Add refetch as fetchHistory (for pull refresh)
  const refetch = useCallback(() => fetchHistory(), [address, currentChain]); // Added useCallback for refetch

  useEffect(() => {
    fetchHistory();
  }, [address, currentChain]); // Add currentChain to deps if it changes

  return { transactions, loading, error, refetch }; // Added refetch
};

export default useHistory;