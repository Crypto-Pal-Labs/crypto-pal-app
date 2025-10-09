// src/hooks/useTransactions.ts
import { useState, useEffect, useCallback } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { Buffer } from 'buffer'; // For Basic auth
import { useChain } from '../hooks/useChain'; // Added for chains and currentChain
import Constants from 'expo-constants'; // For bundled env
import { Alert } from 'react-native'; // For errors

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

  // Bundled key read from Constants with trim guard
  const COVALENT_KEY = (Constants.expoConfig?.extra?.EXPO_PUBLIC_COVALENT_KEY || '').trim();

  const fetchTxns = async () => {
    if (!address || !COVALENT_KEY) {
      if (!COVALENT_KEY) Alert.alert('Config Error', 'Covalent API key missing - check .env/app.config.js/EAS secrets.');
      setError('No wallet address or key found.');
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
        console.error(`Covalent error: ${resp.status} - ${body.slice(0, 120)}`);
        Alert.alert('Fetch Error', `Failed to load transactions: ${resp.status} - Check logs.`);
        throw new Error(`Covalent error: ${resp.status}`);
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

  // Add refetch as fetchTxns (for consistency)
  const refetch = useCallback(() => fetchTxns(), [address, currentChain]);

  useEffect(() => {
    fetchTxns();
  }, [address, currentChain]); // Add currentChain to deps if it changes

  return { txns, loading, error, refetch };
};

export default useTransactions;