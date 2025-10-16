// HistoryTab.tsx (fast refresh, same stable behavior)
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

type TxItem = {
  hash: string;
  timestamp: string;
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
  _source?: "covalent" | "rpc" | "explorer" | "sticky";
};

const PRICE_IDS: Record<"ETH" | "BNB" | "MATIC", string> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  MATIC: "matic-network",
};

const maskAddr = (a: string) =>
  a?.startsWith("0x") && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
const fmt = (n: number, dp = 6) =>
  Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/, "").replace(/\.$/, "") : "—";

// ---- tuning knobs ----
const COVALENT_PAGE_SIZE = 100;
const RPC_LOOKBACK_BLOCKS = 12;
const INITIAL_RPC_LOOKBACK_BLOCKS = 24;       // ↓ from 60 → faster first open
const RX_CACHE_TTL_MS = 30 * 60 * 1000;
const RPC_POLL_SCHEDULE_MS = [0, 3000, 8000, 15000]; // tighter, still safe

// Timeouts
const MAX_FETCH_MS = 6500;  // hard limit for normal fetches
const SOFT_FETCH_MS = 3500; // shorter on pull-to-refresh/focus

const RX_CACHE_KEY = (addr: string) => `rxCache_v1:${addr.toLowerCase()}`;

// Promise timeout helper
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

export default function HistoryTab() {
  const address = useWalletStore((s) => s.address);

  const [displayUnit, setDisplayUnit] = useState<"TOKEN" | "USD" | string>("TOKEN");
  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();

  const chains: EvmChain[] = useMemo(() => CHAINS, []);
  const [items, setItems] = useState<TxItem[]>([]);
  const [firstLoading, setFirstLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [priceMap, setPriceMap] = useState<Record<"ETH" | "BNB" | "MATIC", { usd: number; local: number }>>({
    ETH: { usd: 0, local: 0 },
    BNB: { usd: 0, local: 0 },
    MATIC: { usd: 0, local: 0 },
  });

  const lastFetchAtRef = useRef<number>(0);
  const pollTimersRef = useRef<NodeJS.Timeout[]>([]);
  const cancelledRef = useRef<boolean>(false);

  // ---- prices (non-blocking) ----
  const loadPrices = useCallback(async () => {
    try {
      const ids = Array.from(new Set(chains.map((c) => PRICE_IDS[c.nativeSymbol])));
      if (!ids.length) return;
      const vs = (localCurrency || "usd").toLowerCase();
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,${vs}`;
      const data = await withTimeout(fetch(url).then((r) => r.json()), 3500).catch(() => null);
      if (!data) return;
      setPriceMap((prev) => {
        const next = { ...prev };
        (Object.keys(PRICE_IDS) as ("ETH" | "BNB" | "MATIC")[]).forEach((sym) => {
          const id = PRICE_IDS[sym];
          const d = (data as any)?.[id] || {};
          next[sym] = { usd: Number(d?.usd || prev[sym].usd || 0), local: Number(d?.[vs] || prev[sym].local || 0) };
        });
        return next;
      });
    } catch {}
  }, [chains, localCurrency]);

  // ---- helpers ----
  const toTxItems = (raw: any[], c: EvmChain, source: TxItem["_source"]): TxItem[] =>
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

  const mergeAndSort = (lists: TxItem[][]): TxItem[] => {
    const map = new Map<string, TxItem>();
    for (const list of lists) {
      for (const t of list) {
        if (!t.hash) continue;
        const key = t.hash.toLowerCase();
        const prev = map.get(key);
        if (!prev) map.set(key, t);
        else if (prev._source !== "covalent" && t._source === "covalent") map.set(key, t);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  // ---- sticky cache ----
  const loadRxCache = useCallback(async (owner: string) => {
    try {
      const raw = await AsyncStorage.getItem(RX_CACHE_KEY(owner));
      if (!raw) return [];
      const now = Date.now();
      const arr: TxItem[] = JSON.parse(raw);
      return arr.filter((t) => now - new Date(t.timestamp).getTime() < RX_CACHE_TTL_MS);
    } catch {
      return [];
    }
  }, []);

  const safeSaveRxCache = useCallback(
    async (owner: string, nextList: TxItem[]) => {
      try {
        if (!nextList || nextList.length === 0) return; // keep existing sticky
        const existing = await loadRxCache(owner);
        const now = Date.now();
        const map = new Map<string, TxItem>();
        for (const t of existing) {
          if (now - new Date(t.timestamp).getTime() < RX_CACHE_TTL_MS) {
            map.set((t.hash || "").toLowerCase(), { ...t, _source: "sticky" as const });
          }
        }
        for (const t of nextList) {
          map.set((t.hash || "").toLowerCase(), { ...t, _source: "sticky" as const });
        }
        const merged = Array.from(map.values()).slice(0, 100);
        await AsyncStorage.setItem(RX_CACHE_KEY(owner), JSON.stringify(merged));
      } catch {}
    },
    [loadRxCache]
  );

  // ---- Covalent (main) with timeout ----
  const fetchChainTx = async (c: EvmChain, owner: string, soft: boolean) => {
    const url =
      `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}` +
      `/transactions_v3/?no-logs=true&page-size=${COVALENT_PAGE_SIZE}`;
    try {
      const json = await withTimeout(covalentGet(url), soft ? SOFT_FETCH_MS : MAX_FETCH_MS);
      return toTxItems((json as any)?.data?.items ?? [], c, "covalent");
    } catch {
      return [];
    }
  };

  // ---- Explorer fallback (optional; timed) ----
  const ETHERSCAN_KEY = process.env.EXPO_PUBLIC_ETHERSCAN_API_KEY || "";
  const POLYGONSCAN_KEY = process.env.EXPO_PUBLIC_POLYGONSCAN_API_KEY || "";
  const BSCSCAN_KEY = process.env.EXPO_PUBLIC_BSCSCAN_API_KEY || "";

  function explorerApiBase(c: EvmChain): string | null {
    if (c.nativeSymbol === "ETH" && c.testnet) return "https://api-sepolia.etherscan.io/api";
    if (c.nativeSymbol === "MATIC" && c.testnet) return "https://api-amoy.polygonscan.com/api";
    if (c.nativeSymbol === "BNB" && c.testnet) return "https://api-testnet.bscscan.com/api";
    return null;
  }

  const fetchExplorerTxs = async (c: EvmChain, owner: string, soft: boolean): Promise<TxItem[]> => {
    const base = explorerApiBase(c);
    if (!base) return [];
    const apiKey =
      c.nativeSymbol === "ETH" ? ETHERSCAN_KEY :
      c.nativeSymbol === "MATIC" ? POLYGONSCAN_KEY :
      c.nativeSymbol === "BNB" ? BSCSCAN_KEY : "";
    if (!apiKey) return [];

    const url = `${base}?module=account&action=txlist&address=${owner}&sort=desc&page=1&offset=100&apikey=${apiKey}`;
    try {
      const json = await withTimeout(fetch(url).then((r) => r.json()), soft ? SOFT_FETCH_MS : MAX_FETCH_MS);
      const ok = String((json as any)?.status || "0") === "1";
      if (!ok) return [];
      return toTxItems((json as any).result || [], c, "explorer");
    } catch {
      return [];
    }
  };

  // ---- RPC supplement (unchanged behavior, but never blocks UI) ----
  async function rpcIncomingLookback(c: EvmChain, owner: string, lookbackBlocks: number): Promise<TxItem[]> {
    if (!c.testnet) return [];
    try {
      const rpc = c.rpcUrls?.[0];
      if (!rpc) return [];
      const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: c.chainId, name: c.name });
      const latest = await provider.getBlockNumber();
      const lower = Math.max(0, latest - Math.max(1, lookbackBlocks - 1));
      const out: TxItem[] = [];
      // small parallelism for speed
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
            gasUsed: null,
            gasPrice: null,
            feesPaidWei: null,
            successful: true,
            chainId: c.chainId,
            explorerBase: c.explorerBase,
            nativeSymbol: c.nativeSymbol,
            _source: "rpc",
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  function cancelPollers() {
    for (const t of pollTimersRef.current) clearTimeout(t);
    pollTimersRef.current = [];
    cancelledRef.current = true;
    setTimeout(() => (cancelledRef.current = false), 0);
  }

  function startRpcPoller(owner: string, baseList: TxItem[], stickyStart: TxItem[]) {
    cancelPollers();
    const schedule = RPC_POLL_SCHEDULE_MS.slice();
    const runOnce = async () => {
      if (cancelledRef.current) return;
      const results = await Promise.allSettled(chains.map((c) => rpcIncomingLookback(c, owner, RPC_LOOKBACK_BLOCKS)));
      const rpcLists: TxItem[][] = results.map((r) => (r.status === "fulfilled" ? r.value : []));
      const merged = mergeAndSort([baseList, ...rpcLists, stickyStart]);
      setItems((prev) => mergeAndSort([prev, merged]));
      const candidateSticky: TxItem[] = mergeAndSort([stickyStart, ...rpcLists]).map((t) => ({
        ...t,
        _source: "sticky" as const,
      }));
      await safeSaveRxCache(owner, candidateSticky);
    };
    schedule.forEach((ms) => {
      const t = setTimeout(runOnce, ms);
      pollTimersRef.current.push(t);
    });
  }

  const fetchHistory = useCallback(
    async (soft = false) => {
      if (!address) return;
      const now = Date.now();
      if (!soft && now - lastFetchAtRef.current < 8000) return; // throttle
      lastFetchAtRef.current = now;

      cancelPollers();
      if (soft) setIsRefreshing(true);

      const owner = address.toLowerCase();

      try {
        loadPrices(); // fire & forget

        // 0) Show sticky immediately → stops spinner fast if we have anything
        const sticky = await loadRxCache(owner);
        if (sticky.length > 0) {
          setItems((prev) => mergeAndSort([prev, sticky]));
          if (firstLoading) setFirstLoading(false);
          if (soft) setIsRefreshing(false); // end pull-to-refresh early
        }

        // 0.5) One-time wider RPC backfill only on hard load
        if (!soft) {
          const backfillResults = await Promise.allSettled(
            chains.map((c) => rpcIncomingLookback(c, owner, INITIAL_RPC_LOOKBACK_BLOCKS))
          );
          const backfillLists: TxItem[][] = backfillResults.map((r) => (r.status === "fulfilled" ? r.value : []));
          const backfillSticky: TxItem[] = mergeAndSort([sticky, ...backfillLists]).map((t) => ({
            ...t,
            _source: "sticky" as const,
          }));
          await safeSaveRxCache(owner, backfillSticky);
        }

        // 1) Covalent for all chains (use tight timeouts on soft)
        const cvResults = await Promise.allSettled(chains.map((c) => fetchChainTx(c, owner, !!soft)));
        const cvLists: TxItem[][] = cvResults.map((r) => (r.status === "fulfilled" ? r.value : []));

        // include local optimistic sender txs
        const localRaw = await AsyncStorage.getItem("localTxs");
        if (localRaw) {
          const locals: any[] = JSON.parse(localRaw);
          const localList: TxItem[] = locals.map((l) => ({
            hash: l.hash,
            timestamp: l.timestamp || new Date().toISOString(),
            from: (l.from || "").toLowerCase(),
            to: (l.to || "").toLowerCase(),
            valueWei: (l.value || "0").toString(),
            gasUsed: null,
            gasPrice: null,
            feesPaidWei: null,
            successful: true,
            chainId: l.chainId,
            explorerBase: chains.find((c) => c.chainId === l.chainId)?.explorerBase || "",
            nativeSymbol: (chains.find((c) => c.chainId === l.chainId)?.nativeSymbol || "ETH") as "ETH" | "BNB" | "MATIC",
            _source: "rpc",
          }));
          cvLists.push(localList);
        }

        // 2) Explorer fallback only on hard load (avoid soft-refresh delay)
        let exLists: TxItem[][] = [];
        if (!soft) {
          const exResults = await Promise.allSettled(chains.map((c) => fetchExplorerTxs(c, owner, false)));
          exLists = exResults.map((r) => (r.status === "fulfilled" ? r.value : []));
        }

        // Reload sticky quickly
        const stickyNow = await loadRxCache(owner);

        // 3) Merge and show
        const baseMerged = mergeAndSort([...cvLists, ...exLists, stickyNow]);
        if (baseMerged.length > 0) {
          setItems((prev) => mergeAndSort([prev, baseMerged])); // never-shrink
        }
        setFirstLoading(false);
        setIsRefreshing(false);

        // 4) Background RPC poller
        startRpcPoller(owner, baseMerged, stickyNow.map((t) => ({ ...t, _source: "sticky" as const })));
      } catch {
        setFirstLoading(false);
        setIsRefreshing(false);
      }
    },
    [address, chains, loadPrices, loadRxCache, safeSaveRxCache, firstLoading]
  );

  useEffect(() => {
    fetchHistory(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory(true);
      return () => cancelPollers();
    }, [fetchHistory])
  );

  const onRefresh = useCallback(async () => {
    await fetchHistory(true);
  }, [fetchHistory]);

  // ---- display helpers ----
  const priceFor = (sym: "ETH" | "BNB" | "MATIC") => priceMap[sym] || { usd: 0, local: 0 };
  const toDisplay = (nativeAmount: number, sym: "ETH" | "BNB" | "MATIC") => {
    if (displayUnit === "USD") return { text: (nativeAmount * priceFor(sym).usd).toFixed(2), unit: "USD" };
    if (displayUnit === localCurrency)
      return { text: (nativeAmount * priceFor(sym).local).toFixed(2), unit: localCurrency };
    return { text: fmt(nativeAmount, 6), unit: sym };
  };

  const openExplorer = (t: TxItem) => {
    if (!t.explorerBase || !t.hash) return;
    Linking.openURL(`${t.explorerBase}/tx/${t.hash}`);
  };

  const renderItem = ({ item }: { item: TxItem }) => {
    const me = (address || "").toLowerCase();
    const isSend = me && item.from === me;
    const valueNative = parseFloat(ethers.utils.formatEther(item.valueWei || "0"));
    const { text: amtText, unit } = toDisplay(valueNative, item.nativeSymbol);
    const successful = item.successful !== false;

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
            <Text style={styles.date}>{new Date(item.timestamp).toLocaleString()}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.chainTag}>{item.nativeSymbol}</Text>
          </View>

          <View style={styles.line} />

          <View style={styles.row}>
            <Text style={styles.label}>Amount:</Text>
            <Text style={styles.value}>
              {amtText} {unit}
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
          keyExtractor={(it, i) => (it.hash ? `${it.hash}:${it.chainId}` : String(i))}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={["#0A84FF"]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  heading: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#0A84FF",
    marginTop: 50,
    paddingHorizontal: 16,
    marginBottom: 8,
    textAlign: "center",
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
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E6F0FF",
  },
  rowTop: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  chainTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#E8F1FF",
    color: "#0A84FF",
    fontWeight: "700",
  },
  line: { height: 1, backgroundColor: "#E6EAF2", marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", marginTop: 6 },
  label: { width: 86, fontWeight: "bold", color: "#000" },
  value: { flex: 1, color: "#111" },
  valueAddr: {
    flex: 1,
    color: "#333",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: undefined }),
  },
  date: { color: "#333", fontWeight: "600" },
  statusConfirmed: { color: "#16A34A", fontWeight: "700" },
  statusFailed: { color: "#DC2626", fontWeight: "700" },
});
