// src/screens/Buy.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform,
  TextInput, FlatList, TouchableOpacity, Modal, Image, Alert, Dimensions, RefreshControl
} from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useWindowDimensions, InteractionManager } from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline, Line as SvgLine } from 'react-native-svg';

import { getWalletAddress } from '../utils/wallet';
import { useAssets } from '../hooks/useAssets';
import { useBuyIntent } from '../state/useBuyIntent';
import { prewarmBuySearchCache } from '../prewarm/buySearchWarmup';

// ──────────────────────────────────────────────────────────
// Config / types
// ──────────────────────────────────────────────────────────
const TRANSAK_API_KEY = '49362815-1fc8-4dde-ab46-72b51a21aeb3'; // staging
const TRANSAK_BASE = 'https://staging-global.transak.com';

type TransakAsset = {
  symbol: string;
  name: string;
  network?: string;
  contractAddress?: string | null;
};

type CGMarket = {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  market_cap?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
};

type Pair = [number, number]; // [timestamp(ms), price]

// ──────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────
const asString = (v: any, fallback = ''): string =>
  typeof v === 'string' ? v : (v == null ? fallback : String(v));

const pickSymbol = (row: any): string | undefined =>
  asString(row?.symbol) || asString(row?.cryptoCurrencySymbol) || asString(row?.ticker) || undefined;

const pickName = (row: any): string | undefined =>
  asString(row?.name) || asString(row?.cryptoCurrencyName) || asString(row?.fullName) || undefined;

const pickNetwork = (row: any): string => {
  const n = row?.network ?? row?.networkName ?? row?.networks ?? row?.chain ?? row?.blockchain;
  if (typeof n === 'string') return n.toLowerCase();
  if (Array.isArray(n) && n.length) {
    const f = n[0];
    if (typeof f === 'string') return f.toLowerCase();
    if (typeof f?.name === 'string') return f.name.toLowerCase();
    if (typeof f?.shortName === 'string') return f.shortName.toLowerCase();
  }
  if (n && typeof n === 'object') {
    if (typeof n.name === 'string') return n.name.toLowerCase();
    if (typeof n.shortName === 'string') return n.shortName.toLowerCase();
    if (typeof n.slug === 'string') return n.slug.toLowerCase();
  }
  return 'mainnet';
};

const pickContract = (row: any): string | null => {
  const c = row?.contractAddress ?? row?.contract_address ?? row?.tokenAddress ?? row?.token_address ?? null;
  if (!c) return null;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return typeof c[0] === 'string' ? c[0] : null;
  return null;
};

const fmtPct = (v?: number | null) =>
  v === undefined || v === null || Number.isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const chartRanges = [
  { key: '1',   label: '1D',  days: 1 as const },
  { key: '7',   label: '7D',  days: 7 as const },
  { key: '30',  label: '1M',  days: 30 as const },
  { key: '365', label: '1Y',  days: 365 as const },
  { key: 'max', label: 'MAX', days: 'max' as const },
];

// ──────────────────────────────────────────────────────────
// TTL helpers (AsyncStorage)
// ──────────────────────────────────────────────────────────
type Envelope<T> = { value: T; expiresAt: number };
async function loadWithTTL<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env.expiresAt !== 'number') return null;
    if (Date.now() > env.expiresAt) { AsyncStorage.removeItem(key).catch(() => {}); return null; }
    return env.value;
  } catch { return null; }
}
async function saveWithTTL<T>(key: string, value: T, ttlMs: number) {
  const env: Envelope<T> = { value, expiresAt: Date.now() + ttlMs };
  try { await AsyncStorage.setItem(key, JSON.stringify(env)); } catch {}
}

// ──────────────────────────────────────────────────────────
// Caches
// ──────────────────────────────────────────────────────────
type IdKey = string;
const idCacheMem          = new Map<IdKey, string>();
const marketCache         = new Map<string, CGMarket>();
const aboutCache          = new Map<string, string>();
const chartCache          = new Map<string, Record<string, Pair[]>>();
let idCacheLoaded = false;

const ID_CACHE_KEY        = 'cg_id_cache_v1';             // 24h TTL
const ABOUT_CACHE_PREFIX  = 'cg_about_';                   // 7d TTL
const CHART_CACHE_PREFIX  = 'cg_chart_';                   // 6h TTL
const SORT_MODE_KEY       = 'buy.search.sortmode';
const TTL_ID_MAP_MS       = 24 * 60 * 60 * 1000;
const TTL_ABOUT_MS        = 7  * 24 * 60 * 60 * 1000;
const TTL_CHART_MS        = 6  * 60 * 60 * 1000;

// ──────────────────────────────────────────────────────────
// Buy intent helpers (typed, no implicit any)
// ──────────────────────────────────────────────────────────
async function loadIdCacheOnce() {
  if (idCacheLoaded) return;
  const obj = await loadWithTTL<Record<string, string>>(ID_CACHE_KEY);
  if (obj) Object.entries(obj).forEach(([k, v]) => idCacheMem.set(k, v));
  idCacheLoaded = true;
}
async function saveIdCache() {
  const obj: Record<string, string> = {};
  idCacheMem.forEach((v, k) => (obj[k] = v));
  await saveWithTTL(ID_CACHE_KEY, obj, TTL_ID_MAP_MS);
}

function popBuyIntent(): any {
  const store: any = useBuyIntent as any;
  if (store?.getState) {
    const st = store.getState();
    if (typeof st.popIntent === 'function') return st.popIntent();
    const value = st.intent;
    if (value && typeof st.clearIntent === 'function') st.clearIntent();
    return value ?? null;
  }
  return null;
}

type BuyIntentValue = {
  symbol: string;
  network: string;
  contractAddress?: string;
  assetName?: string;
  coingeckoId?: string;
};
function setBuyIntent(val: BuyIntentValue) {
  const store: any = useBuyIntent as any;
  if (store?.getState) {
    const st = store.getState();
    if (typeof st.setIntent === 'function') {
      st.setIntent(val); return;
    }
  }
  if (typeof (useBuyIntent as any).setState === 'function') {
    (useBuyIntent as any).setState({
      intent: {
        assetSymbol: val.symbol,
        assetName: val.assetName ?? val.symbol,
        network: val.network,
        coingeckoId: val.coingeckoId,
        contractAddress: val.contractAddress,
      },
    });
  }
}

// ──────────────────────────────────────────────────────────
// Network: queued CG fetch + lower pacing; Coinbase fallback
// ──────────────────────────────────────────────────────────
let cgQueue = Promise.resolve();
let lastStamp = 0;
const MIN_GAP_MS = 250;   // ↓ faster spacing
function delay(ms: number) { return new Promise(res => setTimeout(res, ms)); }
function queuedFetchJSON(url: string, retries = 3): Promise<any | null> {
  cgQueue = cgQueue.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, lastStamp + MIN_GAP_MS - now);
    if (wait) await delay(wait);
    lastStamp = Date.now();

    let attempt = 0;
    let lastErr: any = null;
    while (attempt <= retries) {
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (r.ok) return r.json();
        const backoff = 400 * Math.pow(1.6, attempt) + Math.floor(Math.random() * 250);
        await delay(backoff);
      } catch (e) {
        lastErr = e;
        const backoff = 300 * Math.pow(1.6, attempt) + Math.floor(Math.random() * 250);
        await delay(backoff);
      }
      attempt++;
    }
    console.warn('CG fetch failed:', url, lastErr?.message || lastErr);
    return null;
  });
  return cgQueue;
}
const cgFetch = queuedFetchJSON;

// Fast Coinbase fallback (BTC/ETH)
function coinbaseProductForId(id: string): string | null {
  if (!id) return null;
  const k = id.toLowerCase();
  if (k === 'bitcoin') return 'BTC-USD';
  if (k === 'ethereum') return 'ETH-USD';
  return null;
}
function granularityForDays(days: number | 'max'): number {
  if (days === 'max' || days >= 365) return 86400;
  if (days >= 30) return 21600;
  if (days >= 7) return 3600;
  if (days >= 1) return 900;
  return 300;
}
async function coinbaseChart(id: string, days: number | 'max'): Promise<Pair[] | null> {
  const product = coinbaseProductForId(id);
  if (!product) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = days === 'max' ? nowSec - 365 * 24 * 3600 : nowSec - days * 24 * 3600;
  const gran = granularityForDays(days);
  const url = `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${gran}&start=${new Date(
    fromSec * 1000
  ).toISOString()}&end=${new Date(nowSec * 1000).toISOString()}`;

  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    const points: Pair[] = arr
      .map((row: any) => [Number(row[0]) * 1000, (Number(row[3]) + Number(row[4])) / 2] as Pair)
      .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .sort((a, b) => a[0] - b[0]);
    return points.length >= 2 ? points : null;
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────
// CoinGecko utilities with robust fallbacks
// ──────────────────────────────────────────────────────────
async function resolveCgId(symbol: string, name?: string): Promise<string | null> {
  await loadIdCacheOnce();
  const sym = (symbol || '').toLowerCase();
  const nm  = (name || '').toLowerCase();
  const k1 = `${sym}|${nm}`;
  const k2 = sym;
  if (idCacheMem.has(k1)) return idCacheMem.get(k1)!;
  if (idCacheMem.has(k2)) return idCacheMem.get(k2)!;

  const q = encodeURIComponent(`${name ?? ''} ${symbol}`.trim());
  const j = await cgFetch(`https://api.coingecko.com/api/v3/search?query=${q}`);
  const coins = Array.isArray(j?.coins) ? j.coins : [];
  let pick = coins.find((c: any) => (c?.symbol || '').toLowerCase() === sym);
  if (!pick && nm) pick = coins.find((c: any) => (c?.name || '').toLowerCase() === nm);
  const id = (pick?.id || coins[0]?.id) as string | undefined;
  if (!id) return null;
  idCacheMem.set(k1, id); idCacheMem.set(k2, id);
  await saveIdCache();
  return id;
}

async function fetchMarkets(ids: string[]): Promise<CGMarket[]> {
  const unique = Array.from(new Set(ids));
  const fresh: CGMarket[] = [];
  const missing: string[] = [];
  unique.forEach(id => {
    const hit = marketCache.get(id);
    if (hit) fresh.push(hit); else missing.push(id);
  });
  if (!missing.length) return fresh;

  const B = 40;
  for (let i = 0; i < missing.length; i += B) {
    const slice = missing.slice(i, i + B);
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
      slice.join(',')
    )}&sparkline=false&price_change_percentage=24h`;
    const rows = await cgFetch(url);
    if (Array.isArray(rows)) {
      rows.forEach((row: any) => marketCache.set(row.id, {
        id: row.id, symbol: row.symbol, name: row.name,
        image: row.image ?? null, current_price: row.current_price ?? null,
        market_cap: row.market_cap ?? null,
        price_change_percentage_24h_in_currency: row.price_change_percentage_24h_in_currency ?? null
      }));
      fresh.push(...rows.map((row: any) => marketCache.get(row.id)!));
    }
  }
  return fresh;
}

async function getAbout(id: string): Promise<string | null> {
  if (aboutCache.has(id)) return aboutCache.get(id)!;
  const key = ABOUT_CACHE_PREFIX + id;
  const saved = await loadWithTTL<string>(key);
  if (saved != null) { aboutCache.set(id, saved); return saved; }

  const j  = await cgFetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`);
  const txt = (j?.description?.en as string | undefined)?.replace(/<\/?[^>]+(>|$)/g, '') || '';
  aboutCache.set(id, txt);
  await saveWithTTL(key, txt, TTL_ABOUT_MS);
  return txt;
}

// Unified chart getter:
// • BTC/ETH → try Coinbase FIRST (fast) then CG (background-like)
// • Others  → CG with small queue/backoff; cache to disk.
async function getChart(id: string, rk: string, days: number | 'max'): Promise<Pair[] | null> {
  const byId = chartCache.get(id) || {};
  if (byId[rk]) return byId[rk];

  // 1) Fast path for BTC/ETH
  const cbFirst = await coinbaseChart(id, days);
  if (cbFirst && cbFirst.length >= 2) {
    const stored = chartCache.get(id) || {};
    stored[rk] = cbFirst;
    chartCache.set(id, stored);
    const key = `${CHART_CACHE_PREFIX}${id}_${rk}`;
    await saveWithTTL(key, cbFirst, TTL_CHART_MS);
    return cbFirst;
  }

  // 2) CoinGecko
  let data = await cgFetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${typeof days === 'number' ? days : 'max'}`);
  let pairs: Pair[] = Array.isArray(data?.prices) ? (data.prices as Pair[]) : [];

  if (pairs.length < 2) {
    data = await cgFetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${typeof days === 'number' ? days : 'max'}&interval=daily`);
    pairs = Array.isArray(data?.prices) ? (data.prices as Pair[]) : [];
  }

  if (pairs.length < 2 && typeof days !== 'string') {
    const ohlc = await cgFetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/ohlc?vs_currency=usd&days=${days}`);
    if (Array.isArray(ohlc) && ohlc.length) {
      pairs = ohlc.map((row: any) => [row[0], (row[1] + row[4]) / 2]) as Pair[];
    }
  }

  if (pairs.length >= 2) {
    const stored = chartCache.get(id) || {};
    stored[rk] = pairs;
    chartCache.set(id, stored);
    const key = `${CHART_CACHE_PREFIX}${id}_${rk}`;
    await saveWithTTL(key, pairs, TTL_CHART_MS);
    return pairs;
  }

  // 3) Last try: stale cache
  const key = `${CHART_CACHE_PREFIX}${id}_${rk}`;
  const saved = await loadWithTTL<Pair[]>(key);
  if (saved && saved.length >= 2) return saved;

  return null;
}

// ──────────────────────────────────────────────────────────
// Chart math (even spacing + clamped label positions)
// ──────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function niceStep(min: number, max: number, targetTicks: number) {
  const span = Math.max(1e-9, max - min);
  const rough = span / Math.max(1, targetTicks);
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const multiples = [1, 2, 2.5, 5, 10];
  let step = multiples[0] * pow10;
  for (const m of multiples) {
    const s = m * pow10;
    if (rough <= s) { step = s; break; }
  }
  return step;
}
function expandDomain(min: number, max: number, pad = 0.08) {
  if (!isFinite(min) || !isFinite(max) || max <= min) return { lo: min, hi: max };
  const span = max - min;
  const extra = span * pad;
  return { lo: Math.max(0, min - extra), hi: max + extra };
}
function makeTicks(min: number, max: number, count = 4): number[] {
  const { lo, hi } = expandDomain(min, max, 0.08);
  const step = niceStep(lo, hi, count);
  const low  = Math.floor(lo / step) * step;
  const high = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = low; v <= high + 1e-9; v += step) out.push(+v.toFixed(10));
  if (out.length > count + 1) {
    const stride = Math.round(out.length / (count + 1));
    const slim: number[] = [];
    for (let i = 0; i < out.length; i += stride) slim.push(out[i]);
    if (slim[slim.length - 1] !== out[out.length - 1]) slim.push(out[out.length - 1]);
    return slim;
  }
  return out;
}
function evenlySpaced<T>(arr: T[], n: number): T[] {
  if (!arr.length || n <= 0) return [];
  if (arr.length <= n) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return out;
}
const fmtDollar = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtDateShort = (ts: number) => {
  const d = new Date(ts);
  const nowY = new Date().getFullYear();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === nowY ? { month: 'short', day: 'numeric' }
                             : { month: 'short', day: 'numeric', year: '2-digit' };
  return d.toLocaleDateString(undefined, opts);
};
const fmtHour = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric' });

function buildSvgPolyline(
  pairs: Pair[],
  width: number,
  height: number,
  padding = { top: 16, right: 16, bottom: 46, left: 72 }
) {
  const W = width - padding.left - padding.right;
  const H = height - padding.top - padding.bottom;
  if (!pairs?.length || W <= 0 || H <= 0) {
    return {
      poly: '', min: 0, max: 0, firstTs: 0, lastTs: 0, width, height, padding,
      xForTs: (_ts: number) => padding.left,
      yForPrice: (_p: number) => height - padding.bottom
    };
  }

  const N = Math.min(pairs.length, 300);
  const stride = Math.max(1, Math.floor(pairs.length / N));
  const arr = pairs.filter((_, i) => i % stride === 0);

  const prices = arr.map(p => p[1]);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const { lo, hi } = expandDomain(rawMin, rawMax, 0.08);
  const range = Math.max(1e-9, hi - lo);

  const firstTs = arr[0][0];
  const lastTs  = arr[arr.length - 1][0];

  const xForTs = (ts: number) =>
    padding.left + ((ts - firstTs) / Math.max(1e-9, (lastTs - firstTs))) * W;
  const yForPrice = (p: number) =>
    padding.top + (1 - (p - lo) / range) * H;

  const pts = arr.map(p => `${xForTs(p[0]).toFixed(1)},${yForPrice(p[1]).toFixed(1)}`);
  return { poly: pts.join(' '), min: lo, max: hi, firstTs, lastTs, width, height, padding, xForTs, yForPrice };
}

// Prefer CG image; fallback to TrustWallet (ETH mainnet only)
const trustLogo = (asset: TransakAsset): string | null => {
  if (!asset.contractAddress || !asset.network) return null;
  const net = asset.network.toLowerCase();
  const isEth = ['eth', 'ethereum', 'sepolia', 'mainnet'].some(k => net.includes(k));
  if (!isEth) return null;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${asset.contractAddress}/logo.png`;
};

function makeTransakUrl(params: {
  address?: string; fiatCurrency?: string; symbol?: string; network?: string;
  contractAddress?: string; product?: 'BUY' | 'SELL';
}) {
  const { address = '', fiatCurrency = 'USD', symbol, network = 'mainnet', contractAddress, product = 'BUY' } = params;
  const p = new URLSearchParams();
  p.set('apiKey', TRANSAK_API_KEY);
  p.set('walletAddress', address);
  p.set('defaultFiatCurrency', fiatCurrency);
  p.set('productsAvailed', product);
  p.set('defaultProduct', product);
  p.set('isBuyOrSell', product);
  p.set('environment', 'STAGING');
  p.set('network', network);
  p.set('disableWalletAddressForm', 'true');
  if (symbol) p.set('cryptoCurrencyCode', symbol);
  if (contractAddress) p.set('contractAddress', contractAddress);
  return `${TRANSAK_BASE}?${p.toString()}`;
}

// ──────────────────────────────────────────────────────────
// BUY
// ──────────────────────────────────────────────────────────
const BuyRoute: React.FC<{ defaultFiat?: string }> = ({ defaultFiat }) => {
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const { refresh } = useAssets();

  useFocusEffect(
    useCallback(() => {
      const locale = Localization.getLocales()[0] || { regionCode: 'US', currencyCode: 'USD' };
      const region = locale.regionCode || 'US';
      const restricted = ['US', 'CA'].includes(region);
      setIsRestricted(restricted);

      getWalletAddress().then((addr) => {
        const fiat = defaultFiat || locale.currencyCode || 'USD';
        if (!restricted) setUri(makeTransakUrl({ address: addr || '', fiatCurrency: fiat, product: 'BUY', network: 'mainnet' }));
        setLoading(false);

        const intent = popBuyIntent();
        if (!restricted && intent?.symbol) {
          const u = makeTransakUrl({
            address: addr || '',
            fiatCurrency: fiat,
            symbol: intent.symbol,
            network: intent.network || 'mainnet',
            contractAddress: intent.contractAddress,
            product: 'BUY',
          });
          setUri(u);
        }
      });
    }, [defaultFiat])
  );

  const handleNavigationChange = (event: { url: string }) => {
    if (event.url.includes('transak.com') && event.url.includes('success')) refresh();
  };

  if (loading) return <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />;
  if (isRestricted) return <Text style={styles.restrictedText}>Buy is restricted in your region.</Text>;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1 }}
        cacheMode="LOAD_NO_CACHE"
        key="buy"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled
        onError={(e) => console.error('WebView error:', e.nativeEvent)}
        useWebKit={Platform.OS === 'ios'}
        onNavigationStateChange={handleNavigationChange}
      />
    </ScrollView>
  );
};

// ──────────────────────────────────────────────────────────
const SellRoute: React.FC<{ defaultFiat?: string }> = ({ defaultFiat }) => {
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const { refresh } = useAssets();

  useFocusEffect(
    useCallback(() => {
      const locale = Localization.getLocales()[0] || { regionCode: 'US', currencyCode: 'USD' };
      const region = locale.regionCode || 'US';
      const restricted = ['US', 'CA'].includes(region);
      setIsRestricted(restricted);

      getWalletAddress().then((addr) => {
        if (!restricted) {
          const fiat = defaultFiat || locale.currencyCode || 'USD';
          const newUri = makeTransakUrl({ address: addr || '', fiatCurrency: fiat, product: 'SELL', network: 'mainnet' });
          setUri(newUri);
        }
        setLoading(false);
      });
    }, [defaultFiat])
  );

  const handleNavigationChange = (event: { url: string }) => {
    if (event.url.includes('transak.com') && event.url.includes('success')) refresh();
  };

  if (loading) return <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />;
  if (isRestricted) return <Text style={styles.restrictedText}>Sell is restricted in your region.</Text>;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1 }}
        cacheMode="LOAD_NO_CACHE"
        key="sell"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled
        onError={(e) => console.error('WebView error:', e.nativeEvent)}
        useWebKit={Platform.OS === 'ios'}
        onNavigationStateChange={handleNavigationChange}
      />
    </ScrollView>
  );
};

// ──────────────────────────────────────────────────────────
// SEARCH
// ──────────────────────────────────────────────────────────
type SortMode = 'az' | 'cap' | 'trend';

const SearchRoute: React.FC<{ onSwitchToBuy: () => void }> = ({ onSwitchToBuy }) => {
  const [query, setQuery] = useState('');
   const [assets, setAssets] = useState<TransakAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('cap');

  const [cgMap, setCgMap] = useState<Record<string, CGMarket>>({});
  const [modal, setModal] = useState<{
    open: boolean;
    asset?: TransakAsset;
    cg?: CGMarket;
    cgId?: string | null;
    about?: string | null;
    rangeKey?: string;
    priceNow?: number;
    charts?: Record<string, Pair[]>;
  }>({ open: false });

  useEffect(() => {
    loadWithTTL<SortMode>(SORT_MODE_KEY).then((v) => { if (v) setSortMode(v); });
  }, []);
  useEffect(() => {
    saveWithTTL(SORT_MODE_KEY, sortMode, 30 * 24 * 60 * 60 * 1000).catch(() => {});
  }, [sortMode]);

  const bootstrap = useCallback(async () => {
    try {
      const resp = await fetch('https://api.transak.com/api/v2/currencies/crypto-currencies');
      const json = await resp.json();
      const rows: TransakAsset[] = (json?.response || []).map((r: any) => {
        const symbol = pickSymbol(r) || '';
        const name = pickName(r) || symbol;
        const network = pickNetwork(r);
        const contractAddress = pickContract(r);
        return { symbol, name, network, contractAddress };
      });
      setAssets(rows);

      const m = await cgFetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false&price_change_percentage=24h`);
      if (Array.isArray(m)) {
        const init: Record<string, CGMarket> = {};
        m.forEach((row: any) => {
          const cg: CGMarket = {
            id: row.id, symbol: row.symbol, name: row.name,
            image: row.image ?? null, current_price: row.current_price ?? null,
            market_cap: row.market_cap ?? null,
            price_change_percentage_24h_in_currency: row.price_change_percentage_24h_in_currency ?? null,
          };
          marketCache.set(row.id, cg);
          const sym = (row.symbol || '').toLowerCase();
          init[sym] = init[sym] || cg;
          init[`${sym}|${(row.name || '').toLowerCase()}`] = cg;
        });
        setCgMap(prev => ({ ...init, ...prev }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await bootstrap(); } finally { setRefreshing(false); }
  }, [bootstrap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? assets.filter(a =>
          a.symbol?.toLowerCase().includes(q) ||
          a.name?.toLowerCase().includes(q) ||
          a.network?.toLowerCase().includes(q)
        )
      : assets.slice();

    const enriched = list.map(a => {
      const key = `${a.symbol}|${a.name}`.toLowerCase();
      const cg = cgMap[key] || cgMap[a.symbol.toLowerCase()];
      return { a, cg };
    });

    if (sortMode === 'cap') {
      const withCap = enriched.slice().sort((x, y) => (y.cg?.market_cap ?? -1) - (x.cg?.market_cap ?? -1));
      const capCount = withCap.filter(x => x.cg?.market_cap != null).length;
      const out = capCount >= Math.max(5, Math.floor(enriched.length * 0.3)) ? withCap : enriched.slice().sort((x, y) => x.a.name.localeCompare(y.a.name));
      return out.map(x => x.a);
    }
    if (sortMode === 'trend') {
      const byGain = enriched.slice().sort(
        (x, y) => (y.cg?.price_change_percentage_24h_in_currency ?? -Infinity) -
                  (x.cg?.price_change_percentage_24h_in_currency ?? -Infinity)
      );
      return byGain.map(x => x.a);
    }
    return enriched.map(x => x.a).sort((a, b) => {
      const s = a.symbol.localeCompare(b.symbol, undefined, { sensitivity: 'base' });
      if (s !== 0) return s;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [assets, query, cgMap, sortMode]);

  const fetchRangeIntoState = async (id: string, rk: string, days: number | 'max') => {
    const pairs = await getChart(id, rk, days);
    setModal(m => ({ ...m, charts: { ...(m.charts || {}), [rk]: pairs || [] } }));
  };

  const SortChips = () => (
    <View style={styles.sortRow}>
      <Text style={styles.sortLabel}>Sort by:</Text>
      {[
        { k: 'az',    t: 'A–Z' },
        { k: 'cap',   t: 'Market Cap' },
        { k: 'trend', t: 'Trending' },
      ].map(({ k, t }) => (
        <TouchableOpacity
          key={k}
          style={sortMode === (k as SortMode) ? styles.rangeChipActive : styles.rangeChip}
          onPress={() => setSortMode(k as SortMode)}
        >
          <Text style={sortMode === (k as SortMode) ? styles.rangeChipTxtActive : styles.rangeChipTxt}>{t}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const onOpenDetails = useCallback(async (item: TransakAsset, cg?: CGMarket | undefined) => {
    const cgId = cg?.id || (await resolveCgId(item.symbol, item.name));

    // warm modal
    setModal({
      open: true,
      asset: item,
      cg: cg || undefined,
      cgId,
      rangeKey: '7',
      priceNow: cg?.current_price ?? undefined,
      about: null,
      charts: {},
    });

    if (!cg && cgId) {
      const rows = await fetchMarkets([cgId]);
      const row = rows[0];
      if (row) {
        setCgMap(prev => {
          const next = { ...prev };
          next[item.symbol.toLowerCase()] = row;
          next[`${item.symbol}|${item.name}`.toLowerCase()] = row;
          return next;
        });
      }
    }

    if (cgId) {
      // Price: try CG simple; fall back to Coinbase last candle close
      const simple = await cgFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cgId)}&vs_currencies=usd`);
      let price = simple?.[cgId]?.usd ?? cg?.current_price;
      if (price == null) {
        const cb = await coinbaseChart(cgId, 1);
        if (cb && cb.length) price = cb[cb.length - 1][1];
      }
      setModal(m => ({ ...m, priceNow: price ?? undefined }));

      // About (CG) with BTC/ETH fallback blurb
      let txt = await getAbout(cgId);
      if (!txt || txt.trim().length === 0) {
        if (cgId === 'bitcoin') {
          txt = 'Bitcoin (BTC) is a decentralized digital currency secured by proof-of-work mining and a fixed 21M supply cap.';
        } else if (cgId === 'ethereum') {
          txt = 'Ethereum (ETH) is a programmable blockchain for smart contracts and dapps; it transitioned to proof-of-stake in 2022.';
        }
      }
      setModal(m => ({ ...m, about: txt ?? '' }));

      // Current range only (fast), no heavy prefetch
      const pref = chartRanges.find(r => r.key === '7')!;
      await fetchRangeIntoState(cgId, pref.key, pref.days);
    }
  }, []);

  const retryModalData = useCallback(async () => {
    if (!modal.asset) return;
    const a = modal.asset;
    const rk = modal.rangeKey || '7';
    const meta = chartRanges.find(r => r.key === rk)!;

    let cgId = modal.cgId;
    if (!cgId) cgId = await resolveCgId(a.symbol, a.name);
    setModal(m => ({ ...m, cgId }));

    if (cgId) {
      const simple = await cgFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cgId!)}&vs_currencies=usd`);
      let price = simple?.[cgId!]?.usd ?? modal.priceNow;
      if (price == null) {
        const cb = await coinbaseChart(cgId!, 1);
        if (cb && cb.length) price = cb[cb.length - 1][1];
      }
      setModal(m => ({ ...m, priceNow: price ?? m.priceNow }));

      let txt = await getAbout(cgId!);
      if (!txt || txt.trim().length === 0) {
        if (cgId === 'bitcoin') txt = 'Bitcoin (BTC) is a decentralized digital currency secured by proof-of-work mining and a fixed 21M supply cap.';
        else if (cgId === 'ethereum') txt = 'Ethereum (ETH) is a programmable blockchain for smart contracts and dapps; it transitioned to proof-of-stake in 2022.';
      }
      setModal(m => ({ ...m, about: txt ?? '' }));

      await fetchRangeIntoState(cgId!, rk, meta.days);
    }
  }, [modal.asset, modal.cgId, modal.rangeKey, modal.priceNow]);

  const onBuy = async () => {
    if (!modal.asset) return;
    const a = modal.asset;
    setBuyIntent({
      symbol: a.symbol,
      network: a.network || 'mainnet',
      contractAddress: a.contractAddress || undefined,
      assetName: a.name,
      coingeckoId: modal.cgId ?? undefined,
    });
    setModal({ open: false });
    onSwitchToBuy();
    Alert.alert('Loading Buy', `Preparing to buy ${a.symbol} on ${a.network || 'mainnet'}…`);
  };

  const renderItem = ({ item }: { item: TransakAsset }) => {
    const key = `${item.symbol}|${item.name}`.toLowerCase();
    const cg = cgMap[key] || cgMap[item.symbol.toLowerCase()];
    const price = cg?.current_price ?? null;
    const pct24 = cg?.price_change_percentage_24h_in_currency ?? null;
    const cgLogo = cg?.image || null;
    const twLogo = trustLogo(item);
    const logo = cgLogo || twLogo || null;
    const pctStyle = pct24 === null ? styles.pctNeutral : pct24 >= 0 ? styles.up : styles.down;

    return (
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          {logo ? <Image source={{ uri: logo }} style={styles.logoImgReal} />
                : <View style={styles.logoCircle}><Text style={styles.logoLetter}>{(item.symbol || '?').slice(0,1)}</Text></View>}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.symbol} · {item.name}</Text>
          <Text style={styles.cardSub}>{(item.network || '').toLowerCase()}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text style={styles.cardPrice}>{price !== null ? `$${price.toLocaleString()}` : '—'}</Text>
            <Text style={[styles.cardPct, pctStyle]}>{fmtPct(pct24)}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => onOpenDetails(item, cg)}>
          <Text style={styles.detailsLink}>Details →</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const ModalBody = () => {
    const a = modal.asset!;
    const key = `${a.symbol}|${a.name}`.toLowerCase();
    const cg = modal.cg || cgMap[key] || cgMap[a.symbol.toLowerCase()];
    const price = modal.priceNow ?? cg?.current_price ?? 0;

    const rk = modal.rangeKey || '7';
    const pairs = modal.charts?.[rk];
    const hasPairs = !!(pairs && pairs.length > 1);

    const screenW = Dimensions.get('window').width;
    const chartWidth = Math.min(360, screenW - 64);
    const chartHeight = 228;

    const built = buildSvgPolyline(pairs || [], chartWidth, chartHeight);
    const { poly, min, max, width: svgW, height: svgH, padding, xForTs, yForPrice } = built;

    const targetXTicks = rk === '1' ? 6 : 5;
    const xTicks: number[] = hasPairs ? evenlySpaced(pairs!.map(p => p[0]), targetXTicks) : [];
    const yTicks: number[] = hasPairs ? makeTicks(min, max, 4) : [];

    // clamps for label placement (fix #1)
    const yTop = padding.top;
    const yBottom = svgH - padding.bottom;

    return (
      <View style={styles.modalCard}>
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
          <Text style={styles.modalTitle}>{a.symbol} · {a.name}</Text>
          <Text style={styles.modalSub}>Network: {(a.network || '').toLowerCase()}</Text>

          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>Price (USD):</Text>
            <Text style={styles.modalValue}>{fmtDollar(price)}</Text>
          </View>

          <View style={styles.rangeRow}>
            {chartRanges.map(r => (
              <TouchableOpacity
                key={r.key}
                style={rk === r.key ? styles.rangeChipActive : styles.rangeChip}
                onPress={() => setModal(m => ({ ...m, rangeKey: r.key }))}
                onPressOut={() => {
                  const meta = chartRanges.find(x => x.key === r.key)!;
                  if (modal.cgId) fetchRangeIntoState(modal.cgId, r.key, meta.days);
                }}
              >
                <Text style={rk === r.key ? styles.rangeChipTxtActive : styles.rangeChipTxt}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.lineWrap, { width: svgW }]}>
            {!pairs && (
              <View style={{ alignItems: 'center' }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 6, color: '#666' }}>Loading chart…</Text>
              </View>
            )}
            {pairs && !hasPairs && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#666', marginBottom: 8 }}>No chart data available.</Text>
                <TouchableOpacity onPress={retryModalData}>
                  <Text style={{ color: '#0A84FF', fontWeight: '700' }}>Tap to Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            {hasPairs && (
              <View>
                <Svg width={svgW} height={svgH}>
                  {/* grid */}
                  {yTicks.map((yt, i) => {
                    const y = yForPrice(yt);
                    const yc = clamp(y, yTop, yBottom); // clamp line inside plot
                    return (
                      <SvgLine
                        key={`grid-${i}`}
                        x1={padding.left} x2={svgW - padding.right}
                        y1={yc} y2={yc}
                        stroke="#eef2f7" strokeWidth={1}
                      />
                    );
                  })}
                  {/* y axis */}
                  <SvgLine
                    x1={padding.left} x2={padding.left}
                    y1={yTop} y2={yBottom}
                    stroke="#e5e7eb" strokeWidth={1}
                  />
                  {/* price line */}
                  <Polyline
                    points={poly}
                    stroke="#0A84FF"
                    strokeWidth={2}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </Svg>

                {/* Y labels (clamped) */}
                <View style={{ position: 'absolute', left: 0, top: 0, width: padding.left - 10, height: svgH }}>
                  {yTicks.map((yt, i) => {
                    const y = yForPrice(yt);
                    const yc = clamp(y, yTop, yBottom);
                    return (
                      <Text
                        key={`yl-${i}`}
                        style={[styles.axisLabel, { position: 'absolute', right: 6, top: yc - 8 }]}
                        numberOfLines={1}
                      >
                        {fmtDollar(yt)}
                      </Text>
                    );
                  })}
                </View>

                {/* X labels */}
                <View style={{ position: 'absolute', left: padding.left, right: padding.right, top: yBottom + 6 }}>
                  {xTicks.map((ts, i) => {
                    const x = xForTs(ts);
                    const txt = rk === '1' ? fmtHour(ts) : fmtDateShort(ts);
                    return (
                      <Text key={`xl-${i}`} style={[styles.axisLabel, { position: 'absolute', left: x - padding.left - 12 }]}>
                        {txt}
                      </Text>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* About (always render a section; show fallback text if empty) */}
          <Text style={[styles.modalLabel, { marginTop: 12 }]}>About</Text>
          <Text style={styles.aboutTxt}>
            {modal.about != null && modal.about.trim().length > 0 ? modal.about : 'No description available.'}
          </Text>
        </ScrollView>

        <View style={styles.modalBtnRow}>
          <TouchableOpacity style={styles.btnGhost} onPress={() => setModal({ open: false })}>
            <Text style={styles.btnGhostTxt}>Close</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={onBuy}>
            <Text style={styles.btnPrimaryTxt}>Buy it Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) return <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />;

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.subHeading}>Search Crypto</Text>
      <TextInput
        style={styles.search}
        placeholder="Search by symbol, name, or network"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <SortChips />

      {filtered.length === 0 ? (
        <Text style={{ textAlign: 'center', marginTop: 20, color: '#999' }}>No results</Text>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(it, idx) => `${it.symbol}-${it.name}-${idx}`}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A84FF" colors={['#0A84FF']} />
          }
        />
      )}

      <Modal visible={modal.open} transparent animationType="fade" onRequestClose={() => setModal({ open: false })}>
        <View style={styles.modalOverlay}>
          {modal.asset ? <ModalBody /> : <ActivityIndicator size="large" color="#0A84FF" />}
        </View>
      </Modal>
    </View>
  );
};

// ──────────────────────────────────────────────────────────
// Parent
// ──────────────────────────────────────────────────────────
const Buy: React.FC = () => {
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const routes = [
    { key: 'buy', title: 'Buy' },
    { key: 'sell', title: 'Sell' },
    { key: 'search', title: 'Search' },
  ];

  const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
  const defaultFiat = locale.currencyCode || 'USD';

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      prewarmBuySearchCache().catch(() => {});
    });
    return () => task.cancel();
  }, []);

  const renderScene = ({ route }: { route: { key: string } }) => {
    switch (route.key) {
      case 'buy':    return <BuyRoute  defaultFiat={defaultFiat} />;
      case 'sell':   return <SellRoute defaultFiat={defaultFiat} />;
      case 'search': return <SearchRoute onSwitchToBuy={() => setIndex(0)} />;
      default:       return null;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trading</Text>

      <View style={styles.segWrap}>
        <View style={styles.segRow}>
          {routes.map((r, i) => (
            <TouchableOpacity
              key={r.key}
              style={i === index ? styles.segChipActive : styles.segChip}
              onPress={() => setIndex(i)}
              activeOpacity={0.9}
            >
              <Text style={i === index ? styles.segChipTxtActive : styles.segChipTxt}>{r.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        renderTabBar={() => null}
        initialLayout={{ width: layout.width }}
      />
    </View>
  );
};

export default Buy;

// ──────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  heading: { fontSize: 34, fontWeight: 'bold', color: '#0A84FF', textAlign: 'center', padding: 12, marginTop: 26 },

  segWrap: { paddingHorizontal: 12, marginBottom: 10 },
  segRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  segChip: {
    paddingVertical: 10, paddingHorizontal: 20,
    marginHorizontal: 6,
    borderRadius: 999,
    minWidth: 96,
    alignItems: 'center',
    backgroundColor: '#e6ecff'
  },
  segChipActive: {
    paddingVertical: 10, paddingHorizontal: 20,
    marginHorizontal: 6,
    borderRadius: 999,
    minWidth: 96,
    alignItems: 'center',
    backgroundColor: '#0A84FF'
  },
  segChipTxt: { color: '#0A84FF', fontWeight: '800', fontSize: 16 },
  segChipTxtActive: { color: '#fff', fontWeight: '900', fontSize: 16 },

  restrictedText: { flex: 1, textAlign: 'center', marginTop: 20, color: 'red', fontSize: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  subHeading: { fontSize: 24, fontWeight: 'bold', marginTop: 10, paddingHorizontal: 16, color: '#111' },
  search: { margin: 16, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, backgroundColor: '#fff' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 10, flexWrap: 'wrap' },
  sortLabel: { fontWeight: '700', color: '#333' },

  card: {
    flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#fff', borderRadius: 12,
    marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2
  },
  logoWrap: { width: 44, height: 44, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  logoCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontWeight: 'bold', color: '#2c3e50', fontSize: 16 },
  logoImgReal: { width: 44, height: 44, borderRadius: 22 },

  cardTitle: { fontWeight: 'bold', fontSize: 16, color: '#111' },
  cardSub: { color: '#666', marginTop: 2, marginBottom: 2 },
  cardPrice: { fontWeight: '600', color: '#0A84FF' },
  cardPct: { marginLeft: 6, fontWeight: '700' },
  pctNeutral: { color: '#666' },
  up: { color: '#0a8f3a' },
  down: { color: '#d12a2a' },
  detailsLink: { color: '#0A84FF', fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '85%', padding: 18, borderRadius: 14, backgroundColor: '#fff' },
  modalScrollContent: { paddingBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#111' },
  modalSub: { color: '#666', marginBottom: 10 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  modalLabel: { fontWeight: '700', color: '#333' },
  modalValue: { fontWeight: '600', color: '#111' },

  rangeRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  rangeChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#eef2ff' },
  rangeChipActive: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#0A84FF' },
  rangeChipTxt: { color: '#0A84FF', fontWeight: '700' },
  rangeChipTxtActive: { color: '#fff', fontWeight: '800' },

  lineWrap: { marginTop: 12, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  axisLabel: { fontSize: 12, color: '#6b7280' },

  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 10 },
  btnGhost: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#eee', borderRadius: 8 },
  btnGhostTxt: { fontWeight: '700', color: '#333' },
  btnPrimary: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#0A84FF', borderRadius: 8 },
  btnPrimaryTxt: { fontWeight: '800', color: '#fff' },

  aboutTxt: { color: '#333', marginTop: 6, lineHeight: 18 },
});
