// src/hooks/useTransactions.ts
import { useState, useEffect } from "react";
import { useWalletStore } from "../store/useWalletStore";
import { Alert } from "react-native";
import { covalentGet } from "../lib/covalent";
import { getExtra } from "../config/extra";

export type Transaction = {
  tx_hash: string;
  block_signed_at: string;
  from_address: string;
  to_address: string;
  value: string;  // wei
  gas_spent: string;
  successful: boolean;
};

export function useTransactions() {
  const address = useWalletStore((s) => s.address);
  const [txns, setTxns] = useState<Transaction[]>([]);

  const EXTRA = getExtra();
  const HAS_AUTH =
    typeof EXTRA?.COVALENT_AUTH_B64 === "string" &&
    EXTRA.COVALENT_AUTH_B64.length > 10;

  useEffect(() => {
    if (!address) return;
    if (!HAS_AUTH) {
      Alert.alert("Config Error", "Covalent auth missing in build.");
      return;
    }

    // FIXED: use ?page-size (not &page-size)
    const url = `https://api.covalenthq.com/v1/1/address/${address}/transactions_v2/?page-size=20`;

    let cancelled = false;
    async function fetchTxns() {
      try {
        const json = await covalentGet(url);
        if (!cancelled && Array.isArray(json?.data?.items)) {
          setTxns(json.data.items);
        }
      } catch (err) {
        console.error("Failed to fetch transactions", err);
      }
    }

    fetchTxns();
    const iv = setInterval(fetchTxns, 60_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [address, HAS_AUTH]);

  return txns;
}
