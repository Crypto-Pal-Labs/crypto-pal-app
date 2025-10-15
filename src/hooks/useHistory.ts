// src/hooks/useHistory.ts
import { useState, useEffect } from "react";
import { useWalletStore } from "../store/useWalletStore";
import { covalent } from "../lib/covalent";
import { getExtra } from "../config/extra";
import { useChain } from "./useChain";

export const useHistory = () => {
  const address = useWalletStore((s) => s.address);
  const { chain } = useChain();
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

    // If Covalent isn't supported for this chain → show empty history (no error)
    if (chain.covalentSupported === false) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    if (!HAS_AUTH) {
      setError("Covalent auth missing in build.");
      setLoading(false);
      return;
    }

    try {
      const data = await retryFetch(() =>
        covalent.transactionsV3(chain.covalentChainId, address, 0)
      );
      setTransactions(data?.data?.items || []);
    } catch (err: any) {
      const msg = String(err?.message || err);
      // If not supported, don't alarm the user
      if (msg.includes("not supported") || msg.includes("501")) {
        setTransactions([]);
        setError(null);
      } else {
        setError("Failed to load history. Pull to refresh.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [chain.covalentChainId, chain.covalentSupported, address]);

  return { transactions, loading, error, refetch: fetchHistory };
};
