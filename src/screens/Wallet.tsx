// src/screens/Wallet.tsx
import React, { useState, useEffect, useRef } from "react";
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

// ✅ Correct relative paths from src/screens/*
import { useAssets, type BalanceItem } from "../hooks/useAssets";
import { useChain } from "../hooks/useChain";
import { useWalletStore } from "../store/useWalletStore";
import { getWalletAddress, clearWallet } from "../utils/wallet";

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

// ---------- Simple price cache (fallback for testnets) ----------
const PRICE_IDS: Record<string, string> = {
  ETH: "ethereum", WETH: "ethereum",
  BNB: "binancecoin", WBNB: "binancecoin",
  MATIC: "matic-network", WMATIC: "matic-network",
  USDT: "tether", USDC: "usd-coin", DAI: "dai",
};

async function loadSymbolPrices(symbols: string[], localCurrency: string) {
  const ids = Array.from(
    new Set(
      symbols.map((s) => PRICE_IDS[(s || "").toUpperCase()] || "").filter(Boolean)
    )
  );
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

const Wallet: React.FC = () => {
  const navigation = useNavigation();
  const isMounted = useRef(true);

  const setAddress = useWalletStore((state: any) => state.setAddress);

  const { chain, chains, activeChainId, setActiveChainId } = useChain();
  const { balances, nfts, loading, error, refresh } = useAssets();

  // Set default to All Networks on first load only
  useEffect(() => {
    const initializeChain = async () => {
      try {
        // Clear storage once to force default value
        await AsyncStorage.removeItem('cp-active-chain');
        console.log('Wallet: Cleared storage, setting default to All Networks (0)');
        setActiveChainId(0);
      } catch (error) {
        console.log('Wallet: Error clearing storage:', error);
        setActiveChainId(0);
      }
    };
    initializeChain();
  }, []); // Only run once on mount

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

  // --- Fallback price cache inside the screen (guarantees non-zero fiat for Amoy) ---
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
    loadSymbolPrices(syms, localCurrency)
      .then((map) => isMounted.current && setPriceCache(map))
      .catch(() => {});
  }, [balances, localCurrency]);

  // compute header total with fallback
  const totalValue = balances
    .reduce((sum: number, item: BalanceItem) => {
      const sym = (item.contract_ticker_symbol || "").toUpperCase();
      const dec = item.contract_decimals ?? 18;
      let qty = Number(ethers.utils.formatUnits(item.balance, dec));
      if (sym === "ETH") {
        const originalEth = Number(ethers.utils.formatUnits(item.balance, 18));
        qty = originalEth + localBalanceDelta;
      }
      let quote = currency === "USD" ? (item.quoteUsd ?? 0) : (item.quoteLocal ?? 0);
      if (!quote || !Number.isFinite(quote)) {
        const fallback = currency === "USD" ? (priceCache[sym]?.usd || 0) : (priceCache[sym]?.local || 0);
        quote = qty * fallback;
      }
      return sum + (Number.isFinite(quote) ? quote : 0);
    }, 0)
    .toFixed(2);

  const onRefresh = async () => {
    if (!isMounted.current) return;
    console.log('Wallet: onRefresh called');
    setRefreshing(true);
    refresh();
    await AsyncStorage.removeItem("localBalanceDelta");
    await loadLocalDelta();
    setRefreshing(false);
    console.log('Wallet: onRefresh completed');
  };

  // on tab focus: refresh once only (no automatic timers)
  useFocusEffect(
    React.useCallback(() => {
      console.log('Wallet: Focus effect triggered - refreshing once');
      onRefresh();
    }, []) // Remove activeChainId dependency to prevent re-triggering
  );

  // filter
  const filteredBalances: BalanceItem[] = balances.filter(
    (item: BalanceItem) => {
      const hasBalance = Number(ethers.utils.formatUnits(item.balance, item.contract_decimals ?? 18)) > 0;
      const matchesSearch = (item.contract_ticker_symbol || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesChain = activeChainId === 0 || item.chainId === activeChainId; // 0 = All networks
      
      return hasBalance && matchesSearch && matchesChain;
    }
  );
  
  console.log(`Filtered balances: ${filteredBalances.length} out of ${balances.length} total balances`);
  console.log(`Active chain ID: ${activeChainId}, Total balances: ${balances.length}`);
  
  // Debug: Log all balances with their chain IDs
  console.log('All balances with chain IDs:', balances.map(b => ({ symbol: b.contract_ticker_symbol, chainId: b.chainId })));

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

    const balanceLine = `${displayQty.toFixed(8)} ${item.contract_ticker_symbol}`;

    const symbol = item.contract_ticker_symbol || "—";
    const name = resolveName(symbol, item.contract_name);
    const title = `${symbol}  |  ${name}`;

    const logo = item.logo_url || "";

    // 24h %
    const symKey = (symbol || "").toLowerCase();
    const cg = cgMap[symKey] || cgMap[`${symKey}|${(item.contract_name || "").toLowerCase()}`];
    if (!cg) ensurePctFor(symbol, item.contract_name);
    const pct24 =
      cg?.price_change_percentage_24h_in_currency ??
      cg?.price_change_percentage_24h ??
      null;
    const pctStyle = pct24 == null ? styles.pctNeutral : pct24 >= 0 ? styles.up : styles.down;

    // fiat with fallback (never shows $0 on Amoy)
    const fallbackUsd = (priceCache[symU]?.usd || 0) * displayQty;
    const fallbackLoc = (priceCache[symU]?.local || 0) * displayQty;
    let fiatText = "—";
    if (currency === "USD") {
      const val = item.quoteUsd && item.quoteUsd > 0 ? item.quoteUsd : fallbackUsd;
      fiatText = Number.isFinite(val) ? `$${val.toFixed(2)}` : "—";
    } else {
      const val = item.quoteLocal && item.quoteLocal > 0 ? item.quoteLocal : fallbackLoc;
      fiatText = Number.isFinite(val) ? `${val.toFixed(2)} ${currency}` : `— ${currency}`;
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
              ? "—"
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
          <Text style={styles.cardPriceRight}>—</Text>
          <Text style={[styles.cardPctRight, styles.pctNeutral]}>—</Text>
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

  const networkLabel = activeChainId === 0 ? "All Networks" : (chain?.shortName || chain?.name || String(activeChainId));
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
              <Picker.Item key="all" label="All Networks" value={0} />
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
