// src/hooks/useTransactions.ts
import { useState, useEffect } from 'react';
import Constants from 'expo-constants';
import { useWalletStore } from '../store/useWalletStore';
import { Buffer } from 'buffer'; // Import for Basic auth
import { Alert } from 'react-native'; // For errors

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

  // Bundled key from env
  const COVALENT_KEY = Constants.expoConfig?.extra?.COVALENT_KEY;

  useEffect(() => {
    if (!address) return;
    if (!COVALENT_KEY) {
      Alert.alert('Config Error', 'Covalent API key missing - check app.config.js/EAS secrets.');
      return;
    }
    const url = `https://api.covalenthq.com/v1/1/address/${address}/transactions_v2/&page-size=20`; // No ?key=

    let cancelled = false;
    async function fetchTxns() {
      try {
        const basic = Buffer.from(`${COVALENT_KEY}:`).toString('base64');
        const res = await fetch(url, {
          headers: { Authorization: `Basic ${basic}` },
        });
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