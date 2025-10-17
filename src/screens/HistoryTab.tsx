// src/screens/HistoryTab.tsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, ActivityIndicator, FlatList, StyleSheet, Linking,
  TouchableOpacity, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ethers from "ethers";

import { useWalletStore } from "../store/useWalletStore";
import { CHAINS, EvmChain } from "../config/chainRegistry";
import { covalentGet } from "../lib/covalent";

const fmt = (n: number, dp = 6) =>
  Number.isFinite(n) ? Number(n).toFixed(dp).replace(/0+$/, "").replace(/\.$/, "") : "—";
const maskAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

type TxItem = {
  hash: string;
  timestamp: string;              // ISO
  from?: string;
  to?: string;
  valueWei?: string;              // native
  tokenSymbol?: string;           // if token
  tokenAmount?: string;           // decimal string
  tokenContract?: string;         // address
  chainId: number;
  isToken?: boolean;
  direction?: "IN" | "OUT";
  status?: "Pending" | "Confirmed" | "Failed";
};

const MAX_MERGED = 500;
const SOFT_FETCH_MS = 3500;

// 🔁 bump if you want to clear old short-TTL caches once:
const RX_CACHE_KEY = (addr: string) => `rxCache_v2:${addr.toLowerCase()}`;

// ✅ Keep receiver “sticky” items long-term so they don’t drop between polls
const RX_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { onTimeout ? resolve(onTimeout()) : reject(new Error("timeout")); }, ms);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); onTimeout ? resolve(onTimeout()) : reject(e); });
  });
}

function uniqKey(t: TxItem): string {
  const assetKey = t.isToken ? (t.tokenContract?.toLowerCase() || "token") : "native";
  return `${t.chainId}:${assetKey}:${(t.hash || "").toLowerCase()}`;
}

function mergeAndSort(groups: TxItem[][]): TxItem[] {
  const map = new Map<string, TxItem>();
  for (const g of groups) for (const t of g) map.set(uniqKey(t), t);
  const arr = Array.from(map.values());
  arr.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return arr;
}

async function fetchChainTx(chain: EvmChain, owner: string, soft = false): Promise<TxItem[]> {
  const base = `https://api.covalenthq.com/v1/${chain.covalentChainId}/address/${owner}/transactions_v3/`;
  try {
    const json = await (soft ? withTimeout(covalentGet(base), SOFT_FETCH_MS, () => ({ data: { items: [] } })) : covalentGet(base));
    const items = json?.data?.items || [];
    const out: TxItem[] = items.map((it: any) => ({
      hash: it.tx_hash,
      timestamp: it.block_signed_at || new Date().toISOString(),
      from: (it.from_address || "").toLowerCase(),
      to: (it.to_address || "").toLowerCase(),
      valueWei: it.value,
      chainId: chain.chainId,
      isToken: false,
      direction: ((it.to_address || "").toLowerCase() === owner) ? "IN" : "OUT",
      status: it.successful ? "Confirmed" : "Failed",
    }));
    return out;
  } catch { return []; }
}

async function fetchTokenTransfers(chain: EvmChain, owner: string, soft = false): Promise<TxItem[]> {
  const url = `https://api.covalenthq.com/v1/${chain.covalentChainId}/address/${owner}/transfers_v2/?no-spam=true`;
  try {
    const json = await (soft ? withTimeout(covalentGet(url), SOFT_FETCH_MS, () => ({ data: { items: [] } })) : covalentGet(url));
    const lists = json?.data?.items || [];
    const out: TxItem[] = [];
    for (const row of lists) {
      const transfers = row.transfers || [];
      for (const t of transfers) {
        out.push({
          hash: t.tx_hash,
          timestamp: t.block_signed_at || new Date().toISOString(),
          from: (t.from_address || "").toLowerCase(),
          to: (t.to_address || "").toLowerCase(),
          chainId: chain.chainId,
          isToken: true,
          tokenSymbol: row.contract_ticker_symbol,
          tokenContract: (row.contract_address || "").toLowerCase(),
          tokenAmount: t.delta, // string, decimal-formatted by covalent
          direction: ((t.to_address || "").toLowerCase() === owner) ? "IN" : "OUT",
          status: t.successful ? "Confirmed" : "Failed",
        });
      }
    }
    return out;
  } catch { return []; }
}

async function safeLoadRxCache(addr: string): Promise<TxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(RX_CACHE_KEY(addr));
    if (!raw) return [];
    const { ts, items } = JSON.parse(raw);
    if (Date.now() - ts > RX_CACHE_TTL_MS) return [];
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

async function safeSaveRxCache(addr: string, items: TxItem[]) {
  try {
    const existing = await safeLoadRxCache(addr);
    const merged = mergeAndSort([existing, items]).slice(0, MAX_MERGED);
    await AsyncStorage.setItem(RX_CACHE_KEY(addr), JSON.stringify({ ts: Date.now(), items: merged }));
  } catch {}
}

export default function HistoryTab() {
  const { address } = useWalletStore();
  const owner = (address || "").toLowerCase();

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<TxItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Prime list from sticky cache immediately (keeps UI intact)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const sticky = await safeLoadRxCache(owner);
      if (mounted && sticky.length) setList(sticky);
    })();
    return () => { mounted = false; };
  }, [owner]);

  const chains = useMemo(() => CHAINS.filter(c => !!c.covalentChainId), []);

  const fetchHistory = useCallback(async (softMode = false) => {
    if (!owner) return;
    if (!softMode) setLoading(true);

    try {
      // 1) Covalent (native + tokens)
      const cvTx = await Promise.allSettled(chains.map((c) => fetchChainTx(c, owner, !!softMode)));
      const cvTxLists: TxItem[][] = cvTx.map((r) => (r.status === "fulfilled" ? r.value : []));
      const cvTok = await Promise.allSettled(chains.map((c) => fetchTokenTransfers(c, owner, !!softMode)));
      const cvTokLists: TxItem[][] = cvTok.map((r) => (r.status === "fulfilled" ? r.value : []));

      // ✅ 2) Persist inbound Covalent rows so receiver history remains even if APIs lag later
      try {
        const covInboundNative = cvTxLists.flat().filter((t) => (t.to || "").toLowerCase() === owner);
        const covInboundTokens = cvTokLists.flat().filter((t) => t.isToken && t.direction === "IN");
        if (covInboundNative.length || covInboundTokens.length) {
          await safeSaveRxCache(owner, mergeAndSort([covInboundNative, covInboundTokens]));
        }
      } catch {}

      // 3) Merge covalent all
      const covAll = mergeAndSort([cvTxLists.flat(), cvTokLists.flat()]);

      // 4) localTxs (sender optimistic)
      let localTxs: TxItem[] = [];
      try {
        const raw = (await AsyncStorage.getItem("localTxs")) || "[]";
        const arr = JSON.parse(raw) as any[];
        localTxs = (arr || []).map((t) => ({
          hash: t.hash,
          timestamp: t.timestamp,
          from: (t.from || "").toLowerCase(),
          to: (t.to || "").toLowerCase(),
          valueWei: t.value,
          chainId: t.chainId,
          isToken: false,
          direction: owner === (t.from || "").toLowerCase() ? "OUT" : "IN",
          status: "Confirmed",
        }));
      } catch {}

      const merged = mergeAndSort([covAll, localTxs]).slice(0, MAX_MERGED);
      setList(merged);

      // 5) Save sticky so it persists between app launches (covers sender & receiver)
      await safeSaveRxCache(owner, merged);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chains, owner]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      fetchHistory(true);
      const id = setInterval(() => mounted && fetchHistory(true), 8000);
      return () => { mounted = false; clearInterval(id); };
    }, [fetchHistory])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory(false);
  }, [fetchHistory]);

  const renderItem = ({ item }: { item: TxItem }) => {
    const isOut = item.direction === "OUT";
    const symbol = item.isToken ? (item.tokenSymbol || "TOKEN") : "ETH";
    const amount = item.isToken ? item.tokenAmount : (item.valueWei ? ethers.utils.formatEther(item.valueWei) : "0");
    const color = isOut ? "#b91c1c" : "#059669";
    const label = isOut ? "To" : "From";
    const who = isOut ? maskAddr(item.to) : maskAddr(item.from);
    const status = item.status || "Confirmed";

    return (
      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Ionicons name={isOut ? "arrow-up" : "arrow-down"} size={18} color={color} />
          <Text style={{ marginLeft: 8, fontWeight: "600" }}>{new Date(item.timestamp).toLocaleString()}</Text>
          <View style={{ marginLeft: "auto", backgroundColor: "#eef2ff", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 }}>
            <Text style={{ color: "#2563eb", fontWeight: "700" }}>{symbol}</Text>
          </View>
        </View>

        <Text style={styles.row}><Text style={styles.key}>Amount:</Text>  {fmt(parseFloat(amount || "0"), 6)} {symbol}</Text>
        <Text style={styles.row}><Text style={styles.key}>Status:</Text>  <Text style={{ color: "#059669", fontWeight: "700" }}>{status}</Text></Text>
        <Text style={styles.row}><Text style={styles.key}>{label}:</Text> {who}</Text>

        <TouchableOpacity onPress={() => {
          const base = CHAINS.find(c => c.chainId === item.chainId)?.explorerBase || "";
          if (base) Linking.openURL(`${base}/tx/${item.hash}`);
        }}>
          <Text style={{ color: "#2563eb", marginTop: 6 }}>View on Explorer</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingHorizontal: 16, paddingTop: 24 }}>
      <Text style={{ fontSize: 32, fontWeight: "800", color: "#0A84FF", marginBottom: 12 }}>Transaction History</Text>

      {loading && list.length === 0 ? (
        <View style={{ marginTop: 40 }}>
          <ActivityIndicator />
          <Text style={{ textAlign: "center", marginTop: 8 }}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => uniqKey(item)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A84FF" />
          }
          ListEmptyComponent={
            <Text style={{ textAlign: "center", marginTop: 40, color: "#6b7280" }}>
              No transactions yet.
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12,
    padding: 12, marginBottom: 10, backgroundColor: "#fff",
  },
  row: { marginTop: 4, color: "#111" },
  key: { fontWeight: "700", color: "#111" },
});
