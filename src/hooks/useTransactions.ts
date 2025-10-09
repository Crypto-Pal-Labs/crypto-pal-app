// src/hooks/useTransactions.ts
import { useState, useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { ENV } from '../utils/env'; // Static ENV
import { Buffer } from 'buffer'; // For Basic auth
import { useChain } from '../hooks/useChain'; // Added for chains and currentChain

export type Transaction = {
  tx_hash: string;
  signed_at: string;
  from_address: string;
  to_address: string;
  value: string; // As decimal string
  gas_spent: string;
  successful: boolean;
};

const useTransactions = () => {
  const address = useWalletStore((state) => state.address);
  const { currentChain, chains } = useChain(); // Added for currentChain and chains

  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const COVALENT_KEY = ENV.COVALENT_KEY || '';

  // Temp debug log: Masked key (length + last 4 chars) - remove after fix
  const mask = (v: string) => v ? `${v.length} chars …${v.slice(-4)}` : 'EMPTY';
  console.log('Covalent key (masked in useTransactions):', mask(COVALENT_KEY));

  useEffect(() => {
    const fetchTxns = async () => {
      if (!address) {
        setError('No wallet address found.');
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const chainConfig = chains[currentChain] || { covalentChainId: '11155111' }; // Fallback to Sepolia
        const basic = Buffer.from(`${COVALENT_KEY}:`).toString('base64');
        const url = `https://api.covalenthq.com/v1/${chainConfig.covalentChainId}/address/${address}/transactions_v2/`;
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
        setTxns(mappedTxns);
      } catch (err: unknown) {
        const msg = (err as Error).message || 'Unknown error';
        setError(msg);
        console.error('Failed to fetch transactions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTxns();
  }, [address, currentChain]); // Add currentChain to deps if it changes

  return { txns, loading, error };
};

export default useTransactions;