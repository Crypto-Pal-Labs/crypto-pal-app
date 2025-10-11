// src/hooks/useHistory.ts
import { useState, useEffect } from "react";
import { useWalletStore } from "../store/useWalletStore";
import { Alert } from "react-native";
import { covalentGet } from "../lib/covalent";
import { getExtra } from "../config/extra";

export const useHistory = () => {
  const setAddress = useWalletStore((s) => s.setAddress);
  const address = useWalletStore((s) => s.address);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const EXTRA = getExtra();
  const HAS_AUTH =
    typeof EXTRA?.COVALENT_AUTH_B64 === "string" &&
    EXTRA.COVALENT_AUTH_B64.length > 10;

  const retryFetch = async (fn: () => Promise<any>, retries = 3, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        console.log(`Retry attempt ${attempt} failed: ${err?.message || err}`);
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);

    if (!address) {
      setError("No wallet address found.");
      setLoading(false);
      return;
    }
    if (!HAS_AUTH) {
      setError("Covalent auth missing in build.");
      setLoading(false);
      Alert.alert("Config Error", "Covalent auth missing in build.");
      return;
    }

    const chains = [11155111]; // Add 97 for BSC if needed
    let allTx: any[] = [];

    for (const chainId of chains) {
      try {
        const data = await retryFetch(async () => {
          const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/transactions_v2/`;
          return await covalentGet(url);
        });
        allTx = [...allTx, ...(data?.data?.items || [])];
      } catch (err: any) {
        console.log("History fetch failed after retries:", err?.message || err);
        setError("Failed to load history. Pull to refresh.");
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
