import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { useWalletStore } from "../store/useWalletStore";
import { covalentGet } from "../lib/covalent";
import { CHAINS, EvmChain } from "../config/chainRegistry";
import { useChain } from "./useChain";

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
  nativeSymbol: EvmChain['nativeSymbol'];
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
    nativeSymbol: c.nativeSymbol,
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
  const { chain } = useChain();
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
            if (msg.includes("not supported") || msg.includes("501")) return [];
            // Rate-limited or transient → skip this round
            if (msg.includes("rate limit") || msg.includes("429")) return [];
            return [];
          }
        })
      );

      const lists: TxItem[][] = results.map((r) =>
        r.status === "fulfilled" ? (r.value as TxItem[]) : []
      );

      // RPC fallback for current chain
      if (chain && chain.rpcUrls?.[0]) {
        try {
          const { ethers } = await import('ethers');
          const provider = new ethers.providers.StaticJsonRpcProvider(chain.rpcUrls[0], { 
            chainId: chain.chainId, 
            name: chain.name 
          });
          const currentBlock = await provider.getBlockNumber();
          const logs = await provider.getLogs({
            fromBlock: currentBlock - 100,  // Last 100 blocks
            toBlock: 'latest',
            address: owner,
          });
          const rpcTxs = logs.map(log => ({
            hash: log.transactionHash || '',
            timestamp: new Date().toISOString(),
            from: '',
            to: owner,
            valueWei: '0',
            chainId: chain.chainId,
            explorerBase: chain.explorerBase,
            nativeSymbol: chain.nativeSymbol,
            successful: true,
            raw: log,
          }));
          lists.push(rpcTxs);
        } catch (e) {
          console.warn('RPC fallback failed:', e);
        }
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
  }, [address, chain]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { transactions, loading, error, refetch: fetchHistory };
};