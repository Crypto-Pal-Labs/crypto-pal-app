import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
import * as Localization from "expo-localization";
import * as ethers from "ethers";

import { useWalletStore } from "../store/useWalletStore";
import { EvmChain } from "../config/chainRegistry";
import { useChain } from "../hooks/useChain";
import { covalentGet } from "../lib/covalent";
import { isCovalentSupported } from "../config/capabilities";

/* ====================== Types ====================== */
type TxItem = {
  hash: string;
  timestamp: string; // ISO
  from: string;
  to: string;
  valueWei: string;
  gasUsed?: string | number | null;
  gasPrice?: string | number | null;
  feesPaidWei?: string | number | null;
  successful: boolean;
  chainId: number;
  explorerBase: string;
  nativeSymbol: "ETH" | "BNB" | "MATIC";
  _source?: "covalent" | "rpc" | "explorer" | "sticky" | "erc20_rpc" | "erc20_covalent" | "erc20_explorer";
  isToken?: boolean;
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenContract?: string;
  tokenValueUnits?: string; // decimal string
  direction?: "IN" | "OUT";
};

const ERC20_IFACE = new ethers.utils.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");

/* ====================== Pricing ====================== */
const PRICE_IDS: Record<string, string> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  MATIC: "matic-network",
  USDT: "tether",
  USDC: "usd-coin",
  DAI: "dai",
};

const majors = ["ETH", "BNB", "MATIC"] as const;

const binancePair = (sym: string) =>
  ({ ETH: "ETHUSDT", BNB: "BNBUSDT", MATIC: "MATICUSDT" } as Record<string, string>)[
    (sym || "").toUpperCase()
  ] || "";

/* ====================== Tunables ====================== */
const COVALENT_PAGE_SIZE = 100;
const FETCH_TIMEOUT = 4500;   // keep it snappy
const SOFT_TIMEOUT  = 2500;
const AMOY_CHAIN_ID = 80002;
const RPC_SWEEP_BLOCKS_DEEP = 600; // bounded & fast
const RX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RX_CACHE_KEY = (addr: string) => `rxCache_v2:${addr.toLowerCase()}`;

const maskAddr = (a: string) =>
  a?.startsWith("0x") && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
const fmt = (n: number, dp = 6) =>
  Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/, "").replace(/\.$/, "") : "—";

/* ====================== Helpers ====================== */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => (onTimeout ? resolve(onTimeout()) : reject(new Error("timeout"))), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); onTimeout ? resolve(onTimeout()) : reject(e); });
  });
}

async function loadBinanceUsd(sym: string): Promise<number | null> {
  const pair = binancePair(sym);
  if (!pair) return null;
  try {
    const r = await withTimeout(fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`), SOFT_TIMEOUT);
    const j = await r.json();
    const px = Number(j?.price);
    return Number.isFinite(px) ? px : null;
  } catch { return null; }
}

async function fetchUsdToLocalFx(local: string): Promise<number> {
  const code = (local || "USD").toUpperCase();
  if (code === "USD") return 1;
  try {
    const u = `https://api.exchangerate.host/latest?base=USD&symbols=${encodeURIComponent(code)}`;
    const r = await withTimeout(fetch(u), SOFT_TIMEOUT);
    const j = await r.json();
    const rate = Number(j?.rates?.[code]);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {}
  try {
    const r2 = await withTimeout(fetch("https://open.er-api.com/v6/latest/USD"), SOFT_TIMEOUT);
    const j2 = await r2.json();
    const rate2 = Number(j2?.rates?.[code]);
    if (Number.isFinite(rate2) && rate2 > 0) return rate2;
  } catch {}
  return 0;
}

async function loadPricesStrong(
  localCurrency: string
): Promise<Record<string, { usd: number; local: number }>> {
  // Fixed set — fast
  const syms = ["ETH", "BNB", "MATIC", "USDT", "USDC", "DAI"];
  const ids = Array.from(new Set(syms.map((s) => PRICE_IDS[(s || "").toUpperCase()]).filter(Boolean)));
  const vs = (localCurrency || "USD").toLowerCase();
  const out: Record<string, { usd: number; local: number }> = {};

  // 1) CoinGecko
  try {
    if (ids.length) {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,${vs}`;
      const data = await withTimeout(fetch(url).then((r) => r.json()), SOFT_TIMEOUT, () => ({} as any));
      Object.keys(PRICE_IDS).forEach((sym) => {
        const id = PRICE_IDS[sym];
        const d = (data as any)?.[id] || {};
        out[sym] = { usd: Number(d?.usd || 0), local: Number(d?.[vs] || 0) };
      });
    }
  } catch {}

  // 2) Binance USD fallback for majors
  for (const s of majors) {
    if (!out[s] || !(out[s].usd > 0)) {
      const usd = await loadBinanceUsd(s);
      if (usd && usd > 0) out[s] = { usd, local: out[s]?.local || 0 };
    }
  }

  // 3) Local via USD×FX
  let fx = localCurrency === "USD" ? 1 : 0;
  if (fx === 0) fx = await fetchUsdToLocalFx(localCurrency);
  if (fx > 0) {
    for (const sym of Object.keys(out)) {
      const rec = out[sym];
      if (rec && rec.usd > 0 && !(rec.local > 0)) rec.local = rec.usd * fx;
    }
  }

  console.log("[PRICE_DEBUG] local=", localCurrency, "fx=", fx, "map=", JSON.stringify(out));
  return out;
}

/* ====================== Normalizers ====================== */
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
    gasUsed: t.gas_spent ?? t.gas_used ?? t.gasUsed ?? null,
    gasPrice: t.effective_gas_price ?? t.gas_price ?? t.gasPrice ?? null,
    feesPaidWei: t.fees_paid ?? null,
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

/* ====================== Merge/Dedupe ====================== */
const amountKey = (t: TxItem) => (t.isToken ? `${t.tokenContract}:${t.tokenValueUnits}` : t.valueWei);
function mergeAndSort(lists: TxItem[][]): TxItem[] {
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
}

/* ====================== Explorer helpers ====================== */
function explorerApiBase(c: EvmChain): string | null {
  if (c.chainId === AMOY_CHAIN_ID) return "https://api-amoy.polygonscan.com/api";
  if (c.chainId === 11155111) return "https://api-sepolia.etherscan.io/api";
  if (c.chainId === 97) return "https://api-testnet.bscscan.com/api";
  if (c.chainId === 1) return "https://api.etherscan.io/api";
  if (c.chainId === 56) return "https://api.bscscan.com/api";
  if (c.chainId === 137) return "https://api.polygonscan.com/api";
  return null;
}

// Accept rows whenever result is an array (even if status=0/NOTOK) — crucial for Amoy
async function fetchExplorerNative(c: EvmChain, owner: string): Promise<TxItem[]> {
  const base = explorerApiBase(c);
  if (!base) return [];
  const url = `${base}?module=account&action=txlist&address=${owner}&sort=desc&page=1&offset=200`;
  try {
    const json = await withTimeout(fetch(url).then((r) => r.json()), FETCH_TIMEOUT, () => null as any);
    const rows = Array.isArray(json?.result) ? json.result : [];
    console.log("[EXPLORER_NATIVE]", c.chainId, "rows=", rows.length, "status=", json?.status, "message=", json?.message);
    return rows.length ? toNativeTxItems(rows, c, "explorer") : [];
  } catch { return []; }
}

async function fetchExplorerToken(c: EvmChain, owner: string): Promise<TxItem[]> {
  const base = explorerApiBase(c);
  if (!base) return [];
  const url = `${base}?module=account&action=tokentx&address=${owner}&sort=desc&page=1&offset=200`;
  try {
    const json = await withTimeout(fetch(url).then((r) => r.json()), FETCH_TIMEOUT, () => null as any);
    const rows = Array.isArray(json?.result) ? json.result : [];
    console.log("[EXPLORER_TOKEN]", c.chainId, "rows=", rows.length, "status=", json?.status, "message=", json?.message);
    const list: TxItem[] = rows.map((t: any) => {
      const dec = Number(t.tokenDecimal ?? 18);
      const units = ethers.utils.formatUnits(String(t.value || "0"), Number.isFinite(dec) ? dec : 18);
      return {
        hash: t.hash || t.tx_hash || "",
        timestamp: t.timeStamp ? new Date(Number(t.timeStamp) * 1000).toISOString() : new Date().toISOString(),
        from: (t.from || "").toLowerCase(),
        to: (t.to || "").toLowerCase(),
        valueWei: "0",
        successful: true,
        chainId: c.chainId,
        explorerBase: c.explorerBase,
        nativeSymbol: c.nativeSymbol,
        _source: "erc20_explorer",
        isToken: true,
        tokenSymbol: String(t.tokenSymbol || "TOKEN"),
        tokenDecimals: Number.isFinite(dec) ? dec : 18,
        tokenContract: (t.contractAddress || "").toLowerCase(),
        tokenValueUnits: units,
        direction: (t.to || "").toLowerCase() === owner ? "IN" : "OUT",
      };
    });
    return list;
  } catch { return []; }
}

/* ====================== Covalent ====================== */
async function fetchCovalentNative(c: EvmChain, owner: string): Promise<TxItem[]> {
  if (!isCovalentSupported("txs", c.covalentChainId)) return [];
  const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transactions_v3/?no-logs=true&page-size=${COVALENT_PAGE_SIZE}`;
  try {
    const json = await withTimeout(covalentGet(url), FETCH_TIMEOUT, () => ({ data: { items: [] } } as any));
    return toNativeTxItems((json as any)?.data?.items ?? [], c, "covalent");
  } catch { return []; }
}

async function fetchCovalentToken(c: EvmChain, owner: string): Promise<TxItem[]> {
  if (!isCovalentSupported("txs", c.covalentChainId)) return [];
  const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/transfers_v3/?contract-address=all&no-logs=false&page-size=${COVALENT_PAGE_SIZE}`;
  try {
    const json = await withTimeout(covalentGet(url), FETCH_TIMEOUT, () => ({ data: { items: [] } } as any));
    return toTokenItemsFromCovalent((json as any)?.data?.items ?? [], c);
  } catch { return []; }
}

/* ====================== RPC fallback (Amoy only) ====================== */
function rpcUrlOf(c: EvmChain): string | undefined {
  const anyC = c as any;
  return anyC.rpc || (Array.isArray(anyC.rpcUrls) ? anyC.rpcUrls[0] : undefined);
}

async function rpcSweepRecentNative(c: EvmChain, owner: string, blocks: number): Promise<TxItem[]> {
  const out: TxItem[] = [];
  try {
    const rpc = rpcUrlOf(c);
    if (!rpc) return out;
    const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: c.chainId, name: c.name });
    const latest = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - Math.max(1, blocks - 1));
    for (let bn = latest; bn >= fromBlock; bn--) {
      try {
        const block = await provider.getBlockWithTransactions(bn);
        const ts = (block?.timestamp || Math.floor(Date.now() / 1000)) * 1000;
        for (const tx of block?.transactions || []) {
          const from = (tx.from || "").toLowerCase();
          const to = (tx.to || "").toLowerCase();
          if (from === owner || to === owner) {
            out.push({
              hash: tx.hash || "",
              timestamp: new Date(ts).toISOString(),
              from, to,
              valueWei: (tx.value || ethers.constants.Zero).toString(),
              gasUsed: null, gasPrice: null, feesPaidWei: null,
              successful: true,
              chainId: c.chainId,
              explorerBase: c.explorerBase,
              nativeSymbol: c.nativeSymbol,
              _source: "rpc",
              direction: from === owner ? "OUT" : "IN",
            });
          }
        }
      } catch {}
    }
  } catch {}
  return out;
}

/* ====================== Component ====================== */
export default function HistoryTab() {
  const address = useWalletStore((s) => s.address);

  const [displayUnit, setDisplayUnit] = useState<"TOKEN" | "USD" | string>("TOKEN");
  const locale = Localization.getLocales()[0] || { currencyCode: "USD" as const };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();

  const { chains: availableChains } = useChain();

  // Always include Amoy explicitly in the sweep
  const chains: EvmChain[] = useMemo(() => {
    const base = (availableChains || []) as EvmChain[];
    const hasAmoy = base.some((c) => c.chainId === AMOY_CHAIN_ID);
    const amoy: EvmChain = {
      chainId: AMOY_CHAIN_ID,
      name: "Polygon Amoy",
      nativeSymbol: "MATIC",
      explorerBase: "https://amoy.polygonscan.com",
      covalentSupported: false,
      covalentChainId: "matic-amoy" as any,
      rpcUrls: ["https://rpc-amoy.polygon.technology"],
    } as any;
    const list = hasAmoy ? base : [...base, amoy];
    // Optional: also ensure Sepolia & BSC Testnet are present (safe)
    const ensure = (arr: EvmChain[], c: EvmChain) =>
      arr.some((x) => x.chainId === c.chainId) ? arr : [...arr, c];
    const sepolia = { chainId: 11155111, name: "Sepolia", nativeSymbol: "ETH", explorerBase: "https://sepolia.etherscan.io", covalentSupported: true, covalentChainId: "eth-sepolia" } as any;
    const bscTn   = { chainId: 97, name: "BSC Testnet", nativeSymbol: "BNB", explorerBase: "https://testnet.bscscan.com", covalentSupported: true, covalentChainId: "bsc-testnet" } as any;
    return ensure(ensure(list, sepolia), bscTn);
  }, [availableChains]);

  const [items, setItems] = useState<TxItem[]>([]);
  const itemsRef = useRef<TxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [priceMap, setPriceMap] = useState<Record<string, { usd: number; local: number }>>({});

  const setItemsAndRef = (next: TxItem[]) => { itemsRef.current = next; setItems(next); };

  const loadRxCache = useCallback(async (owner: string) => {
    try {
      const raw = await AsyncStorage.getItem(RX_CACHE_KEY(owner));
      if (!raw) return [];
      const now = Date.now();
      const arr: TxItem[] = JSON.parse(raw);
      return arr.filter((t) => now - new Date(t.timestamp).getTime() < RX_CACHE_TTL_MS);
    } catch { return []; }
  }, []);

  const saveRxCache = useCallback(async (owner: string, list: TxItem[]) => {
    try {
      if (!list?.length) return;
      await AsyncStorage.setItem(RX_CACHE_KEY(owner), JSON.stringify(list.slice(0, 600)));
    } catch {}
  }, []);

  const loadPrices = useCallback(async () => {
    try {
      const map = await loadPricesStrong(localCurrency);
      setPriceMap(map);
    } catch {}
  }, [localCurrency]);

  const fetchAll = useCallback(async () => {
    if (!address) return;
    setLoading(true);

    const owner = address.toLowerCase();

    // Paint cached immediately (if any)
    const sticky = await loadRxCache(owner);
    if (sticky.length) setItemsAndRef(mergeAndSort([sticky]));

    // Prices (in parallel)
    loadPrices(); // fire-and-forget; UI can still render TOKEN immediately

    // Fetch chains **sequentially** and update progressively
    let aggregate: TxItem[] = itemsRef.current.length ? [...itemsRef.current] : [];
    for (const c of chains) {
      try {
        // 1) Covalent (if supported)
        let cvN: TxItem[] = [], cvT: TxItem[] = [];
        if (c.covalentSupported !== false && isCovalentSupported("txs", c.covalentChainId)) {
          [cvN, cvT] = await Promise.all([fetchCovalentNative(c, owner), fetchCovalentToken(c, owner)]);
        }

        // 2) Explorer (always try; accepts rows even if status=0)
        const [exN, exT] = await Promise.all([fetchExplorerNative(c, owner), fetchExplorerToken(c, owner)]);

        // 3) RPC sweep (Amoy only if still empty)
        let rpN: TxItem[] = [];
        if (c.chainId === AMOY_CHAIN_ID && (cvN.length + cvT.length + exN.length + exT.length) === 0) {
          rpN = await rpcSweepRecentNative(c, owner, RPC_SWEEP_BLOCKS_DEEP);
        }

        const merged = mergeAndSort([aggregate, cvN, cvT, exN, exT, rpN]);
        aggregate = merged;
        setItemsAndRef(merged); // progressive paint
        console.log("[HISTORY_CHAIN_DONE]", c.chainId, "aggCount=", merged.length, {
          cvN: cvN.length, cvT: cvT.length, exN: exN.length, exT: exT.length, rpN: rpN.length,
        });
      } catch (e: any) {
        console.log("[HISTORY_CHAIN_ERR]", c.chainId, String(e?.message || e));
      }
    }

    await saveRxCache(owner, aggregate);
    setLoading(false);
    setIsRefreshing(false);
    console.log("[HISTORY_DONE] total=", aggregate.length);
  }, [address, chains, loadPrices, loadRxCache, saveRxCache]);

  useEffect(() => {
    if (!address) return;
    console.log("[HISTORY_BOOT] chains=", chains.map((c) => c.chainId));
    fetchAll();
  }, [address, fetchAll, chains]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  const openExplorer = (t: TxItem) => {
    if (!t.explorerBase || !t.hash) return;
    Linking.openURL(`${t.explorerBase}/tx/${t.hash}`);
  };

  const priceFor = (sym: string) => priceMap[sym] || { usd: 0, local: 0 };

  const renderItem = ({ item }: { item: TxItem }) => {
    const me = (address || "").toLowerCase();
    const isSend = item.isToken
      ? item.direction === "OUT" || (me && item.from === me)
      : me && item.from === me;
    const successful = item.successful !== false;
    const dt = new Date(item.timestamp).toLocaleString();

    let amountText = "";
    let unitText = "";

    if (item.isToken) {
      const sym = (item.tokenSymbol || "TOKEN").toUpperCase();
      const val = Number(item.tokenValueUnits || "0");
      if (displayUnit === "USD") {
        const usd = PRICE_IDS[sym] ? priceFor(sym).usd : 0;
        amountText = (val * (usd || 0)).toFixed(2);
        unitText = "USD";
      } else if (displayUnit === localCurrency) {
        const loc = PRICE_IDS[sym] ? priceFor(sym).local : 0;
        amountText = (val * (loc || 0)).toFixed(2);
        unitText = localCurrency;
      } else {
        amountText = fmt(val, 6);
        unitText = sym;
      }
    } else {
      const valNative = parseFloat(ethers.utils.formatEther(item.valueWei || "0"));
      const sym = item.nativeSymbol;
      if (displayUnit === "USD") {
        amountText = (valNative * priceFor(sym).usd).toFixed(2);
        unitText = "USD";
      } else if (displayUnit === localCurrency) {
        amountText = (valNative * priceFor(sym).local).toFixed(2);
        unitText = localCurrency;
      } else {
        amountText = fmt(valNative, 6);
        unitText = sym;
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
            <Text style={styles.value}>{amountText} {unitText}</Text>
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
            <Text style={displayUnit === localCurrency ? styles.unitTextActive : styles.unitText}>
              {localCurrency}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && itemsRef.current.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0A84FF" />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(it, i) =>
            it.hash
              ? `${it.hash}:${it.chainId}:${it.isToken ? (it.tokenContract || "token") : "native"}:${it.from}:${it.to}:${amountKey(it)}`
              : String(i)
          }
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={["#0A84FF"]} />}
        />
      )}
    </View>
  );
}

/* ====================== Styles ====================== */
const mono = Platform.select({ ios: "Menlo", android: "monospace", default: undefined });

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
  valueAddr: { flex: 1, color: "#333", fontFamily: mono },
  date: { color: "#333", fontWeight: "600" },
  statusConfirmed: { color: "#16A34A", fontWeight: "700" },
  statusFailed: { color: "#DC2626", fontWeight: "700" },
});
