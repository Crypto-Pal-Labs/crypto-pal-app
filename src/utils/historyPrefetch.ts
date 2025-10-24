// src/utils/historyPrefetch.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ethers from "ethers";
import { EvmChain } from "../config/chainRegistry";
import { covalentGet } from "../lib/covalent";
import { isCovalentSupported } from "../config/capabilities";

export type TxItem = {
  hash: string;
  timestamp: string; // ISO
  from: string;
  to: string;
  valueWei: string;
  successful: boolean;
  chainId: number;
  explorerBase: string;
  nativeSymbol: "ETH" | "BNB" | "MATIC";
  _source?: "covalent" | "rpc" | "explorer";
  isToken?: boolean;
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenContract?: string;
  tokenValueUnits?: string;
  direction?: "IN" | "OUT";
};

const FETCH_TIMEOUT = 3500;
const RX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const RX_CACHE_KEY = (addr: string) => `rxCache_v2:${addr.toLowerCase()}`;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(() => { clearTimeout(t); resolve(fallback); });
  });
}

function toNative(items: any[], c: EvmChain): TxItem[] {
  return (items || []).map((t: any) => ({
    hash: t.tx_hash || t.hash || "",
    timestamp:
      t.block_signed_at || t.timeStamp
        ? new Date((t.block_signed_at ? Date.parse(t.block_signed_at) : Number(t.timeStamp) * 1000)).toISOString()
        : new Date().toISOString(),
    from: (t.from_address || t.from || "").toLowerCase(),
    to: (t.to_address || t.to || "").toLowerCase(),
    valueWei: String(t.value || t.value_wei || t.valueWei || "0"),
    successful: t.txreceipt_status !== undefined ? t.txreceipt_status === "1" : t.successful !== false,
    chainId: c.chainId,
    explorerBase: c.explorerBase,
    nativeSymbol: c.nativeSymbol as any,
    _source: "covalent",
  }));
}

async function covalentSlice(c: EvmChain, owner: string): Promise<TxItem[]> {
  if (!isCovalentSupported("txs", c.covalentChainId) || c.covalentSupported === false) return [];
  const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transactions_v3/?no-logs=true&page-size=50`;
  try {
    const json: any = await withTimeout(covalentGet(url), FETCH_TIMEOUT, { data: { items: [] } });
    return toNative(json?.data?.items || [], c);
  } catch {
    return [];
  }
}

async function rpcSweepLite(c: EvmChain, owner: string, lookbackBlocks = 140): Promise<TxItem[]> {
  try {
    const rpc = c.rpcUrls?.[0];
    if (!rpc) return [];
    const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: c.chainId, name: c.name });
    const latest = await withTimeout(provider.getBlockNumber(), 2000, 0);
    if (!latest) return [];
    const fromBlock = Math.max(0, latest - lookbackBlocks);
    const out: TxItem[] = [];
    for (let bn = latest; bn >= fromBlock && bn >= 0; bn--) {
      const block = await withTimeout(provider.getBlockWithTransactions(bn), 1500, null as any);
      if (!block) continue;
      const ts = (block?.timestamp || Math.floor(Date.now() / 1000)) * 1000;
      for (const tx of block.transactions || []) {
        const from = (tx.from || "").toLowerCase();
        const to = (tx.to || "").toLowerCase();
        if (from === owner || to === owner) {
          out.push({
            hash: tx.hash,
            timestamp: new Date(ts).toISOString(),
            from, to,
            valueWei: (tx.value || ethers.constants.Zero).toString(),
            successful: true,
            chainId: c.chainId,
            explorerBase: c.explorerBase,
            nativeSymbol: c.nativeSymbol as any,
            _source: "rpc",
            direction: from === owner ? "OUT" : "IN",
          });
        }
      }
    }
    return out;
  } catch { return []; }
}

export async function prefetchHistoryLite(owner: string, chains: EvmChain[]) {
  try {
    const addr = owner.toLowerCase();

    // narrow to unique chainIds
    const uniqChains = Array.from(new Map(chains.map(c => [c.chainId, c])).values());

    const tasks: Promise<TxItem[]>[] = uniqChains.map(async (c) => {
      if (c.chainId === 80002) {
        // Amoy: Covalent doesn’t support — do a quick RPC sweep only
        return rpcSweepLite(c, addr, 180);
      }
      // others: quick Covalent slice
      return covalentSlice(c, addr);
    });

    const lists = await Promise.all(tasks);
    const merged = dedupeMerge(lists);

    if (merged.length) {
      await AsyncStorage.setItem(RX_CACHE_KEY(addr), JSON.stringify(merged.slice(0, 200)));
    }
  } catch {
    // swallow — prefetch should never block UI
  }
}

function dedupeMerge(lists: TxItem[][]): TxItem[] {
  const map = new Map<string, TxItem>();
  for (const list of lists) {
    for (const t of list) {
      if (!t.hash) continue;
      const key = `${t.hash}:${t.chainId}:${t.from}:${t.to}:${t.valueWei}`;
      if (!map.has(key)) map.set(key, t);
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
