// src/screens/HistoryTab.tsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View, Text, ActivityIndicator, FlatList, StyleSheet, Linking,
  TouchableOpacity, RefreshControl, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Localization from "expo-localization";
import * as ethers from "ethers";

import { useWalletStore } from "../store/useWalletStore";
import { CHAINS, EvmChain } from "../config/chainRegistry";
import { covalentGet } from "../lib/covalent";

// ===== Types =====
type TxItem = {
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  valueWei: string; // native only
  successful: boolean;
  chainId: number;
  explorerBase: string;
  nativeSymbol: "ETH" | "BNB" | "MATIC";
  _source?: "covalent" | "rpc" | "explorer" | "sticky" | "erc20_rpc" | "erc20_covalent";
  isToken?: boolean;
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenContract?: string;
  tokenValueUnits?: string; // decimal string
  direction?: "IN" | "OUT";
};

const ERC20_IFACE = new ethers.utils.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");

// Known CoinGecko ids for common symbols
const PRICE_IDS: Record<string, string> = {
  ETH: "ethereum",
  WETH: "ethereum",
  BNB: "binancecoin",
  WBNB: "binancecoin",
  MATIC: "matic-network",
  WMATIC: "matic-network",
  USDT: "tether",
  USDC: "usd-coin",
  DAI: "dai",
};

const maskAddr = (a: string) =>
  a?.startsWith("0x") && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
const fmt = (n: number, dp = 6) =>
  Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/, "").replace(/\.$/, "") : "—";

// ---- tuning ----
const COVALENT_PAGE_SIZE = 100;
const RX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RPC_POLL_MS = 60000; // 60s poll to avoid flicker
const FETCH_TIMEOUT = 6500;
const SOFT_TIMEOUT = 3500;

const RX_CACHE_KEY = (addr: string) => `rxCache_v3:${addr.toLowerCase()}`;

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { onTimeout ? resolve(onTimeout()) : reject(new Error("timeout")); }, ms);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); onTimeout ? resolve(onTimeout()) : reject(e); });
  });
}

// ===== PRICE HELPERS =====
async function fetchJson(url: string, timeout = 7000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
  clearTimeout(t);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadSymbolPrices(symbols: string[], vs: string[]) {
  const ids = [...new Set(symbols.map((s) => PRICE_IDS[s]).filter(Boolean))];
  if (!ids.length) return {};

  const vsq = [...new Set(vs.map((v) => v.toLowerCase()))];

  // 1) try simple/price
  let data: any = {};
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=${vsq.join(",")}`;
    data = await fetchJson(url, 6500);
  } catch { data = {}; }

  // 2) fill any missing USD via markets
  const missingUsd = ids.filter((id) => !(data?.[id]?.usd > 0));
  if (missingUsd.length) {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${missingUsd.join(",")}&per_page=${missingUsd.length}`;
      const m = await fetchJson(url, 6500);
      for (const row of Array.isArray(m) ? m : []) {
        if (!data[row.id]) data[row.id] = {};
        data[row.id].usd = row.current_price || 0;
      }
    } catch {}
  }
  return data;
}

// ===== MAIN COMPONENT =====
export default function HistoryTab() {
  const address = useWalletStore((s) => s.address);

  const [displayUnit, setDisplayUnit] = useState<"TOKEN" | "USD" | string>("TOKEN");
  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();

  const chains: EvmChain[] = useMemo(() => CHAINS, []);
  const [items, setItems] = useState<TxItem[]>([]);
  const [firstLoading, setFirstLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // priceMap keyed by SYMBOL (e.g., MATIC/USDT/ETH)
  const [priceMap, setPriceMap] = useState<Record<string, { usd: number; local: number }>>({});
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Cache for ERC20 metadata so RPC lookbacks can resolve symbol/decimals once
  const erc20MetaRef = useRef<Map<string, { symbol: string; decimals: number }>>(new Map());

  // ===== covalent native =====
  const toNativeTxItems = (raw: any[], c: EvmChain, source: TxItem["_source"]): TxItem[] =>
    (raw || []).map((t: any) => ({
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
      nativeSymbol: c.nativeSymbol,
      _source: source,
    }));

  const toTokenItemsFromCovalent = (raw: any[], c: EvmChain): TxItem[] =>
    (raw || []).map((t: any) => {
      const dec = Number(t.contract_decimals ?? 18);
      const rawUnits = String(t.delta || "0");
      const units = ethers.utils.formatUnits(rawUnits, Number.isFinite(dec) ? dec : 18);
      return {
        hash: t.tx_hash || "",
        timestamp: t.block_signed_at ? new Date(Date.parse(t.block_signed_at)).toISOString() : new Date().toISOString(),
        from: (t.from_address || "").toLowerCase(),
        to: (t.to_address || "").toLowerCase(),
        valueWei: "0",
        successful: true,
        chainId: c.chainId,
        explorerBase: c.explorerBase,
        nativeSymbol: c.nativeSymbol,
        _source: "erc20_covalent",
        isToken: true,
        tokenSymbol: String(t.contract_ticker_symbol || "TOKEN"),
        tokenDecimals: Number.isFinite(dec) ? dec : 18,
        tokenContract: (t.contract_address || "").toLowerCase(),
        tokenValueUnits: units,
        direction: String(t.transfer_type || "").toUpperCase() === "IN" ? "IN" : "OUT",
      };
    });

  const amountKey = (t: TxItem) => (t.isToken ? `${t.tokenContract}:${t.tokenValueUnits}` : t.valueWei);

  const mergeAndSort = (lists: TxItem[][]): TxItem[] => {
    const map = new Map<string, TxItem>();
    for (const list of lists) {
      for (const t of list) {
        if (!t.hash) continue;
        const uniq = `${t.hash}:${t.chainId}:${t.isToken ? (t.tokenContract || "token") : "native"}:${t.from}:${t.to}:${amountKey(t)}`;
        if (!map.has(uniq)) map.set(uniq, t);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  // sticky
  const loadRxCache = useCallback(async (owner: string) => {
    try {
      const raw = await AsyncStorage.getItem(RX_CACHE_KEY(owner));
      if (!raw) return [];
      const now = Date.now();
      const arr: TxItem[] = JSON.parse(raw);
      return arr.filter((t) => now - new Date(t.timestamp).getTime() < RX_CACHE_TTL_MS);
    } catch { return []; }
  }, []);

  const safeSaveRxCache = useCallback(async (owner: string, nextList: TxItem[]) => {
    try {
      if (!nextList || nextList.length === 0) return;
      const existing = await loadRxCache(owner);
      const now = Date.now();
      const map = new Map<string, TxItem>();
      for (const t of existing) {
        if (now - new Date(t.timestamp).getTime() < RX_CACHE_TTL_MS) {
          const key = `${t.hash}:${t.chainId}:${t.isToken ? t.tokenContract : "native"}:${t.from}:${t.to}:${amountKey(t)}`;
          map.set(key, { ...t, _source: "sticky" as const });
        }
      }
      for (const t of nextList) {
        const key = `${t.hash}:${t.chainId}:${t.isToken ? t.tokenContract : "native"}:${t.from}:${t.to}:${amountKey(t)}`;
        map.set(key, { ...t, _source: "sticky" as const });
      }
      const merged = Array.from(map.values()).slice(0, 200);
      await AsyncStorage.setItem(RX_CACHE_KEY(owner), JSON.stringify(merged));
    } catch {}
  }, [loadRxCache]);

  // covalent
  const fetchChainTx = async (c: EvmChain, owner: string, soft: boolean) => {
    if (c.covalentSupported === false) return [];
    const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transactions_v3/?no-logs=true&page-size=${COVALENT_PAGE_SIZE}`;
    try {
      const json = await withTimeout(covalentGet(url), soft ? SOFT_TIMEOUT : FETCH_TIMEOUT, () => ({ data: { items: [] } } as any));
      return toNativeTxItems((json as any)?.data?.items ?? [], c, "covalent");
    } catch { return []; }
  };

  const fetchTokenTransfers = async (c: EvmChain, owner: string, soft: boolean): Promise<TxItem[]> => {
    if (c.covalentSupported === false) return [];
    const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transfers_v3/?contract-address=all&no-logs=false&page-size=${COVALENT_PAGE_SIZE}`;
    try {
      const json = await withTimeout(covalentGet(url), soft ? SOFT_TIMEOUT : FETCH_TIMEOUT, () => ({ data: { items: [] } } as any));
      const items: any[] = (json as any)?.data?.items || [];
      return toTokenItemsFromCovalent(items, c);
    } catch { return []; }
  };

  // explorer API (optional, Amoy)
  async function fetchExplorerTx(c: EvmChain, owner: string, soft: boolean): Promise<TxItem[]> {
    if (c.chainId !== 80002) return [];
    const apiKey = (process.env.EXPO_PUBLIC_POLYGONSCAN_API_KEY || "").trim();
    const base = "https://api-amoy.polygonscan.com/api";
    try {
      const url = `${base}?module=account&action=txlist&address=${owner}&sort=desc&page=1&offset=50${apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : ""}`;
      const json = await withTimeout(fetch(url).then(r => r.json()), soft ? SOFT_TIMEOUT : FETCH_TIMEOUT, () => null as any);
      if (!json || String(json.status) !== "1" || !Array.isArray(json.result)) return [];
      return toNativeTxItems(json.result, c, "explorer");
    } catch { return []; }
  }

  // rpc native incoming (deeper lookback for unsupported chains)
  async function rpcIncomingLookback(c: EvmChain, owner: string, lookbackBlocks: number): Promise<TxItem[]> {
    try {
      const rpc = c.rpcUrls?.[0];
      if (!rpc) return [];
      const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: c.chainId, name: c.name });
      const latest = await provider.getBlockNumber();
      const lower = Math.max(0, latest - Math.max(1, lookbackBlocks - 1));
      const out: TxItem[] = [];
      const blocks = Array.from({ length: latest - lower + 1 }, (_, i) => latest - i).slice(0, lookbackBlocks);
      const blockDatas = await Promise.allSettled(blocks.map((bn) => provider.getBlockWithTransactions(bn)));
      for (const res of blockDatas) {
        if (res.status !== "fulfilled" || !res.value) continue;
        const block = res.value;
        const ts = (block?.timestamp || Math.floor(Date.now() / 1000)) * 1000;
        for (const tx of block.transactions || []) {
          const to = (tx.to || "").toLowerCase();
          if (!to || to !== owner) continue;
          out.push({
            hash: tx.hash || "",
            timestamp: new Date(ts).toISOString(),
            from: (tx.from || "").toLowerCase(),
            to,
            valueWei: (tx.value || ethers.constants.Zero).toString(),
            successful: true,
            chainId: c.chainId,
            explorerBase: c.explorerBase,
            nativeSymbol: c.nativeSymbol,
            _source: "rpc",
          });
        }
      }
      return out;
    } catch { return []; }
  }

  // rpc erc20 incoming (logs) with on-chain metadata (symbol/decimals) caching
  async function rpcErc20IncomingLookback(c: EvmChain, owner: string, lookbackBlocks: number): Promise<TxItem[]> {
    try {
      const rpc = c.rpcUrls?.[0];
      if (!rpc) return [];
      const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: c.chainId, name: c.name });
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - Math.max(1, lookbackBlocks - 1));
      const ownerTopic = ethers.utils.hexZeroPad(owner, 32);
      const logs = await provider.getLogs({ fromBlock, toBlock: latest, topics: [TRANSFER_TOPIC, null, ownerTopic] });
      const out: TxItem[] = [];
      for (const log of logs) {
        try {
          const parsed = ERC20_IFACE.parseLog(log);
          const from = (parsed.args[0] as string).toLowerCase();
          const to = (parsed.args[1] as string).toLowerCase();
          const value = parsed.args[2] as ethers.BigNumber;
          if (to !== owner) continue;

          const txHash = log.transactionHash;
          const contractAddr = log.address.toLowerCase();
          const metaKey = `${c.chainId}:${contractAddr}`;
          let meta = erc20MetaRef.current.get(metaKey);
          if (!meta) {
            try {
              const contract = new ethers.Contract(contractAddr, ERC20_IFACE.fragments, provider);
              const [sym, dec] = await Promise.allSettled([contract.symbol(), contract.decimals()]);
              meta = {
                symbol: sym.status === "fulfilled" ? String(sym.value) : "TOKEN",
                decimals: dec.status === "fulfilled" ? Number(dec.value) : 18,
              };
            } catch {
              meta = { symbol: "TOKEN", decimals: 18 };
            }
            erc20MetaRef.current.set(metaKey, meta);
          }

          const blk = await provider.getBlock(log.blockNumber);
          const ts = (blk?.timestamp || Math.floor(Date.now() / 1000)) * 1000;

          out.push({
            hash: txHash,
            timestamp: new Date(ts).toISOString(),
            from,
            to,
            valueWei: "0",
            successful: true,
            chainId: c.chainId,
            explorerBase: c.explorerBase,
            nativeSymbol: c.nativeSymbol,
            _source: "erc20_rpc",
            isToken: true,
            tokenSymbol: meta.symbol,
            tokenDecimals: meta.decimals,
            tokenContract: contractAddr,
            tokenValueUnits: ethers.utils.formatUnits(value, meta.decimals),
            direction: "IN",
          });
        } catch {}
      }
      return out;
    } catch { return []; }
  }

  // === Fetch, then price based on actual symbols present ===
  const fetchAll = useCallback(async (soft = false) => {
    if (!address) return;

    const owner = address.toLowerCase();
    const sticky = await loadRxCache(owner);

    const backNative = await Promise.allSettled(
      chains.map((c) => rpcIncomingLookback(c, owner, c.covalentSupported === false ? 240 : 24))
    );
    const backErc20  = await Promise.allSettled(
      chains.map((c) => rpcErc20IncomingLookback(c, owner, c.covalentSupported === false ? 240 : 24))
    );

    const cvTx  = await Promise.allSettled(chains.map((c) => fetchChainTx(c, owner, !!soft)));
    const cvTok = await Promise.allSettled(chains.map((c) => fetchTokenTransfers(c, owner, !!soft)));
    const exTx  = await Promise.allSettled(chains.map((c) => fetchExplorerTx(c, owner, !!soft)));

    const merged = mergeAndSort([
      ...cvTx.map((r) => (r.status === "fulfilled" ? r.value : [])),
      ...cvTok.map((r) => (r.status === "fulfilled" ? r.value : [])),
      ...exTx.map((r) => (r.status === "fulfilled" ? r.value : [])),
      ...backNative.map((r) => (r.status === "fulfilled" ? r.value : [])),
      ...backErc20.map((r) => (r.status === "fulfilled" ? r.value : [])),
      sticky,
    ]);

    setItems(merged);
    await safeSaveRxCache(owner, merged);

    // Collect the symbols that actually appear and load prices for those
    const presentSymbols = new Set<string>();
    merged.forEach((t) => {
      if (t.isToken) {
        const s = (t.tokenSymbol || "").toUpperCase();
        if (s) presentSymbols.add(s);
      } else {
        presentSymbols.add(t.nativeSymbol);
      }
    });
    // Always include the wallet native symbols for chains you're using
    chains.forEach((c) => presentSymbols.add(c.nativeSymbol));

    const symbols = Array.from(presentSymbols);
    const vsList = ["usd", (localCurrency || "USD").toLowerCase()];
    const cg = await loadSymbolPrices(symbols, vsList);

    setPriceMap((prev) => {
      const out = { ...prev };
      symbols.forEach((sym) => {
        const id = PRICE_IDS[sym];
        const rec = id ? cg[id] : null;
        const usd = Number(rec?.usd || 0);
        const loc = Number(rec?.[(localCurrency || "USD").toLowerCase()] || 0);
        out[sym] = { usd, local: loc };
      });
      return out;
    });

    setFirstLoading(false);
    setIsRefreshing(false);
  }, [address, chains, localCurrency, loadRxCache, safeSaveRxCache]);

  useEffect(() => { fetchAll(false); /* mount */ }, []);

  useFocusEffect(
    useCallback(() => {
      setIsRefreshing(true);
      fetchAll(true);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => fetchAll(true), RPC_POLL_MS);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchAll])
  );

  const openExplorer = (t: TxItem) => {
    if (!t.explorerBase || !t.hash) return;
    Linking.openURL(`${t.explorerBase}/tx/${t.hash}`);
  };

  const priceFor = (sym: string) => priceMap[sym] || { usd: 0, local: 0 };

  const renderItem = ({ item }: { item: TxItem }) => {
    const me = (address || "").toLowerCase();
    const isSend = item.isToken
      ? (item.direction === "OUT" || (me && item.from === me))
      : (me && item.from === me);
    const successful = item.successful !== false;
    const dt = new Date(item.timestamp).toLocaleString();

    // Amount formatting with unit / currency toggle
    let amountText = "";
    let unitText = "";

    if (item.isToken) {
      const sym = (item.tokenSymbol || "TOKEN").toUpperCase();
      const val = Number(item.tokenValueUnits || "0");
      if (displayUnit === "USD") {
        const usd = priceFor(sym).usd;
        if (usd > 0) { amountText = (val * usd).toFixed(2); unitText = "USD"; }
        else { amountText = fmt(val, 6); unitText = sym; }
      } else if (displayUnit === localCurrency) {
        const loc = priceFor(sym).local;
        if (loc > 0) { amountText = (val * loc).toFixed(2); unitText = localCurrency; }
        else { amountText = fmt(val, 6); unitText = sym; }
      } else {
        amountText = fmt(val, 6); unitText = sym;
      }
    } else {
      const valNative = parseFloat(ethers.utils.formatEther(item.valueWei || "0"));
      const sym = item.nativeSymbol;
      if (displayUnit === "USD") {
        amountText = (valNative * priceFor(sym).usd).toFixed(2); unitText = "USD";
      } else if (displayUnit === localCurrency) {
        amountText = (valNative * priceFor(sym).local).toFixed(2); unitText = localCurrency;
      } else {
        amountText = fmt(valNative, 6); unitText = sym;
      }
    }

    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => openExplorer(item)}>
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <Ionicons
              name={isSend ? "arrow-up" : "arrow-down"}
              size={22}
              color={isSend ? "#E11D48" : "#16A34A"}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.date}>{dt}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.chainTag}>{item.isToken ? (item.tokenSymbol || "TOKEN") : item.nativeSymbol}</Text>
          </View>

          <View style={styles.line} />

          <View style={styles.row}>
            <Text style={styles.label}>Amount:</Text>
            <Text style={styles.value}>
              {amountText} {unitText}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Status:</Text>
            <Text style={[styles.value, successful ? styles.statusConfirmed : styles.statusFailed]}>
              {successful ? "Confirmed" : "Failed"}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>{isSend ? "To:" : "From:"}</Text>
            <Text style={styles.valueAddr}>{isSend ? maskAddr(item.to) : maskAddr(item.from)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Transaction History</Text>

      <View style={styles.controlsBlockCentered}>
        <View style={styles.unitRow}>
          <TouchableOpacity
            style={displayUnit === "TOKEN" ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setDisplayUnit("TOKEN")}
          >
            <Text style={displayUnit === "TOKEN" ? styles.unitTextActive : styles.unitText}>TOKEN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={displayUnit === "USD" ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setDisplayUnit("USD")}
          >
            <Text style={displayUnit === "USD" ? styles.unitTextActive : styles.unitText}>USD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={displayUnit === localCurrency ? styles.unitButtonActive : styles.unitButton}
            onPress={() => setDisplayUnit(localCurrency)}
          >
            <Text style={displayUnit === localCurrency ? styles.unitTextActive : styles.unitText}>{localCurrency}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {firstLoading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0A84FF" />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(it, i) =>
            it.hash ? `${it.hash}:${it.chainId}:${it.isToken ? (it.tokenContract || "token") : "native"}:${it.from}:${it.to}:${amountKey(it)}` : String(i)
          }
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchAll(true)} colors={["#0A84FF"]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  heading: {
    fontSize: 36, fontWeight: "bold", color: "#0A84FF",
    marginTop: 50, paddingHorizontal: 16, marginBottom: 8, textAlign: "center",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContainer: { padding: 16 },
  empty: { textAlign: "center", color: "#888", marginTop: 24 },

  controlsBlockCentered: { paddingHorizontal: 16, marginBottom: 6, alignItems: "center" },
  unitRow: { flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center" },
  unitButton: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#f3f4f6", borderRadius: 20 },
  unitButtonActive: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#0A84FF", borderRadius: 20 },
  unitText: { color: "#0A84FF", fontWeight: "bold" },
  unitTextActive: { color: "#fff", fontWeight: "bold" },

  card: {
    backgroundColor: "#F5F9FF",
    borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#E6F0FF",
  },
  rowTop: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  chainTag: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: "#E8F1FF", color: "#0A84FF", fontWeight: "700",
  },
  line: { height: 1, backgroundColor: "#E6EAF2", marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", marginTop: 6 },
  label: { width: 86, fontWeight: "bold", color: "#000" },
  value: { flex: 1, color: "#111" },
  valueAddr: { flex: 1, color: "#333", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: undefined }) },
  date: { color: "#333", fontWeight: "600" },
  statusConfirmed: { color: "#16A34A", fontWeight: "700" },
  statusFailed: { color: "#DC2626", fontWeight: "700" },
});
