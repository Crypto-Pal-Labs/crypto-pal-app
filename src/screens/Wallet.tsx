// src/screens/Wallet.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Image,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackActions } from '@react-navigation/native';
import { ethers } from 'ethers';
import { useAssets } from '../hooks/useAssets';
import { getWalletAddress, clearWallet } from '../utils/wallet';
import { Ionicons } from '@expo/vector-icons';
import { useWalletStore } from '../store/useWalletStore';
import { Picker } from '@react-native-picker/picker';
import { useChain } from '../hooks/useChain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;
  quoteLocal?: number;
  quoteUsd?: number;
  logo_url?: string;
  // meta from useAssets for proper formatting
  contract_address?: string;
  contract_decimals?: number;
  contract_name?: string;
};

type CGMarket = {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_24h?: number | null;
};

const fmtPct = (v?: number | null) =>
  v === undefined || v === null || Number.isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

let q = Promise.resolve();
let last = 0;
const GAP = 250;
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
function queuedJSON(url: string, retries = 2): Promise<any | null> {
  q = q.then(async () => {
    const wait = Math.max(0, last + GAP - Date.now());
    if (wait) await delay(wait);
    last = Date.now();
    let n = 0;
    while (n <= retries) {
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (r.ok) return r.json();
      } catch {}
      await delay(300 * Math.pow(1.6, n));
      n++;
    }
    return null;
  });
  return q;
}

const Wallet = () => {
  const navigation = useNavigation();
  const isMounted = useRef(true);
  const setAddress = useWalletStore((state) => state.setAddress);

  const { chain, chains, activeChainId, setActiveChainId } = useChain();
  const { balances, nfts, loading, error, refresh } = useAssets();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'crypto' | 'nfts'>('crypto');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localAddress, setLocalAddress] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [localBalanceDelta, setLocalBalanceDelta] = useState(0);
  const [currencyOptions, setCurrencyOptions] = useState(['USD']);

  const [cgMap, setCgMap] = useState<Record<string, CGMarket>>({});
  const resolving = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadAddress();
    loadLocalDelta();
    const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
    const localCurrency = locale.currencyCode?.toUpperCase() || 'USD';
    const uniqueOptions = [...new Set(['USD', localCurrency])];
    setCurrencyOptions(uniqueOptions);
    setCurrency('USD');
    return () => { isMounted.current = false; };
  }, [setAddress]);

  useEffect(() => {
    (async () => {
      const m = await queuedJSON(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false&price_change_percentage=24h'
      );
      if (!Array.isArray(m)) return;
      const next: Record<string, CGMarket> = {};
      m.forEach((row: any) => {
        const sym = (row.symbol || '').toLowerCase();
        const entry: CGMarket = {
          id: row.id,
          symbol: row.symbol,
          name: row.name,
          image: row.image ?? null,
          current_price: row.current_price ?? null,
          price_change_percentage_24h_in_currency:
            row.price_change_percentage_24h_in_currency ?? row.price_change_percentage_24h ?? null,
          price_change_percentage_24h: row.price_change_percentage_24h ?? null,
        };
        if (!next[sym]) next[sym] = entry;
        next[`${sym}|${(row.name || '').toLowerCase()}`] = entry;
      });
      if (isMounted.current) setCgMap(next);
    })();
  }, []);

  const ensurePctFor = async (symbol: string, name?: string) => {
    const key = (symbol || '').toLowerCase();
    if (!key || resolving.current.has(key) || cgMap[key]) return;
    resolving.current.add(key);
    try {
      const search = await queuedJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
      const match =
        search?.coins?.find((c: any) => c.symbol?.toLowerCase() === key) ||
        search?.coins?.[0];
      if (!match?.id) return;

      const rows = await queuedJSON(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
          match.id
        )}&sparkline=false&price_change_percentage=24h`
      );
      if (Array.isArray(rows) && rows[0]) {
        const r = rows[0];
        const entry: CGMarket = {
          id: r.id, symbol: r.symbol, name: r.name, image: r.image ?? null,
          current_price: r.current_price ?? null,
          price_change_percentage_24h_in_currency:
            r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h ?? null,
          price_change_percentage_24h: r.price_change_percentage_24h ?? null,
        };
        if (isMounted.current) {
          setCgMap((prev) => ({ ...prev, [key]: entry, [`${key}|${(name || r.name || '').toLowerCase()}`]: entry }));
        }
      }
    } finally { resolving.current.delete(key); }
  };

  const loadLocalDelta = async () => {
    try {
      const storedDelta = await AsyncStorage.getItem('localBalanceDelta');
      if (isMounted.current) setLocalBalanceDelta(storedDelta ? parseFloat(storedDelta) : 0);
    } catch (e) {
      console.error('Local delta fetch error:', e);
    }
  };

  const loadAddress = async () => {
    if (!isMounted.current) return;
    setLoadError(null);
    try {
      const currentAddress = await getWalletAddress();
      if (currentAddress) {
        setAddress(currentAddress);
        setLocalAddress(currentAddress);
      } else {
        throw new Error('No address returned from secure store.');
      }
    } catch (err) {
      if (isMounted.current) setLoadError((err as Error).message || 'Failed to load wallet address.');
    }
  };

  const handleLogout = async () => {
    if (!isMounted.current) return;
    try {
      await clearWallet();
      navigation.dispatch(StackActions.replace('Welcome'));
    } catch (error) {
      if (isMounted.current) {
        console.error('Logout error:', error);
        Alert.alert('Error', 'Failed to logout.');
      }
    }
  };

  const totalValue = balances
    .reduce((sum, item) => {
      let adjustedQuote = currency === 'USD' ? (item.quoteUsd ?? 0) : (item.quoteLocal ?? 0);
      if (item.contract_ticker_symbol === 'ETH') {
        const originalEth = parseFloat(ethers.utils.formatUnits(item.balance, 18));
        const adjustedEth = originalEth + localBalanceDelta;
        const pricePerEth = originalEth ? adjustedQuote / originalEth : 0;
        adjustedQuote = pricePerEth * adjustedEth;
      }
      return sum + adjustedQuote;
    }, 0)
    .toFixed(2);

  const onRefresh = async () => {
    if (!isMounted.current) return;
    setRefreshing(true);
    await refresh();
    await AsyncStorage.removeItem('localBalanceDelta');
    await loadLocalDelta();
    if (isMounted.current) setRefreshing(false);
  };

  useFocusEffect(React.useCallback(() => { onRefresh(); }, [activeChainId]));

  // filter using token decimals (not always 18)
  const filteredBalances = balances.filter(
    (item) =>
      Number(ethers.utils.formatUnits(item.balance, item.contract_decimals ?? 18)) > 0 &&
      (item.contract_ticker_symbol || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredNfts = nfts.filter(
    (item) =>
      (item.contract_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.token_id.includes(searchQuery)
  );

  const resolveName = (symbol: string, raw?: string) => {
    if (raw && raw.trim().length) return titleCase(raw.trim());
    if (symbol?.toUpperCase() === 'ETH') return 'Ethereum';
    return symbol;
  };

  const renderBalanceItem = ({ item }: { item: BalanceItem }) => {
    const dec = item.contract_decimals ?? 18;

    // show amount using token decimals. ETH keeps local delta.
    let displayQty: number;
    if ((item.contract_ticker_symbol || '').toUpperCase() === 'ETH') {
      const originalEth = Number(ethers.utils.formatUnits(item.balance, 18));
      displayQty = originalEth + localBalanceDelta;
    } else {
      displayQty = Number(ethers.utils.formatUnits(item.balance, dec));
    }
    const balanceLine = `${displayQty.toFixed(8)} ${item.contract_ticker_symbol}`;

    const symbol = item.contract_ticker_symbol || '—';
    const name = resolveName(symbol, item.contract_name);
    const title = `${symbol}  |  ${name}`;

    const logo = item.logo_url || null;
    const initials = (symbol || '?').slice(0, 1);

    const symKey = (symbol || '').toLowerCase();
    const cg = cgMap[symKey] || cgMap[`${symKey}|${(item.contract_name || '').toLowerCase()}`];
    if (!cg) ensurePctFor(symbol, item.contract_name);

    const pct24 =
      cg?.price_change_percentage_24h_in_currency ??
      cg?.price_change_percentage_24h ?? null;

    const pctStyle =
      pct24 == null ? styles.pctNeutral : pct24 >= 0 ? styles.up : styles.down;

    const displayFiat =
      currency === 'USD'
        ? (item.quoteUsd != null ? `$${item.quoteUsd.toFixed(2)}` : '—')
        : (item.quoteLocal != null ? `${item.quoteLocal.toFixed(2)} ${currency}` : `— ${currency}`);

    return (
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImgReal} resizeMode="contain" />
          ) : (
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>{initials}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardLeft}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>{balanceLine}</Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.cardPriceRight} numberOfLines={1}>{displayFiat}</Text>
          <Text style={[styles.cardPctRight, pctStyle]} numberOfLines={1}>
            {pct24 === null || pct24 === undefined || Number.isNaN(pct24)
              ? '—'
              : `${pct24 >= 0 ? '+' : ''}${pct24.toFixed(2)}%`}
          </Text>
        </View>
      </View>
    );
  };

  const renderNFTItem = ({ item }: { item: any }) => {
    const logo = item.logo_url || null;
    const title = `${resolveName('NFT', item.contract_name)}  |  Token`;
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

  const EmptyState = () => (
    <View style={styles.center}>
      <Text style={styles.empty}>No tokens to display yet</Text>
      <TouchableOpacity onPress={onRefresh}>
        <Ionicons name="refresh-circle" size={50} color="#0A84FF" />
      </TouchableOpacity>
    </View>
  );

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
          placeholder="Search your assets..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.segWrap}>
        <View style={styles.segRow}>
          <TouchableOpacity
            style={viewMode === 'crypto' ? styles.segChipActive : styles.segChip}
            onPress={() => setViewMode('crypto')}
          >
            <Text style={viewMode === 'crypto' ? styles.segChipTxtActive : styles.segChipTxt}>CRYPTOS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={viewMode === 'nfts' ? styles.segChipActive : styles.segChip}
            onPress={() => setViewMode('nfts')}
          >
            <Text style={viewMode === 'nfts' ? styles.segChipTxtActive : styles.segChipTxt}>NFTs</Text>
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
              {chains.map((c) => (
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
              onValueChange={(val) => setCurrency(val)}
              style={styles.pickerOverlay}
              mode="dropdown"
            >
              {[...new Set(currencyOptions)].map((opt) => (
                <Picker.Item key={opt} label={opt} value={opt} />
              ))}
            </Picker>
          </View>
        </View>
      </View>

      {error && (
        <Text style={styles.errorText}>
          {error}{' '}
          <TouchableOpacity onPress={onRefresh}><Text style={styles.retry}>Retry</Text></TouchableOpacity>
        </Text>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />
      ) : (
        <>
          {viewMode === 'crypto' ? (
            <FlatList<BalanceItem>
              style={styles.assetList}
              data={filteredBalances}
              renderItem={renderBalanceItem}
              keyExtractor={(it, idx) => `${it.contract_address || 'native'}:${it.contract_ticker_symbol}:${idx}`}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={EmptyState}
              contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            />
          ) : (
            <FlatList<any>
              style={styles.assetList}
              data={filteredNfts}
              renderItem={renderNFTItem}
              keyExtractor={(it, idx) => `${it.contract_address || 'nft'}:${it.token_id || idx}`}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={EmptyState}
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
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 20 },
  heading: { fontSize: 36, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', marginTop: 20 },
  totalLabel: { fontSize: 20, color: '#000', textAlign: 'center', marginBottom: 5 },
  totalValue: { fontSize: 27, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', marginBottom: 5 },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 8, marginHorizontal: 12, marginBottom: 8, backgroundColor: '#fff'
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 8 },

  segWrap: { paddingHorizontal: 12, marginBottom: 8 },
  segRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  segChip: {
    paddingVertical: 10, paddingHorizontal: 20, marginHorizontal: 6,
    borderRadius: 999, minWidth: 110, alignItems: 'center', backgroundColor: '#e6ecff'
  },
  segChipActive: {
    paddingVertical: 10, paddingHorizontal: 20, marginHorizontal: 6,
    borderRadius: 999, minWidth: 110, alignItems: 'center', backgroundColor: '#0A84FF'
  },
  segChipTxt: { color: '#0A84FF', fontWeight: '800', fontSize: 15 },
  segChipTxtActive: { color: '#fff', fontWeight: '900', fontSize: 15 },

  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 8, gap: 12 },
  pickerCol: { flex: 1 },
  pickerLabel: { fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 4, textAlign: 'center' },
  pickerBox: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#fff',
    height: 44, position: 'relative', overflow: 'hidden',
  },
  pickerDisplayRow: {
    position: 'absolute', left: 12, right: 12, top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'none',
  },
  pickerValue: { color: '#0A84FF', fontWeight: '700' },
  pickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02 },

  assetList: { flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff',
    borderRadius: 14, marginBottom: 12, shadowColor: '#0368FF', shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
  },
  logoWrap: { width: 60, height: 90, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  logoBox: { width: 60, height: 90, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontWeight: 'bold', color: '#2c3e50', fontSize: 20 },
  logoImgReal: { width: 70, height: 90, borderRadius: 12 },
  cardLeft: { flex: 1, paddingRight: 8 },
  cardRight: { minWidth: 110, alignItems: 'flex-end', justifyContent: 'center' },
  cardTitle: { fontWeight: 'bold', fontSize: 18, color: '#111' },
  cardSub: { color: '#666', marginTop: 2, fontSize: 15 },
  cardPriceRight: { fontWeight: '800', fontSize: 18, color: '#0A84FF' },
  cardPctRight: { fontWeight: '800', fontSize: 14, marginTop: 4 },
  pctNeutral: { color: '#666' },
  up: { color: '#0a8f3a' },
  down: { color: '#d12a2a' },
  empty: { textAlign: 'center', color: '#888', marginTop: 50 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 5 },
  retry: { color: '#0A84FF', marginTop: 5 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoutContainer: { paddingHorizontal: 12, position: 'absolute', bottom: 20, left: 0, right: 0 },
  btnLogout: {
    backgroundColor: '#ff2d2d', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#000', shadowRadius: 6, shadowOpacity: 0.08, elevation: 2,
  },
  btnLogoutTxt: { color: '#fff', fontWeight: '900', letterSpacing: 0.5 },
});

export default Wallet;
