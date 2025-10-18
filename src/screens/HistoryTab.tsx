import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Linking,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Localization from "expo-localization";
import * as ethers from "ethers";

import { useWalletStore } from "../store/useWalletStore";
import { CHAINS, EvmChain } from "../config/chainRegistry";
import { covalentGet } from "../lib/covalent";

/* ───────────────────────── Types ───────────────────────── */
type PriceSym = "ETH" | "BNB" | "MATIC";

type BaseItem = {
  id: string;
  hash: string;
  timestamp: string; // ISO
  from: string;
  to: string;
  chainId: number;
  explorerBase: string;
  nativeSymbol: PriceSym;
  successful: boolean;
  source?: "covalent" | "rpc" | "local";
};

type NativeItem = BaseItem & {
  kind: "native";
  valueWei: string; // wei string
};

type TokenItem = BaseItem & {
  kind: "erc20";
  contract: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenValue: string; // integer string (raw)
  logIndex: number;
};

type HistoryItem = NativeItem | TokenItem;

type TokenMeta = { symbol: string; decimals: number };

/* ───────────────────────── Consts / Keys ───────────────────────── */
const HARD_UI_TIMEOUT_MS = 10000;
// Softer timeout so valid-but-slow Covalent responses aren't dropped as "empty"
const COVALENT_SOFT_MS = 6500;

const POLL_MS = 10000;

// Progressive cursors (fast + safe)
const STEP_NATIVE = 256;            // scan 256 blocks per poll for native
const STEP_ERC20  = 4096;           // scan up to 4096 blocks per poll for ERC-20 logs

// One-time bootstrap coverage (recent history) — runs once per chain
const BOOTSTRAP_NATIVE = 4096;
const BOOTSTRAP_ERC20  = 16384;

// FINAL sticky key (do not change again)
const STICKY_KEY = (addr: string) => `historySticky_vAAB:${addr.toLowerCase()}`;

// Older sticky buckets we used previously — we'll read/merge them once
const OLD_STICKY_KEYS = (addr: string) => [
  `historySticky_v3:${addr.toLowerCase()}`,
  `historySticky_v7:${addr.toLowerCase()}`,
  `historySticky_v8:${addr.toLowerCase()}`,
  `historySticky_v9:${addr.toLowerCase()}`,
];

const CUR_NATIVE = (addr: string, cid: number) =>
  `cursor:native:${addr.toLowerCase()}:${cid}`;
const CUR_ERC20 = (addr: string, cid: number) =>
  `cursor:erc20:${addr.toLowerCase()}:${cid}`;
const BOOT_DONE = (addr: string, cid: number) =>
  `boot:${addr.toLowerCase()}:${cid}`;

const LOCAL_TXS_PER_CHAIN = (addr: string, cid: number) =>
  `localTxs:${addr.toLowerCase()}:${cid}`;
const LEGACY_LOCAL = "localTxs";

const META_TOKEN = (cid: number, contract: string) =>
  `meta:${cid}:${contract.toLowerCase()}`;

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC20_ABI_MIN = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

// price ids used for USD/local calc
const PRICE_IDS: Record<PriceSym, string> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  MATIC: "matic-network",
};

const USE_COVALENT = true; // set false to test RPC-only

/* ───────────────────────── Helpers ───────────────────────── */
const mask = (a: string) =>
  a?.startsWith("0x") && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

const fmt = (n: number, dp = 6) =>
  Number.isFinite(n)
    ? Number(n).toFixed(dp).replace(/0+$/, "").replace(/\.$/, "")
    : "—";

const stableKeyNative = (cid: number, hash: string) =>
  `${cid}:native:${hash.toLowerCase()}`;
const stableKeyToken = (
  cid: number,
  contract: string,
  hash: string,
  logIndex: number
) => `${cid}:${contract.toLowerCase()}:${hash.toLowerCase()}:${logIndex}`;

const rankSource = (s?: string) => (s === "covalent" ? 3 : s === "rpc" ? 2 : 1);

function mergeStable(groups: HistoryItem[][]): HistoryItem[] {
  const map = new Map<string, HistoryItem>();
  for (const list of groups) {
    for (const it of list) {
      const key =
        it.kind === "native"
          ? stableKeyNative(it.chainId, it.hash)
          : stableKeyToken(
              it.chainId,
              (it as TokenItem).contract,
              it.hash,
              (it as TokenItem).logIndex
            );
      const prev = map.get(key);
      if (!prev || rankSource(it.source) > rankSource(prev.source)) {
        map.set(key, it);
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(fallback);
    });
  });
}

// One-time migration: read older sticky buckets, merge/dedupe/sort, write to final key.
// Safe to call on every boot; it short-circuits if already migrated.
async function migrateStickyOnce(addr: string) {
  try {
    const finalKey = STICKY_KEY(addr);
    const existing = await AsyncStorage.getItem(finalKey);
    if (existing) return; // already migrated

    const raws = await Promise.all(OLD_STICKY_KEYS(addr).map(k => AsyncStorage.getItem(k)));
    const groups: HistoryItem[][] = [];
    for (const raw of raws) {
      if (!raw) continue;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) groups.push(arr as HistoryItem[]);
      } catch {
        // ignore parse errors from older malformed values
      }
    }

    if (groups.length) {
      const merged = mergeStable(groups).slice(0, 1000);
      await AsyncStorage.setItem(finalKey, JSON.stringify(merged));
      // Best-effort cleanup of old buckets
      await Promise.all(
        OLD_STICKY_KEYS(addr).map(k =>
          k !== finalKey ? AsyncStorage.removeItem(k) : Promise.resolve()
        )
      );
    }
  } catch {
    // non-fatal; migration is best-effort
  }
}

async function loadSticky(addr: string): Promise<HistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STICKY_KEY(addr));
    if (!raw) return [];
    const arr: HistoryItem[] = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveSticky(addr: string, items: HistoryItem[]) {
  if (!items?.length) return;
  try {
    const existing = await loadSticky(addr);
    const merged = mergeStable([existing, items]).slice(0, 1000);
    await AsyncStorage.setItem(STICKY_KEY(addr), JSON.stringify(merged));
  } catch {}
}

/* ───────────────────────── Covalent (stable) ───────────────────────── */
async function fetchCovalentNative(
  c: EvmChain,
  owner: string,
  soft = true
): Promise<NativeItem[]> {
  if (!USE_COVALENT || !c.covalentChainId) return [];
  const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transactions_v3/?no-logs=true&page-size=100`;
  const json = await (soft
    ? withTimeout(covalentGet(url), COVALENT_SOFT_MS, { data: { items: [] } } as any)
    : covalentGet(url));
  const items: any[] = (json as any)?.data?.items || [];
  return items.map((t) => {
    const hash = t.tx_hash || "";
    const valueWei = String(t.value ?? t.value_wei ?? "0");
    const from = (t.from_address || "").toLowerCase();
    const to = (t.to_address || "").toLowerCase();
    const ts = t.block_signed_at || new Date().toISOString();
    const ok = t.successful !== false;
    return {
      id: stableKeyNative(c.chainId, hash),
      kind: "native" as const,
      hash,
      valueWei,
      from,
      to,
      timestamp: ts,
      successful: ok,
      chainId: c.chainId,
      explorerBase: c.explorerBase,
      nativeSymbol: c.nativeSymbol as PriceSym,
      source: "covalent",
    };
  });
}

async function fetchCovalentTokenTransfers(
  c: EvmChain,
  owner: string,
  soft = true
): Promise<TokenItem[]> {
  if (!USE_COVALENT || !c.covalentChainId) return [];
  const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transfers_v2/?no-spam=true&page-size=200`;
  const json = await (soft
    ? withTimeout(covalentGet(url), COVALENT_SOFT_MS, { data: { items: [] } } as any)
    : covalentGet(url));
  const items: any[] = (json as any)?.data?.items || [];
  const out: TokenItem[] = [];
  for (const row of items) {
    const contract = String(row.contract_address || "").toLowerCase();
    const decimals = Number(row.contract_decimals ?? 18) || 18;
    const symbol = String(row.contract_ticker_symbol || "TOKEN");
    const transfers: any[] = row.transfers ||[];
    for (const t of transfers) {
      const hash = String(t.tx_hash || "");
      const from = String(t.from_address || "").toLowerCase();
      const to = String(t.to_address || "").toLowerCase();
      const ts = t.block_signed_at || new Date().toISOString();
      const logIndex = Number(t.log_index ?? t.logoffset ?? 0);
      const tokenValue = String(t.delta ?? t.value ?? "0");
      out.push({
        id: stableKeyToken(c.chainId, contract, hash, logIndex),
        kind: "erc20" as const,
        hash,
        logIndex,
        contract,
        tokenValue,
        from,
        to,
        timestamp: ts,
        successful: t.successful !== false,
        tokenDecimals: decimals,
        tokenSymbol: symbol,
        chainId: c.chainId,
        explorerBase: c.explorerBase,
        nativeSymbol: c.nativeSymbol as PriceSym,
        source: "covalent",
      });
    }
  }
  return out;
}

/* ─────────────────────── ERC-20 inbound via RPC (progressive) ─────────────────────── */
async function fetchTokenMeta(
  provider: ethers.providers.Provider,
  cid: number,
  contract: string
): Promise<TokenMeta> {
  const key = META_TOKEN(cid, contract);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw) as TokenMeta;
  } catch {}
  try {
    const erc20 = new ethers.Contract(contract, ERC20_ABI_MIN, provider);
    const [symbol, decimals] = await Promise.all([erc20.symbol(), erc20.decimals()]);
    const meta: TokenMeta = {
      symbol: String(symbol || "TOKEN"),
      decimals: Number(decimals || 18),
    };
    try {
      await AsyncStorage.setItem(key, JSON.stringify(meta));
    } catch {}
    return meta;
  } catch {
    const meta: TokenMeta = { symbol: "TOKEN", decimals: 18 };
    try {
      await AsyncStorage.setItem(key, JSON.stringify(meta));
    } catch {}
    return meta;
  }
}

async function rpcErc20Progressive(
  c: EvmChain,
  owner: string
): Promise<TokenItem[]> {
  try {
    const rpc = c.rpcUrls?.[0];
    if (!rpc) return [];
    const provider = new ethers.providers.StaticJsonRpcProvider(rpc, {
      chainId: c.chainId,
      name: c.name,
    });
    const latest = await withTimeout(provider.getBlockNumber(), 2000, 0);
    if (!latest) return [];

    const curKey = CUR_ERC20(owner, c.chainId);
    const bootKey = BOOT_DONE(owner, c.chainId);

    const booted = (await AsyncStorage.getItem(bootKey)) === "1";
    const step = booted ? STEP_ERC20 : BOOTSTRAP_ERC20;

    let fromBlock = Number((await AsyncStorage.getItem(curKey)) || "0");
    if (!fromBlock || fromBlock <= 0) fromBlock = Math.max(0, latest - step);
    const toBlock = Math.min(latest, fromBlock + step);

    if (toBlock < fromBlock) return [];
    const toTopic = ethers.utils.hexZeroPad(owner as `0x${string}`, 32);
    const logs = await withTimeout(
      provider.getLogs({
        fromBlock,
        toBlock,
        topics: [ERC20_TRANSFER_TOPIC, null, toTopic],
      }),
      2500,
      []
    );

    const out: TokenItem[] = [];
    const metaCache = new Map<string, TokenMeta>();

    for (const lg of logs) {
      const contract = lg.address.toLowerCase();
      const hash = lg.transactionHash;
      const logIndex = lg.logIndex;
      const from = ("0x" + lg.topics[1].slice(26)).toLowerCase();
      const to = ("0x" + lg.topics[2].slice(26)).toLowerCase();
      const tokenValue = ethers.BigNumber.from(lg.data || "0x0").toString();

      let meta = metaCache.get(contract);
      if (!meta) {
        meta = await fetchTokenMeta(provider, c.chainId, contract);
        metaCache.set(contract, meta);
      }

      out.push({
        id: stableKeyToken(c.chainId, contract, hash, logIndex),
        kind: "erc20",
        hash,
        logIndex,
        contract,
        tokenValue,
        tokenSymbol: meta.symbol,
        tokenDecimals: meta.decimals,
        from,
        to,
        timestamp: new Date().toISOString(),
        successful: true,
        chainId: c.chainId,
        explorerBase: c.explorerBase,
        nativeSymbol: c.nativeSymbol as PriceSym,
        source: "rpc",
      });
    }

    // advance cursor
    try {
      await AsyncStorage.setItem(curKey, String(toBlock + 1));
      if (!booted) await AsyncStorage.setItem(bootKey, "1");
    } catch {}

    return out;
  } catch {
    return [];
  }
}

/* ─────────────────────── Native inbound via RPC (progressive + light) ─────────────────────── */
async function rpcNativeProgressive(
  c: EvmChain,
  owner: string
): Promise<NativeItem[]> {
  try {
    const rpc = c.rpcUrls?.[0];
    if (!rpc) return [];
    const provider = new ethers.providers.StaticJsonRpcProvider(rpc, {
      chainId: c.chainId,
      name: c.name,
    });
    const latest = await withTimeout(provider.getBlockNumber(), 2000, 0);
    if (!latest) return [];

    const curKey = CUR_NATIVE(owner, c.chainId);
    const bootKey = BOOT_DONE(owner, c.chainId);

    const booted = (await AsyncStorage.getItem(bootKey)) === "1";
    const step = booted ? STEP_NATIVE : BOOTSTRAP_NATIVE;

    let fromBlock = Number((await AsyncStorage.getItem(curKey)) || "0");
    if (!fromBlock || fromBlock <= 0) fromBlock = Math.max(0, latest - step);
    const toBlock = Math.min(latest, fromBlock + step);

    if (toBlock < fromBlock) return [];

    const out: NativeItem[] = [];

    // chunk small to keep UI responsive
    const CHUNK = 16;
    for (let start = fromBlock; start <= toBlock; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, toBlock);
      const blocks = await Promise.all(
        Array.from({ length: end - start + 1 }, (_, i) =>
          withTimeout(
            provider.getBlockWithTransactions(start + i),
            1200,
            null as any
          )
        )
      );
      for (const blk of blocks) {
        if (!blk) continue;
        const tsMs = (blk.timestamp || Math.floor(Date.now() / 1000)) * 1000;
        for (const tx of blk.transactions || []) {
          const toAddr = tx.to ? tx.to.toLowerCase() : "";
          if (toAddr !== owner) continue;
          out.push({
            id: stableKeyNative(c.chainId, tx.hash),
            kind: "native",
            hash: tx.hash,
            valueWei: (tx.value || ethers.constants.Zero).toString(),
            from: (tx.from || "").toLowerCase(),
            to: toAddr,
            timestamp: new Date(tsMs).toISOString(),
            successful: true,
            chainId: c.chainId,
            explorerBase: c.explorerBase,
            nativeSymbol: c.nativeSymbol as PriceSym,
            source: "rpc",
          });
        }
      }
      // yield to UI
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }

    // advance cursor
    try {
      await AsyncStorage.setItem(curKey, String(toBlock + 1));
      if (!booted) await AsyncStorage.setItem(bootKey, "1");
    } catch {}

    return out;
  } catch {
    return [];
  }
}

/* ───────────────────────── Local optimistic ───────────────────────── */
async function loadLocalOptimistic(
  addr: string,
  chains: EvmChain[]
): Promise<HistoryItem[]> {
  const out: HistoryItem[] = [];

  for (const c of chains) {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_TXS_PER_CHAIN(addr, c.chainId));
      if (!raw) continue;
      const arr: any[] = JSON.parse(raw);
      for (const l of arr || []) {
        if (l.isToken) {
          out.push({
            id: stableKeyToken(
              c.chainId,
              String(l.tokenContract || "").toLowerCase(),
              String(l.hash || l.tx_hash || ""),
              Number(l.logIndex || 0)
            ),
            kind: "erc20",
            hash: String(l.hash || l.tx_hash || ""),
            logIndex: Number(l.logIndex || 0),
            contract: String(l.tokenContract || "").toLowerCase(),
            tokenValue: String(l.tokenValue || "0"),
            tokenSymbol: String(l.tokenSymbol || "TOKEN"),
            tokenDecimals: Number(l.tokenDecimals || 18),
            from: String(l.from || "").toLowerCase(),
            to: String(l.to || "").toLowerCase(),
            timestamp:
              String(l.block_signed_at || l.timestamp || new Date().toISOString()),
            successful: true,
            chainId: Number(l.chainId || c.chainId),
            explorerBase: c.explorerBase,
            nativeSymbol: c.nativeSymbol as PriceSym,
            source: "local",
          });
        } else {
          out.push({
            id: stableKeyNative(c.chainId, String(l.hash || l.tx_hash || "")),
            kind: "native",
            hash: String(l.hash || l.tx_hash || ""),
            valueWei: String(l.valueWei || l.value || "0"),
            from: String(l.from || "").toLowerCase(),
            to: String(l.to || "").toLowerCase(),
            timestamp:
              String(l.block_signed_at || l.timestamp || new Date().toISOString()),
            successful: true,
            chainId: Number(l.chainId || c.chainId),
            explorerBase: c.explorerBase,
            nativeSymbol: c.nativeSymbol as PriceSym,
            source: "local",
          });
        }
      }
    } catch {}
  }

  // legacy global cache
  try {
    const raw = await AsyncStorage.getItem(LEGACY_LOCAL);
    if (raw) {
      const arr: any[] = JSON.parse(raw);
      for (const l of arr || []) {
        const c = chains.find((x) => x.chainId === Number(l.chainId));
        if (!c) continue;
        out.push({
          id: stableKeyNative(c.chainId, String(l.hash || l.tx_hash || "")),
          kind: "native",
          hash: String(l.hash || l.tx_hash || ""),
          valueWei: String(l.valueWei || l.value || "0"),
          from: String(l.from || "").toLowerCase(),
          to: String(l.to || "").toLowerCase(),
          timestamp:
            String(l.block_signed_at || l.timestamp || new Date().toISOString()),
          successful: true,
          chainId: Number(l.chainId || c.chainId),
          explorerBase: c.explorerBase,
          nativeSymbol: c.nativeSymbol as PriceSym,
          source: "local",
        });
      }
    }
  } catch {}

  return out;
}

/* ───────────────────────── Component ───────────────────────── */
export default function HistoryTab() {
  const raw = useWalletStore((s) => s.address);
  const address = (raw || "").toLowerCase();

  // Accept CHAINS as object or array
  const chains: EvmChain[] = useMemo(() => {
    const xs = CHAINS as any;
    return Array.isArray(xs)
      ? (xs as EvmChain[])
      : Object.values(xs as Record<string, EvmChain>);
  }, []);

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [firstLoading, setFirstLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [displayUnit, setDisplayUnit] = useState<"TOKEN" | "USD" | string>(
    "TOKEN"
  );
  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();

  const [priceMap, setPriceMap] = useState<
    Record<PriceSym, { usd: number; local: number }>
  >({
    ETH: { usd: 0, local: 0 },
    BNB: { usd: 0, local: 0 },
    MATIC: { usd: 0, local: 0 },
  });

  // Spinner guard
  useEffect(() => {
    const guard = setTimeout(() => {
      setFirstLoading(false);
      setRefreshing(false);
    }, HARD_UI_TIMEOUT_MS);
    return () => clearTimeout(guard);
  }, []);

  // Prime UI (sticky + locals) — shows older items immediately (e.g., those up to Oct 4)
  useEffect(() => {
    (async () => {
      if (!address) {
        setItems([]);
        setFirstLoading(false);
        return;
      }
      // NEW: unify older sticky buckets into final key before we read
      await migrateStickyOnce(address);

      const sticky = await loadSticky(address);
      const locals = await loadLocalOptimistic(address, chains);
      const primed = mergeStable([sticky, locals]);
      setItems(primed);
      setFirstLoading(false);
    })();
  }, [address, chains]);

  // Prices (non-blocking)
  const loadPrices = useCallback(async () => {
    try {
      const ids = Array.from(
        new Set(
          chains
            .map((c) => PRICE_IDS[c.nativeSymbol as PriceSym])
            .filter(Boolean)
        )
      );
      if (!ids.length) return;
      const vs = (localCurrency || "usd").toLowerCase();
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(
        ","
      )}&vs_currencies=usd,${vs}`;
      const data = await withTimeout(fetch(url).then((r) => r.json()), 3500, {});
      const next = { ...priceMap };
      (Object.keys(PRICE_IDS) as PriceSym[]).forEach((sym) => {
        const id = PRICE_IDS[sym];
        const d = (data as any)?.[id] || {};
        next[sym] = { usd: Number(d?.usd || 0), local: Number(d?.[vs] || 0) };
      });
      setPriceMap(next);
    } catch {}
  }, [chains, localCurrency, priceMap]);

  // Fetch one chain: indexer (native+erc20) + RPC progressive inbound (erc20+native)
  const fetchChain = useCallback(
    async (c: EvmChain, owner: string) => {
      const [cvNative, cvToken] = await Promise.all([
        fetchCovalentNative(c, owner, true),
        fetchCovalentTokenTransfers(c, owner, true),
      ]);
      const [rxToken, rxNative] = await Promise.all([
        rpcErc20Progressive(c, owner),
        rpcNativeProgressive(c, owner),
      ]);
      return mergeStable([[...cvNative, ...cvToken, ...rxToken, ...rxNative]]);
    },
    []
  );

  const fetchAll = useCallback(
    async (soft = true) => {
      if (!address) {
        setRefreshing(false);
        setFirstLoading(false);
        return;
      }
      if (soft) setRefreshing(true);
      try {
        loadPrices().catch(() => {});
        const perChain = await Promise.allSettled(
          chains.map((c) => fetchChain(c, address))
        );
        const fresh = perChain
          .map((r) => (r.status === "fulfilled" ? r.value : []))
          .flat();

        if (fresh.length) {
          const next = mergeStable([items, fresh]); // non-destructive union
          setItems(next);
          await saveSticky(address, fresh); // persist without wiping
        }
      } finally {
        setRefreshing(false);
        setFirstLoading(false);
      }
    },
    [address, chains, fetchChain, loadPrices, items]
  );

  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchAll(true);
      const id = setInterval(() => {
        if (alive) fetchAll(true);
      }, POLL_MS);
      return () => {
        alive = false;
        clearInterval(id);
      };
    }, [fetchAll])
  );

  const onRefresh = useCallback(() => fetchAll(false), [fetchAll]);

  /* ───────────────────────── Render helpers ───────────────────────── */
  const priceFor = (s: PriceSym) => priceMap[s] || { usd: 0, local: 0 };

  const renderAmount = (it: HistoryItem) => {
    if (it.kind === "native") {
      const amt = parseFloat(ethers.utils.formatEther(it.valueWei || "0"));
      if (displayUnit === "USD")
        return `${(amt * priceFor(it.nativeSymbol).usd).toFixed(2)} USD`;
      if (displayUnit === localCurrency)
        return `${(amt * priceFor(it.nativeSymbol).local).toFixed(2)} ${localCurrency}`;
      return `${fmt(amt, 6)} ${it.nativeSymbol}`;
    }
    const num = Number(
      ethers.utils.formatUnits(it.tokenValue || "0", it.tokenDecimals || 18)
    );
    const dp = Math.min(6, it.tokenDecimals || 18);
    return `${fmt(num, dp)} ${(it as TokenItem).tokenSymbol}`;
  };

  const openExplorer = (it: HistoryItem) => {
    if (!it.explorerBase || !it.hash) return;
    Linking.openURL(`${it.explorerBase}/tx/${it.hash}`);
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const isSend = address && item.from === address;
    const color = isSend ? "#E11D48" : "#16A34A";
    const ts = new Date(item.timestamp).toLocaleString();
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => openExplorer(item)}>
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <Ionicons
              name={isSend ? "arrow-up" : "arrow-down"}
              size={22}
              color={color}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.date}>{ts}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.chainTag}>
              {item.kind === "erc20"
                ? (item as TokenItem).tokenSymbol
                : item.nativeSymbol}
            </Text>
          </View>
          <View style={styles.line} />
          <View style={styles.row}>
            <Text style={styles.label}>Amount:</Text>
            <Text style={styles.value}>{renderAmount(item)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Status:</Text>
            <Text style={[styles.value, styles.statusConfirmed]}>
              {item.successful ? "Confirmed" : "Failed"}
            </Text>
          </View>
          <View style={styles.row}>
  <Text style={styles.label}>{isSend ? "To" : "From"}:</Text>
  <Text style={styles.addr}>{isSend ? mask(item.to) : mask(item.from)}</Text>
</View>
          <View style={styles.row}>
            <Text style={styles.label}>Hash:</Text>
            <Text style={styles.addr}>{mask(item.hash)}</Text>
          </View>
          {item.kind === "erc20" && (
            <View style={styles.row}>
              <Text style={styles.label}>Token:</Text>
              <Text style={styles.addr}>
                {mask((item as TokenItem).contract)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  /* ───────────────────────── UI ───────────────────────── */
  const Header = () => (
    <View style={styles.headerWrap}>
      <Text style={styles.headerTitle}>Transaction History</Text>
      <View style={styles.unitRow}>
        <TouchableOpacity
          style={displayUnit === "TOKEN" ? styles.unitButtonActive : styles.unitButton}
          onPress={() => setDisplayUnit("TOKEN")}
        >
          <Text style={displayUnit === "TOKEN" ? styles.unitTextActive : styles.unitText}>
            TOKEN
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={displayUnit === "USD" ? styles.unitButtonActive : styles.unitButton}
          onPress={() => setDisplayUnit("USD")}
        >
          <Text style={displayUnit === "USD" ? styles.unitTextActive : styles.unitText}>
            USD
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={
            displayUnit === localCurrency ? styles.unitButtonActive : styles.unitButton
          }
          onPress={() => setDisplayUnit(localCurrency)}
        >
          <Text
            style={
              displayUnit === localCurrency ? styles.unitTextActive : styles.unitText
            }
          >
            {localCurrency}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!address) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 16, color: "#374151" }}>
          Connect or create a wallet to see history.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {firstLoading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0A84FF" />
          <Text style={{ marginTop: 8 }}>Loading history…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          ListHeaderComponent={Header}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: "#666", marginTop: 24 }}>
              No transactions yet.
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#0A84FF"]}
            />
          }
        />
      )}
    </View>
  );
}

/* ───────────────────────── Styles ───────────────────────── */
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },

  // header styling aligned to other app pages: blue, centered, same size/weight
  headerWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0A84FF",
    textAlign: "center",
    marginBottom: 12,
  },

  unitRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  unitButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
  },
  unitButtonActive: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#0A84FF",
    borderRadius: 20,
  },
  unitText: { color: "#0A84FF", fontWeight: "bold" },
  unitTextActive: { color: "#fff", fontWeight: "bold" },

  card: {
    backgroundColor: "#F5F9FF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E6F0FF",
  },
  rowTop: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  date: { color: "#111", fontWeight: "600" },
  chainTag: {
    backgroundColor: "#E8F1FF",
    color: "#0A84FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontWeight: "700",
  },
  line: { height: 1, backgroundColor: "#E6EAF2", marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", marginTop: 6 },
  label: { width: 86, fontWeight: "bold", color: "#000" },
  value: { flex: 1, color: "#111" },
  addr: {
    flex: 1,
    color: "#333",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: undefined,
    }),
  },
  statusConfirmed: { color: "#16A34A", fontWeight: "700" },
});
