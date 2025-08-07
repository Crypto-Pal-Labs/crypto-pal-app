// src/hooks/useTransactions.ts
import { useState, useEffect } from 'react';
import Constants from 'expo-constants';
import { useWalletStore } from '../store/useWalletStore';

export type Transaction = {
  tx_hash: string;
  block_signed_at: string;
  from_address: string;
  to_address: string;
  value: string;       // in WEI as a decimal string
  gas_spent: string;
  successful: boolean;
};

export function useTransactions() {
  const address = useWalletStore(s => s.address);
  const [txns, setTxns] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!address) return;
    const COVALENT_KEY = Constants.expoConfig?.extra?.covalentKey as string;
    const url = `https://api.covalenthq.com/v1/1/address/${address}/transactions_v2/?key=${COVALENT_KEY}&page-size=20`;

    let cancelled = false;
    async function fetchTxns() {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (!cancelled && Array.isArray(json.data?.items)) {
          setTxns(json.data.items);
        }
      } catch (err) {
        console.error('Failed to fetch transactions', err);
      }
    }

    fetchTxns();
    const iv = setInterval(fetchTxns, 60_000); // refresh every minute
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [address]);

  return txns;
}
