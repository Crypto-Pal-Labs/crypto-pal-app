// src/screens/Wallet.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, FlatList, ActivityIndicator, TextInput, StyleSheet, Image,
  RefreshControl, TouchableOpacity, Alert,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackActions } from "@react-navigation/native";
import * as ethers from "ethers";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { Picker } from "@react-native-picker/picker";

// hooks + utils
import { useAssets, type BalanceItem } from "../hooks/useAssets";
import { useChain } from "../hooks/useChain";
import { useWalletStore } from "../store/useWalletStore";
import { getWalletAddress, clearWallet } from "../utils/wallet";

// multi-chain helpers
import { CHAINS, EvmChain } from "../config/chainRegistry";
import { isCovalentSupported } from "../config/capabilities";
import { covalentGet } from "../lib/covalent";

// ---------- Types used locally ----------
type CGMarket = {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_24h?: number | null;
};

type PriceEntry = { usd: number; local: number };

// Safe em-dash to avoid garbled Android glyph
const DASH = "\u2014";

// ---------- Small helpers ----------
const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

// polite queued fetcher to avoid CG rate limits
let q = Promise.resolve();
let last = 0;
const GAP = 250;
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
function queuedJSON(url: string, retries = 2): Promise<any | null> {
  q = q.then(async () => {
    const wait = Math.max(0, last + GAP - Date.now());
    if (wait) await delay(wait);
    last = Date.now();
    let n = 0;
    while (n <= retries) {
      try {
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (r.ok) return r.json();
      } catch {}
      await delay(300 * Math.pow(1.6, n));
      n++;
    }
    return null;
  });
  return q;
}

// ---------- Simple price cache (CG first) ----------
const PRICE_IDS: Record<string, string> = {
  ETH: "ethereum", WETH: "ethereum",
  BNB: "binancecoin", WBNB: "binancecoin",
  MATIC: "matic-network", WMATIC: "matic-network",
  USDT: "tether", USDC: "usd-coin", DAI: "dai",
};

async function loadSymbolPrices(symbols: string[], localCurrency: string) {
  const ids = Array.from(new Set(symbols.map((s) => PRICE_IDS[(s || "").toUpperCase()] || "").filter(Boolean)));
  if (!ids.length) return {} as Record<string, PriceEntry>;

  const vs = (localCurrency || "USD").toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,${vs}`;

  let data: any = {};
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) data = await res.json();
  } catch {}

  const out: Record<string, PriceEntry> = {};
  Object.keys(PRICE_IDS).forEach((sym) => {
    const id = PRICE_IDS[sym];
    const d = (data || {})[id] || {};
    out[sym] = { usd: Number(d.usd || 0), local: Number(d[vs] || 0) };
  });
  return out;
}

// ---------- Binance helpers (for fallback) ----------
const binancePair = (sym: string) =>
  ({ ETH: "ETHUSDT", BNB: "BNBUSDT", MATIC: "MATICUSDT" } as Record<string, string>)[
    (sym || "").toUpperCase()
  ] || "";

async function loadBinancePct(sym: string): Promise<number | null> {
  const pair = binancePair(sym);
  if (!pair) return null;
  try {
    const r = await queuedJSON(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`);
    const p = Number(r?.priceChangePercent);
    return Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

async function loadBinanceUsd(sym: string): Promise<number | null> {
  const pair = binancePair(sym);
  if (!pair) return null;
  try {
    const r = await queuedJSON(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
    const px = Number(r?.price);
    return Number.isFinite(px) ? px : null;
  } catch {
    return null;
  }
}

/**
 * Strong price loader: CoinGecko first, then fill any zero/missing USD with Binance.
 * For non-USD local currencies we leave `local` as-is (USD is default display).
 */
async function loadSymbolPricesStrong(symbols: string[], localCurrency: string) {
  const cg = await loadSymbolPrices(symbols, localCurrency);
  const map: Record<string, PriceEntry> = { ...cg };
  for (const s of symbols) {
    const key = (s || "").toUpperCase();
    const hasUsd = map[key]?.usd && map[key].usd > 0;
    if (!hasUsd) {
      const usd = await loadBinanceUsd(key);
      if (usd && usd > 0) {
        console.log("[WALLET_PRICE] binance usd fallback:", key, usd);
        map[key] = {
          usd,
          local: localCurrency === "USD" ? usd : (map[key]?.local || 0),
        };
      }
    }
  }
  return map;
}

const Wallet: React.FC = () => {
  const navigation = useNavigation();
  const isMounted = useRef(true);

  const setAddress = useWalletStore((state: any) => state.setAddress);

  const { chain, chains, activeChainId, setActiveChainId } = useChain();
  const { balances, nfts, loading, error, refresh, startTimers } = useAssets();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"crypto" | "nfts">("crypto");
  const [refreshing, setRefreshing] = useState(false);

  // currency handling
  const locale = Localization.getLocales()[0] || { currencyCode: "USD" as const };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();
  const currencyOptions: string[] = Array.from(new Set(["USD", localCurrency]));
  const [currency, setCurrency] = useState<string>("USD");

  // for ETH pending-delta visual (existing pattern)
  const [localBalanceDelta, setLocalBalanceDelta] = useState(0);

  // 24h % map for each symbol (nice-to-have)
  const [cgMap, setCgMap] = useState<Record<string, CGMarket>>({});
  const [pctMap, setPctMap] = useState<Record<string, number>>({});
  const resolving = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const rows = await queuedJSON(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=ethereum,binancecoin,matic-network,usd-coin,tether,dai&sparkline=false&price_change_percentage=24h"
        );
        if (!Array.isArray(rows)) return;
        const next: Record<string, CGMarket> = {};
        rows.forEach((r: any) => {
          const sym = String(r.symbol || "").toLowerCase();
          next[sym] = {
            id: r.id, symbol: r.symbol, name: r.name,
            image: r.image ?? null,
            current_price: r.current_price ?? null,
            price_change_percentage_24h_in_currency: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h ?? null,
            price_change_percentage_24h: r.price_change_percentage_24h ?? null,
          };
          next[`${sym}|${(r.name || "").toLowerCase()}`] = next[sym];
        });
        if (isMounted.current) setCgMap(next);
      } catch {}
    })();
  }, []);

  const ensurePctFor = async (symbol: string, name?: string) => {
    const key = (symbol || "").toLowerCase();
    if (!key || resolving.current.has(key) || cgMap[key]) return;
    resolving.current.add(key);
    try {
      const search = await queuedJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
      const match =
        search?.coins?.find((c: any) => c.symbol?.toLowerCase() === key) ||
        search?.coins?.[0];
      if (!match?.id) return;

      const rows = await queuedJSON(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(match.id)}&sparkline=false&price_change_percentage=24h`
      );
      if (Array.isArray(rows) && rows[0]) {
        const r = rows[0];
        const entry: CGMarket = {
          id: r.id, symbol: r.symbol, name: r.name, image: r.image ?? null,
          current_price: r.current_price ?? null,
          price_change_percentage_24h_in_currency: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h ?? null,
          price_change_percentage_24h: r.price_change_percentage_24h ?? null,
        };
        if (isMounted.current) {
          setCgMap((prev) => ({ ...prev, [key]: entry, [`${key}|${(name || r.name || "").toLowerCase()}`]: entry }));
        }
      }
    } finally {
      resolving.current.delete(key);
    }
  };

  // ===== fill pctMap via Binance when CG percent missing =====
  useEffect(() => {
    (async () => {
      for (const b of balances) {
        const sym = (b.contract_ticker_symbol || "").toUpperCase();
        if (!sym) continue;
        const key = sym.toLowerCase();
        const cg = cgMap[key] || cgMap[`${key}|${(b.contract_name || "").toLowerCase()}`];
        const hasCgPct =
          !!(cg && (cg.price_change_percentage_24h_in_currency != null || cg.price_change_percentage_24h != null));
        if (!hasCgPct && pctMap[key] == null) {
          const p = await loadBinancePct(sym);
          if (p != null && isMounted.current) setPctMap(prev => ({ ...prev, [key]: p }));
        }
      }
    })();
  }, [balances, cgMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep address in store (existing flow)
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadAddress = async () => {
    if (!isMounted.current) return;
    setLoadError(null);
    try {
      const currentAddress = await getWalletAddress();
      if (currentAddress) {
        setAddress(currentAddress);
      } else {
        throw new Error("No address returned from secure store.");
      }
    } catch (err: any) {
      if (isMounted.current) setLoadError(err?.message || "Failed to load wallet address.");
    }
  };

  const handleLogout = async () => {
    if (!isMounted.current) return;
    try {
      await clearWallet();
      navigation.dispatch(StackActions.replace("Welcome"));
    } catch (error) {
      if (isMounted.current) {
        console.error("Logout error:", error);
        Alert.alert("Error", "Failed to logout.");
      }
    }
  };

  const loadLocalDelta = async () => {
    try {
      const storedDelta = await AsyncStorage.getItem("localBalanceDelta");
      if (isMounted.current) setLocalBalanceDelta(storedDelta ? parseFloat(storedDelta) : 0);
    } catch (e) {
      console.error("Local delta fetch error:", e);
    }
  };

  // --- Price cache in the screen (CG + Binance fallback) for ACTIVE CHAIN display rows ---
  const [priceCache, setPriceCache] = useState<Record<string, PriceEntry>>({});
  useEffect(() => {
    const syms: string[] = Array.from(
      new Set(
        balances
          .map((b: BalanceItem) => ((b.contract_ticker_symbol || "") as string).toUpperCase())
          .filter((s: string) => !!s)
      )
    );
    if (!syms.length) return;
    loadSymbolPricesStrong(syms, localCurrency)
      .then((map) => isMounted.current && setPriceCache(map))
      .catch(() => {});
  }, [balances, localCurrency]);

  // ===== NEW: Global (all-chains) total in header =====
  type MiniBal = { symbol: string; decimals: number; balance: string };

  const [globalTotals, setGlobalTotals] = useState<{ usd: number; local: number }>({ usd: 0, local: 0 });

  const fetchAllChainBalances = useCallback(async () => {
    const owner = await getWalletAddress();
    if (!owner) return;

    const mini: MiniBal[] = [];

    // Fetch per-chain balances
    await Promise.allSettled(
      CHAINS.map(async (c: EvmChain) => {
        try {
          if (c.covalentSupported !== false && isCovalentSupported("balances", c.covalentChainId)) {
            // Covalent balances_v2
            const url = `https://api.covalenthq.com/v1/${c.covalentChainId}/address/${owner}/balances_v2/?quote-currency=USD&format=JSON&nft=false&no-nft-fetch=true&no-spam=true`;
            const json = await covalentGet(url);
            const items = (json?.data?.items || []) as any[];
            for (const it of items) {
              const sym = String(it.contract_ticker_symbol || "").toUpperCase();
              const dec = Number(it.contract_decimals ?? 18);
              const bal = String(it.balance || "0");
              if (!sym) continue;
              if (bal === "0" || bal === "0x0") continue;
              mini.push({ symbol: sym, decimals: Number.isFinite(dec) ? dec : 18, balance: bal });
            }
          } else {
            // RPC fallback — native only
            const rpc = c.rpcUrls?.[0];
            if (!rpc) return;
            const provider = new ethers.providers.StaticJsonRpcProvider(rpc, { chainId: c.chainId, name: c.name });
            const wei = await provider.getBalance(owner);
            if (wei && !wei.isZero()) {
              mini.push({ symbol: c.nativeSymbol, decimals: 18, balance: wei.toString() });
            }
          }
        } catch {}
      })
    );

    // Load prices for ALL discovered symbols (CG first, Binance USD fallback)
    const symbols = Array.from(new Set(mini.map((m) => m.symbol)));
    const pxMap = await loadSymbolPricesStrong(symbols, localCurrency);

    // Sum totals
    let totalUsd = 0;
    let totalLoc = 0;
    for (const m of mini) {
      const qty = Number(ethers.utils.formatUnits(m.balance, m.decimals));
      const pxU = pxMap[m.symbol]?.usd || 0;
      const pxL = pxMap[m.symbol]?.local || 0;
      totalUsd += qty * pxU;
      totalLoc += qty * pxL;
    }

    if (isMounted.current) {
      setGlobalTotals({
        usd: Number.isFinite(totalUsd) ? totalUsd : 0,
        local: Number.isFinite(totalLoc) ? totalLoc : 0,
      });
    }
  }, [localCurrency]);

  useEffect(() => {
    fetchAllChainBalances();
  }, [fetchAllChainBalances]);

  // compute header total with fallback: now use GLOBAL totals
  const totalValue = (currency === "USD" ? globalTotals.usd : globalTotals.local).toFixed(2);

  const onRefresh = async () => {
    if (!isMounted.current) return;
    setRefreshing(true);
    refresh();               // active chain hook
    await fetchAllChainBalances(); // all-chains header
    await AsyncStorage.removeItem("localBalanceDelta");
    await loadLocalDelta();
    setRefreshing(false);
  };

  // on tab focus: refresh once; start 60s timer from the hook (kept)
  useFocusEffect(
    React.useCallback(() => {
      const stop = startTimers?.(); // set up 60s + invalidate watcher for active chain UI
      onRefresh();
      return () => { if (typeof stop === "function") stop(); };
    }, [activeChainId, startTimers])
  );

  // filter
  const filteredBalances: BalanceItem[] = balances.filter(
    (item: BalanceItem) =>
      Number(ethers.utils.formatUnits(item.balance, item.contract_decimals ?? 18)) > 0 &&
      (item.contract_ticker_symbol || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredNfts = nfts.filter(
    (item: any) =>
      (item.contract_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item as any).token_id?.includes?.(searchQuery)
  );

  const resolveName = (symbol: string, raw?: string) => {
    if (raw && raw.trim().length) return titleCase(raw.trim());
    if (symbol?.toUpperCase() === "ETH") return "Ethereum";
    return symbol;
  };

  const renderBalanceItem = ({ item }: { item: BalanceItem }) => {
    const dec = item.contract_decimals ?? 18;

    // amount (ETH row keeps local delta)
    const symU = (item.contract_ticker_symbol || "").toUpperCase();
    let displayQty =
      symU === "ETH"
        ? Number(ethers.utils.formatUnits(item.balance, 18)) + localBalanceDelta
        : Number(ethers.utils.formatUnits(item.balance, dec));

    const balanceLine = `${displayQty.toFixed(8)} ${item.contract_ticker_symbol || DASH}`;

    const symbol = item.contract_ticker_symbol || DASH;
    const name = resolveName(symbol, item.contract_name);
    const title = `${symbol}  |  ${name}`;

    const logo = item.logo_url || "";

    // 24h % (CoinGecko -> Binance fallback)
    const symKey = (symbol || "").toLowerCase();
    const cg = cgMap[symKey] || cgMap[`${symKey}|${(item.contract_name || "").toLowerCase()}`];
    if (!cg) ensurePctFor(symbol, item.contract_name);
    const pct24 =
      (cg?.price_change_percentage_24h_in_currency ?? cg?.price_change_percentage_24h) ??
      pctMap[symKey] ??
      null;
    const pctStyle = pct24 == null ? styles.pctNeutral : pct24 >= 0 ? styles.up : styles.down;

    // fiat with fallback (CG -> Binance USD)
    const fallbackUsd = (priceCache[symU]?.usd || 0) * displayQty;
    const fallbackLoc = (priceCache[symU]?.local || 0) * displayQty;
    let fiatText = DASH;
    if (currency === "USD") {
      const val = item.quoteUsd && item.quoteUsd > 0 ? item.quoteUsd : fallbackUsd;
      fiatText = Number.isFinite(val) ? `$${val.toFixed(2)}` : DASH;
    } else {
      const val = item.quoteLocal && item.quoteLocal > 0 ? item.quoteLocal : fallbackLoc;
      fiatText = Number.isFinite(val) ? `${val.toFixed(2)} ${currency}` : `${DASH} ${currency}`;
    }

    return (
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImgReal} resizeMode="contain" />
          ) : (
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>{(symbol || "?").slice(0, 1)}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardLeft}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>{balanceLine}</Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.cardPriceRight} numberOfLines={1}>{fiatText}</Text>
          <Text style={[styles.cardPctRight, pctStyle]} numberOfLines={1}>
            {pct24 == null || Number.isNaN(pct24)
              ? DASH
              : `${pct24 >= 0 ? "+" : ""}${pct24.toFixed(2)}%`}
          </Text>
        </View>
      </View>
    );
  };

  const renderNFTItem = ({ item }: { item: any }) => {
    const logo = item.logo_url || null;
    const title = `${resolveName("NFT", item.contract_name)}  |  Token`;
    return (
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImgReal} resizeMode="contain" />
          ) : (
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>N</Text>
            </View>
          )}
        </View>

        <View style={styles.cardLeft}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>Token ID: {item.token_id}</Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.cardPriceRight}>{DASH}</Text>
          <Text style={[styles.cardPctRight, styles.pctNeutral]}>{DASH}</Text>
        </View>
      </View>
    );
  };

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity onPress={loadAddress}><Text style={styles.retry}>Retry</Text></TouchableOpacity>
      </View>
    );
  }

  const networkLabel = chain?.shortName || chain?.name || String(activeChainId);
  const currencyLabel = currency;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Wallet Home</Text>
      <Text style={styles.totalLabel}>Total Balance:</Text>
      <Text style={styles.totalValue}>${totalValue} {currency}</Text>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your assets."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.segWrap}>
        <View style={styles.segRow}>
          <TouchableOpacity
            style={viewMode === "crypto" ? styles.segChipActive : styles.segChip}
            onPress={() => setViewMode("crypto")}
          >
            <Text style={viewMode === "crypto" ? styles.segChipTxtActive : styles.segChipTxt}>CRYPTOS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={viewMode === "nfts" ? styles.segChipActive : styles.segChip}
            onPress={() => setViewMode("nfts")}
          >
            <Text style={viewMode === "nfts" ? styles.segChipTxtActive : styles.segChipTxt}>NFTs</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.pickerRow}>
        <View style={styles.pickerCol}>
          <Text style={styles.pickerLabel}>Network</Text>
          <View style={styles.pickerBox}>
            <View style={styles.pickerDisplayRow}>
              <Text style={styles.pickerValue} numberOfLines={1}>{networkLabel}</Text>
              <Ionicons name="chevron-down" size={16} color="#0A84FF" />
            </View>
            <Picker
              selectedValue={activeChainId}
              onValueChange={(val) => setActiveChainId(Number(val))}
              style={styles.pickerOverlay}
              mode="dropdown"
            >
              {chains.map((c: any) => (
                <Picker.Item key={c.chainId} label={c.shortName || c.name} value={c.chainId} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.pickerCol}>
          <Text style={styles.pickerLabel}>Currency</Text>
          <View style={styles.pickerBox}>
            <View style={styles.pickerDisplayRow}>
              <Text style={styles.pickerValue} numberOfLines={1}>{currencyLabel}</Text>
              <Ionicons name="chevron-down" size={16} color="#0A84FF" />
            </View>
            <Picker
              selectedValue={currency}
              onValueChange={(val) => setCurrency(String(val))}
              style={styles.pickerOverlay}
              mode="dropdown"
            >
              {currencyOptions.map((opt: string) => (
                <Picker.Item key={opt} label={opt} value={opt} />
              ))}
            </Picker>
          </View>
        </View>
      </View>

      {error && (
        <Text style={styles.errorText}>
          {error}{" "}
          <TouchableOpacity onPress={onRefresh}><Text style={styles.retry}>Retry</Text></TouchableOpacity>
        </Text>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />
      ) : (
        <>
          {viewMode === "crypto" ? (
            <FlatList<BalanceItem>
              style={styles.assetList}
              data={filteredBalances}
              renderItem={renderBalanceItem}
              keyExtractor={(it: BalanceItem, idx: number) =>
                `${it.contract_address || "native"}:${it.contract_ticker_symbol}:${idx}`
              }
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.empty}>No tokens to display yet</Text>
                  <TouchableOpacity onPress={onRefresh}>
                    <Ionicons name="refresh-circle" size={50} color="#0A84FF" />
                  </TouchableOpacity>
                </View>
              }
              contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            />
          ) : (
            <FlatList<any>
              style={styles.assetList}
              data={filteredNfts}
              renderItem={renderNFTItem}
              keyExtractor={(it: any, idx: number) => `${it.contract_address || "nft"}:${it.token_id || idx}`}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={<Text style={styles.empty}>No NFTs yet</Text>}
              contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            />
          )}
        </>
      )}

      <View style={styles.logoutContainer}>
        <TouchableOpacity style={styles.btnLogout} onPress={handleLogout} activeOpacity={0.9}>
          <Text style={styles.btnLogoutTxt}>LOGOUT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  heading: { fontSize: 36, fontWeight: "bold", color: "#0A84FF", textAlign: "center", marginTop: 20 },
  totalLabel: { fontSize: 20, color: "#000", textAlign: "center", marginBottom: 5 },
  totalValue: { fontSize: 27, fontWeight: "bold", color: "#0A84FF", textAlign: "center", marginBottom: 5 },

  searchContainer: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#ddd", borderRadius: 20,
    paddingHorizontal: 8, marginHorizontal: 12, marginBottom: 8, backgroundColor: "#fff"
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 8 },

  segWrap: { paddingHorizontal: 12, marginBottom: 8 },
  segRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  segChip: {
    paddingVertical: 10, paddingHorizontal: 20, marginHorizontal: 6,
    borderRadius: 999, minWidth: 110, alignItems: "center", backgroundColor: "#e6ecff"
  },
  segChipActive: {
    paddingVertical: 10, paddingHorizontal: 20, marginHorizontal: 6,
    borderRadius: 999, minWidth: 110, alignItems: "center", backgroundColor: "#0A84FF"
  },
  segChipTxt: { color: "#0A84FF", fontWeight: "800", fontSize: 15 },
  segChipTxtActive: { color: "#fff", fontWeight: "900", fontSize: 15 },

  pickerRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, marginBottom: 8, gap: 12 },
  pickerCol: { flex: 1 },
  pickerLabel: { fontSize: 12, fontWeight: "700", color: "#333", marginBottom: 6 },
  pickerBox: { borderWidth: 1, borderColor: "#cfe0ff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#f7faff" },
  pickerDisplayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerValue: { color: "#0A84FF", fontWeight: "800" },
  pickerOverlay: { position: "absolute", opacity: 0, top: 0, right: 0, left: 0, bottom: 0 },

  assetList: { flex: 1 },

  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F5F9FF",
    borderRadius: 12, padding: 12, marginHorizontal: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#E6F0FF",
  },
  logoWrap: { width: 46, height: 46, borderRadius: 10, overflow: "hidden", marginRight: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  logoImgReal: { width: 44, height: 44 },
  logoBox: { width: 46, height: 46, borderRadius: 10, backgroundColor: "#E6EAF2", alignItems: "center", justifyContent: "center" },
  logoLetter: { fontSize: 16, fontWeight: "900", color: "#4B5B76" },

  cardLeft: { flex: 1, paddingRight: 10 },
  cardTitle: { fontWeight: "800", color: "#000" },
  cardSub: { color: "#333", marginTop: 3 },

  cardRight: { alignItems: "flex-end" },
  cardPriceRight: { fontWeight: "800", color: "#0A84FF" },
  cardPctRight: { fontWeight: "900", marginTop: 3 },
  up: { color: "#16A34A" }, down: { color: "#DC2626" }, pctNeutral: { color: "#6B7280" },

  empty: { color: "#888" },

  errorText: { color: "#B91C1C", textAlign: "center", marginVertical: 8 },
  retry: { color: "#0A84FF", fontWeight: "800" },

  logoutContainer: { padding: 16, alignItems: "center" },
  btnLogout: { backgroundColor: "#0A84FF", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 },
  btnLogoutTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },
});

export default Wallet;
