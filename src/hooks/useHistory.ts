import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { useWalletStore } from "../store/useWalletStore";
import { covalentGet, CovalentError } from "../lib/covalent";
import { CHAINS, EvmChain } from "../config/chainRegistry";
import { useActiveChain } from '@thirdweb-dev/react-native';  // Correct RN path
import { getProvider } from '../utils/eth';  // Assume from eth.ts

/**
 * Minimal normalized transaction item for UI consumption.
 * We keep the original Covalent item in `raw` for any advanced needs.
 */
export type TxItem = {
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  valueWei: string;
  chainId: number;
  explorerBase: string;
  nativeSymbol: "ETH" | "BNB" | "MATIC";
  successful: boolean;
  raw: any;
};

const toTxItems = (items: any[], c: EvmChain): TxItem[] =>
  (items || []).map((t: any) => ({
    hash: t.tx_hash || t.hash || "",
    timestamp: t.block_signed_at || t.timestamp || new Date().toISOString(),
    from: (t.from_address || "").toLowerCase(),
    to: (t.to_address || "").toLowerCase(),
    valueWei: String(t.value || t.value_wei || "0"),
    chainId: c.chainId,
    explorerBase: c.explorerBase || '',  // Use from custom EvmChain
    nativeSymbol: c.nativeSymbol as "ETH" | "BNB" | "MATIC" || 'ETH',
    successful: t.successful === false ? false : true,
    raw: t,
  }));

const mergeAndSort = (lists: TxItem[][]): TxItem[] => {
  const map = new Map<string, TxItem>();
  for (const list of lists) {
    for (const t of list) {
      if (!t.hash) continue;
      map.set(t.hash.toLowerCase(), t);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
};

export const useHistory = () => {
  const address = useWalletStore((s) => s.address);
  const activeChain = useActiveChain();  // New: Dynamic chain from thirdweb
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!address) {
      setError("No wallet address found.");
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const owner = address.toLowerCase();

      const results = await Promise.allSettled(
        CHAINS.map(async (c) => {
          const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transactions_v3/?no-logs=true&page-size=50`;
          try {
            const json = await covalentGet(url);
            const items = json?.data?.items ?? [];
            return toTxItems(items, c);
          } catch (e: any) {
            const msg = String(e?.message || e);
            // Skip unsupported chains (501) silently
            if (e instanceof CovalentError && e.status === 501) return [];
            if (msg.includes("not supported") || msg.includes("501")) return [];
            // Rate-limited or transient → skip this round
            if (e instanceof CovalentError && e.status === 429) return [];
            return [];
          }
        })
      );

      const lists: TxItem[][] = results.map((r) =>
        r.status === "fulfilled" ? (r.value as TxItem[]) : []
      );

      // New: RPC fallback for receiver txs (poll logs for incoming on active chain)
      if (activeChain) {
        const provider = await getProvider(activeChain.chainId as any);  // Adjust type if needed
        const currentBlock = await provider.getBlockNumber();  // Fixed: Get numeric block, subtract
        const logs = await provider.getLogs({
          fromBlock: currentBlock - 100,  // Last 100 blocks
          toBlock: 'latest',
          address: owner,
        });
        const rpcTxs = logs.map(log => {
          // Parse log to TxItem (simplified - expand for full)
          return {
            hash: log.transactionHash || '',
            timestamp: new Date().toISOString(),
            from: '',  // Parse from data if needed
            to: owner,
            valueWei: '0',  // Parse value
            chainId: activeChain.chainId,
            explorerBase: activeChain.explorers?.[0]?.url || '',  // Fixed: Use explorers from thirdweb Chain
            nativeSymbol: activeChain.nativeCurrency?.symbol as "ETH" | "BNB" | "MATIC" || 'ETH',  // Fixed: Use nativeCurrency.symbol
            successful: true,
            raw: log,
          };
        });
        lists.push(rpcTxs);
      }

      const merged = mergeAndSort(lists);
      setTransactions(merged);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(msg);
      Alert.alert("Load Error", `Failed to load history: ${msg}. Pull to refresh.`);
    } finally {
      setLoading(false);
    }
  }, [address, activeChain]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { transactions, loading, error, refetch: fetchHistory };
};