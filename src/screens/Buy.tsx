// src/screens/Buy.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform,
  TextInput, FlatList, TouchableOpacity, Modal, Image, Alert, Dimensions, RefreshControl, BackHandler
} from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useWindowDimensions, InteractionManager } from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline, Line as SvgLine } from 'react-native-svg';

import { getWalletAddress } from '../utils/wallet';
import { getAllWalletAddresses, formatAddressesForTransak } from '../services/MultiCoinWalletService';
import { useAssets } from '../hooks/useAssetsSimplified';
import { useBuyIntent } from '../state/useBuyIntent';
import { useChainStore } from '../store/useChainStore';
import { useWalletStore } from '../store/useWalletStore';
import { useTransactionStore, useTransactions } from '../store/useTransactionStore';
import { prewarmBuySearchCache } from '../prewarm/buySearchWarmup';
import { priceService } from "../services/PriceService";
import { mapTransakNetwork, isNonEvmToken } from '../services/TransakNetworkMapper';
import { TransactionRecord } from '../services/TransactionStorageService';

// ──────────────────────────────────────────────────────────
// Config / types
// ──────────────────────────────────────────────────────────
// CRITICAL: Use environment-aware Transak configuration
// Staging: https://staging-global.transak.com
// Production: https://global.transak.com
const getTransakConfig = () => {
  // Check if we're in production build (EAS sets this)
  const isProduction = process.env.EXPO_PUBLIC_TRANSAK_ENV === 'PRODUCTION' || 
                        (typeof __DEV__ !== 'undefined' && !__DEV__) ||
                        process.env.EAS_BUILD === 'true';
  
  // Allow override via environment variable
  const envOverride = process.env.EXPO_PUBLIC_TRANSAK_ENV?.toUpperCase();
  const useProduction = envOverride === 'PRODUCTION' || (isProduction && envOverride !== 'STAGING');
  
  return {
    apiKey: process.env.EXPO_PUBLIC_TRANSAK_API_KEY || '49362815-1fc8-4dde-ab46-72b51a21aeb3', // Default to staging key
    base: useProduction 
      ? 'https://global.transak.com' 
      : 'https://staging-global.transak.com',
    isStaging: !useProduction,
  };
};

const TRANSAK_CONFIG = getTransakConfig();
const TRANSAK_API_KEY = TRANSAK_CONFIG.apiKey;
const TRANSAK_BASE = TRANSAK_CONFIG.base;

// Simple compatibility helpers
const NON_EVM_SYMBOLS = new Set([
  'BTC','SOL','XRP','ADA','TRX','XLM','DOGE','TON','BCH','LTC','ATOM','XMR','ALGO','DOT','KAS','XRB','NEAR','XTZ'
]);

function isEvmSymbol(sym?: string) {
  const s = (sym || '').toUpperCase();
  if (!s) return false; // unknown → treat as non‑EVM to avoid pre-filling address
  return !NON_EVM_SYMBOLS.has(s);
}

function mapEvmNetwork(symbol?: string, fallback?: string) {
  // Map to Transak's expected network keys
  const s = (symbol || '').toUpperCase();
  switch (s) {
    case 'ETH': return 'ethereum';
    case 'MATIC': return 'polygon';
    case 'USDT': return 'ethereum'; // default to ERC20; Transak UI can allow switching
    case 'USDC': return 'ethereum';
    case 'DAI': return 'ethereum';
    case 'BNB': return 'bsc';
    case 'ETC': return 'ethereum-classic';
    case 'FTM': return 'fantom';
    case 'ARB': return 'arbitrum';
    case 'OP': return 'optimism';
    case 'AVAX': return 'avalanche';
    case 'BASE': return 'base';
    default: return fallback || 'ethereum';
  }
}

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
  contractAddress?: string; product?: 'BUY' | 'SELL'; walletAddressesData?: string;
}) {
  const { address = '', fiatCurrency = 'USD', symbol, network, contractAddress, product = 'BUY', walletAddressesData } = params;

  // Always use the user's wallet address for ALL purchases (user's requirement)
  // Transak will handle address validation and routing for different token types
  const evm = symbol ? isEvmSymbol(symbol) : true; // For network mapping purposes
  const effectiveNetwork = symbol && evm ? mapEvmNetwork(symbol, 'ethereum') : undefined;

  // Parse walletAddressesData to check if we have a non-EVM token address
  // Transak format: {"coins": {"BTC": {"address": "..."}, "ETH": {"address": "..."}}}
  let hasNonEvmAddresses = false;
  if (walletAddressesData) {
    try {
      const addrData = JSON.parse(walletAddressesData);
      // Handle nested structure: {coins: {BTC: {address: "..."}}}
      // Transak official format: {"coins": {"BTC": {"address": "..."}, "ETH": {"address": "..."}}}
      let coins: any;
      if (addrData.coins) {
        // Nested format: {coins: {BTC: {address: "..."}}}
        coins = addrData.coins;
      } else {
        // Flat format (backward compatibility): {BTC: "..."} or {BTC: {address: "..."}}
        coins = addrData;
      }
      const coinKeys = Object.keys(coins || {});
      hasNonEvmAddresses = coinKeys.some(coin => NON_EVM_SYMBOLS.has(coin.toUpperCase()));
    } catch (e) {
      // If parsing fails, assume it's valid format
    }
  }

  // For non-EVM tokens: use walletAddressesData only, don't set walletAddress (which is EVM format)
  // For EVM tokens: use both walletAddress and walletAddressesData
  // If walletAddressesData is provided and no symbol is specified, use walletAddressesData only
  // (let Transak pick the right address based on user's selection)
  const isNonEvmToken = symbol ? NON_EVM_SYMBOLS.has(symbol.toUpperCase()) : false;
  const hasWalletAddressesData = !!walletAddressesData;
  
  // CRITICAL: For non-EVM tokens (BTC, SOL, etc.), DO NOT send walletAddress parameter
  // Transak will reject EVM addresses for non-EVM token purchases
  // If walletAddressesData contains non-EVM addresses, ALWAYS omit walletAddress
  // This prevents Transak from validating EVM address when user selects BTC
  // Only send walletAddress if:
  // 1. We have an address AND
  // 2. (No symbol is selected OR it's an EVM token) AND
  // 3. walletAddressesData doesn't contain non-EVM addresses (critical check)
  const shouldSendWalletAddress = address && 
                                  (!symbol || !isNonEvmToken) && 
                                  (!hasWalletAddressesData || !hasNonEvmAddresses); // If hasNonEvmAddresses is true, always false
  
  const walletAddressToSend = shouldSendWalletAddress ? (address || '') : '';
  
  // CRITICAL: Disable address form when we have walletAddress OR walletAddressesData
  // This prevents Transak from asking user to manually enter their address
  // User's wallet address should ALWAYS be auto-populated from the app
  // For non-EVM tokens, walletAddressesData alone is sufficient
  const disableWalletAddressForm = (walletAddressToSend || hasWalletAddressesData) ? 'true' : 'false';

  // Validate EVM address format only if we're using it
  if (walletAddressToSend && !/^0x[0-9a-fA-F]{40}$/.test(walletAddressToSend)) {
    console.error('Invalid wallet address format for Transak:', walletAddressToSend);
    throw new Error('Invalid wallet address format');
  }

  const p = new URLSearchParams();
  p.set('apiKey', TRANSAK_API_KEY);
  
  // Only set walletAddress if we determined it should be sent
  // (walletAddressToSend is already empty for non-EVM tokens or when walletAddressesData should be used)
  if (walletAddressToSend) {
    p.set('walletAddress', walletAddressToSend);
  }
  
  p.set('defaultFiatCurrency', fiatCurrency);
  // CRITICAL: Set all product-related parameters consistently to ensure correct page loads
  // Transak requires multiple parameters to be consistent to prevent showing wrong page
  p.set('productsAvailed', product);  // Available products (BUY or SELL)
  p.set('defaultProduct', product);   // Default product to show (must match productsAvailed)
  p.set('isBuyOrSell', product);       // Legacy parameter for compatibility
  p.set('defaultFlow', product.toLowerCase()); // Flow type: 'buy' or 'sell'
  p.set('environment', 'STAGING');
  
  // CRITICAL: Set webhook URL for real-time transaction status updates
  // This is the PROPER way to capture transaction completions instead of URL parsing
  const isProduction = process.env.EXPO_PUBLIC_TRANSAK_ENV === 'PRODUCTION';
  const webhookUrl = isProduction 
    ? 'https://your-app.netlify.app/.netlify/functions/transak-webhook'
    : 'https://your-staging-app.netlify.app/.netlify/functions/transak-webhook';
  
  p.set('webhookUrl', webhookUrl);
  
  // Provide multi-coin addresses so Transak can route non-EVM tokens to correct addresses
  // For non-EVM tokens, this is REQUIRED (walletAddress won't be set)
  if (walletAddressesData) {
    p.set('walletAddressesData', walletAddressesData);
  }
  
  // Only set network if explicitly provided and EVM-compatible (otherwise let Transak determine)
  if (network && evm) p.set('network', network);
  p.set('disableWalletAddressForm', disableWalletAddressForm);
  
  // Only set cryptoCurrencyCode if symbol is provided (otherwise let user select in Transak UI)
  if (symbol) p.set('cryptoCurrencyCode', symbol);
  if (contractAddress) p.set('contractAddress', contractAddress);

  const url = `${TRANSAK_BASE}?${p.toString()}`;
  
  // Enhanced logging for debugging BTC purchase issues
  const walletAddressesDataSample = walletAddressesData ? (() => {
    try {
      const parsed = JSON.parse(walletAddressesData);
      return JSON.stringify(parsed).substring(0, 150) + '...';
    } catch {
      return 'invalid-json';
    }
  })() : 'none';
  
  console.log('Generated Transak URL:', {
    hasWalletAddress: !!walletAddressToSend,
    walletAddressSent: walletAddressToSend ? `${walletAddressToSend.substring(0, 10)}...` : 'NONE (correct for BTC)',
    hasWalletAddressesData: !!walletAddressesData,
    walletAddressesDataFormat: walletAddressesDataSample,
    hasNonEvmAddresses,
    shouldSendWalletAddress,
    symbol: symbol || 'none',
    isNonEvmToken: symbol ? NON_EVM_SYMBOLS.has(symbol.toUpperCase()) : false,
    disableWalletForm: disableWalletAddressForm,
    urlPreview: url.substring(0, 200) + '...'
  });
  
  return url;
}

// ──────────────────────────────────────────────────────────
// BUY
// ──────────────────────────────────────────────────────────
const BuyRoute: React.FC<{ defaultFiat?: string }> = ({ defaultFiat }) => {
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const { refresh, forceRefresh } = useAssets();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [showRecentPurchases, setShowRecentPurchases] = useState(true);
  
  // CRITICAL: Get wallet address and fetch recent BUY transactions for display
  const { address } = useWalletStore();
  
  // CRITICAL: Normalize address for consistent lookup
  const normalizedAddress = address ? address.toLowerCase() : null;
  
  // Load transactions first, then use reactive hook
  useEffect(() => {
    if (normalizedAddress) {
      console.log('Buy tab - Loading transactions for Recent Purchases:', normalizedAddress.substring(0, 10) + '...');
      const transactionStore = useTransactionStore.getState();
      transactionStore.loadTransactions(normalizedAddress).then(() => {
        const allTxs = transactionStore.getTransactions(normalizedAddress) || [];
        const buyTxs = allTxs.filter(tx => tx.type === 'BUY');
        console.log('Buy tab - ✅ Transactions loaded:', {
          total: allTxs.length,
          buyCount: buyTxs.length,
          buyIds: buyTxs.map(tx => tx.id).slice(0, 5)
        });
      }).catch(err => {
        console.error('Buy tab - Error loading transactions:', err);
      });
    }
  }, [normalizedAddress]);
  
  // CRITICAL: Use NON-REACTIVE direct store access for Buy tab
  // The reactive useTransactions hook causes infinite loops on Samsung A24 device
  // Use manual subscription instead for full control
  const [recentBuyTransactions, setRecentBuyTransactions] = useState<TransactionRecord[]>([]);
  
  // Load transactions once when address changes
  useEffect(() => {
    if (normalizedAddress) {
      console.log('Buy tab - Loading transactions for Recent Purchases:', normalizedAddress.substring(0, 10) + '...');
      
      // CRITICAL: Use getTransactions (non-reactive) to prevent getSnapshot errors
      const transactionStore = useTransactionStore.getState();
      const buyTxs = transactionStore.getTransactions(normalizedAddress, { type: 'BUY' });
      
      setRecentBuyTransactions(buyTxs);
      console.log('Buy tab - ✅ Transactions loaded:', {
        total: buyTxs.length,
        buyCount: buyTxs.length,
        buyIds: buyTxs.map(tx => tx.id)
      });
    }
  }, [normalizedAddress]);
  
  // CRITICAL: Reload transactions when returning to Buy tab (useFocusEffect)
  // Don't use subscribe - it's a no-op in TransactionStore
  useFocusEffect(
    useCallback(() => {
      if (normalizedAddress) {
        const transactionStore = useTransactionStore.getState();
        const buyTxs = transactionStore.getTransactions(normalizedAddress, { type: 'BUY' });
        setRecentBuyTransactions(buyTxs);
      }
    }, [normalizedAddress])
  );
  
  // Sort and limit to 5 most recent
  const displayedTransactions = useMemo(() => {
    if (!recentBuyTransactions || recentBuyTransactions.length === 0) {
      return [];
    }
    const sorted = [...recentBuyTransactions].sort((a, b) => b.timestamp - a.timestamp);
    return sorted.slice(0, 5);
  }, [recentBuyTransactions.length]); // Depend on length only
  
  useFocusEffect(
    useCallback(() => {
      const locale = Localization.getLocales()[0] || { regionCode: 'US', currencyCode: 'USD' };
      const region = locale.regionCode || 'US';
      const restricted = ['US', 'CA'].includes(region);
      setIsRestricted(restricted);

      // CRITICAL: Only reset URI if it's empty (preserve state across tab visits for instant load)
      // This prevents full reloads on 2nd/3rd/4th visits
      if (!uri) {
        // Generate URL immediately (synchronous) to show webview fast
        getWalletAddress().then(async (addr) => {
        // Set loading AFTER we have address, so we can show URL immediately
        setLoading(true);
        // Removed verbose address logging
        
        if (!addr) {
          console.error('Buy tab - No wallet address found, this indicates mnemonic retrieval failed');
          Alert.alert(
            'Wallet Setup Required', 
            'No wallet address found. Please ensure your wallet is properly set up:\n\n1. Create a new wallet, or\n2. Restore an existing wallet with your 12-word phrase.',
            [
              { text: 'OK', style: 'default' }
            ]
          );
          setLoading(false);
          return;
        }

        // Address validation
        const trimmedAddr = addr.trim();
        
        if (!trimmedAddr || trimmedAddr.length !== 42 || !trimmedAddr.startsWith('0x')) {
          console.error('Buy tab - Invalid wallet address format');
          Alert.alert('Error', `Invalid wallet address format: ${trimmedAddr}. Please check your wallet setup.`);
          setLoading(false);
          return;
        }

        // Additional validation for hex characters
        if (!/^0x[0-9a-fA-F]{40}$/.test(trimmedAddr)) {
          console.error('Buy tab - Invalid wallet address hex format');
          Alert.alert('Error', 'Invalid wallet address format. Please check your wallet setup.');
          setLoading(false);
          return;
        }

        const fiat = defaultFiat || locale.currencyCode || 'USD';
        if (!restricted) {
          try {
            // CRITICAL: Wait for wallet addresses BEFORE setting URL
            // This ensures walletAddress and walletAddressesData are included from the start
            // Prevents Transak from asking user to enter their address
            getAllWalletAddresses().then(async (addrMap) => {
              const wad = formatAddressesForTransak(addrMap);
              
              // CRITICAL: Store walletAddressesData for transaction detection later
              // This allows us to infer BTC purchases when API fails
              setLastWalletAddressesData(wad);

              // CRITICAL: makeTransakUrl will automatically omit walletAddress if walletAddressesData
              // contains non-EVM addresses (like BTC) - this prevents Transak from rejecting the purchase
              // Transak will use the correct address from walletAddressesData based on selected token
              const initialUrl = makeTransakUrl({ 
                address: trimmedAddr, // Will be omitted by makeTransakUrl if non-EVM addresses present
                fiatCurrency: fiat, 
                product: 'BUY',
                walletAddressesData: wad, // Includes both EVM and non-EVM addresses (REQUIRED)
              });
              setUri(initialUrl);
              setLoading(false); // Show webview with addresses already included
              
              // Try session creation in background (non-blocking)
              try {
                // CRITICAL: Check if walletAddressesData contains non-EVM addresses (BTC, SOL, etc.)
                // If it does, DO NOT include walletAddress in session params
                // Transak will reject EVM addresses for BTC purchases - it will use walletAddressesData instead
                let shouldIncludeWalletAddress = true;
                try {
                  const addrData = typeof wad === 'string' ? JSON.parse(wad) : wad;
                  // Handle nested structure: {coins: {BTC: {address: "..."}}}
                  // Transak official format: {"coins": {"BTC": {"address": "..."}}}
                  let coins: any;
                  if (addrData.coins) {
                    coins = addrData.coins; // Nested format
                  } else {
                    coins = addrData; // Flat format (backward compatibility)
                  }
                  const coinKeys = Object.keys(coins || {});
                  const hasNonEvm = coinKeys.some(coin => NON_EVM_SYMBOLS.has(coin.toUpperCase()));
                  // If we have non-EVM addresses (BTC, SOL), omit walletAddress
                  // Transak will use the correct address from walletAddressesData
                  shouldIncludeWalletAddress = !hasNonEvm;
                } catch (e) {
                  // If parsing fails, include walletAddress as fallback
                  shouldIncludeWalletAddress = true;
                }
                
                const widgetParams: any = {
                  defaultFlow: 'buy',
                  productsAvailed: 'BUY',
                  defaultProduct: 'BUY',
                  isBuyOrSell: 'BUY',
                  defaultFiatCurrency: fiat,
                  walletAddressesData: wad, // ALWAYS include - contains addresses for all token types
                  disableWalletAddressForm: true, // CRITICAL: Prevent user from entering address
                };
                
                // Only include walletAddress if we don't have non-EVM addresses
                // This prevents Transak from rejecting BTC purchases
                if (shouldIncludeWalletAddress && trimmedAddr) {
                  widgetParams.walletAddress = trimmedAddr;
                }

                // Build function URL(s). In dev, CLI quirks may require fallback to /create-transak-session
                const devServerIp = process.env.EXPO_PUBLIC_NETLIFY_DEV_IP || 'localhost';
                const primaryUrl = __DEV__
                  ? `http://${devServerIp}:8888/.netlify/functions/create-transak-session`
                  : 'https://cryptopal.app/.netlify/functions/create-transak-session';
                const fallbackUrl = __DEV__
                  ? `http://${devServerIp}:8888/create-transak-session`
                  : primaryUrl;

                // Try session creation with 2-second timeout (non-blocking) and dev fallback
                const attemptFetch = (url: string) => fetch(url, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ widgetParams }),
                });
                
                const timeoutPromise = new Promise<Response>((_, reject) => 
                  setTimeout(() => reject(new Error('Session creation timeout')), 2000)
                );
                
                let res: Response;
                try {
                  res = await Promise.race([attemptFetch(primaryUrl), timeoutPromise]);
                } catch (e) {
                  if (__DEV__) {
                    // Retry with fallback path without /.netlify/functions/ (CLI quirk on some setups)
                    res = await Promise.race([attemptFetch(fallbackUrl), timeoutPromise]);
                  } else {
                    throw e;
                  }
                }
                if (res.ok) {
                  const { sessionId } = await res.json();
                  const base = TRANSAK_BASE;
                  const sessionUrl = `${base}?apiKey=${TRANSAK_API_KEY}&sessionId=${encodeURIComponent(sessionId)}`;
                  // Upgrade to session-based URL if successful
                  setUri(sessionUrl);
                }
              } catch (err: any) {
                // Silent failure - URL params already set, so webview is working
                console.warn('Buy tab - Session creation failed, using URL params (non-blocking)');
              }
            }).catch((e) => {
              // Fallback if getAllWalletAddresses fails
              console.warn('Buy tab - Could not derive multi-coin addresses, proceeding with EVM only');
              const url = makeTransakUrl({ address: trimmedAddr, fiatCurrency: fiat, product: 'BUY' });
              setUri(url);
              setLoading(false);
            });
        } catch (error: any) {
          // Outer catch - ensure we always have a URL
          console.warn('Buy tab - Error in buy flow, using URL params');
          const url = makeTransakUrl({ 
            address: trimmedAddr, 
            fiatCurrency: fiat, 
            product: 'BUY'
          });
          setUri(url);
          setLoading(false);
        }
        } // Close if (!restricted) block

        const intent = popBuyIntent();
        if (!restricted && intent?.symbol) {
          try {
            getAllWalletAddresses().then(async (addrMap) => {
              const wad = formatAddressesForTransak(addrMap);
              try {
                const widgetParams: any = {
                  // CRITICAL: All product parameters must be set consistently for BUY
                  defaultFlow: 'buy',
                  productsAvailed: 'BUY',  // Only BUY available
                  defaultProduct: 'BUY',   // Default to BUY
                  isBuyOrSell: 'BUY',      // Legacy compatibility
                  defaultFiatCurrency: fiat,
                  walletAddressesData: wad,
                  disableWalletAddressForm: true,
                  cryptoCurrencyCode: intent.symbol,
                };
                if (intent.network) widgetParams.network = intent.network;
                if ((intent as any).fiatAmount) widgetParams.fiatAmount = (intent as any).fiatAmount;

                // Use absolute URL for Netlify function with dev fallback path
                const devServerIp = process.env.EXPO_PUBLIC_NETLIFY_DEV_IP || 'localhost';
                const primaryUrl = __DEV__
                  ? `http://${devServerIp}:8888/.netlify/functions/create-transak-session`
                  : 'https://cryptopal.app/.netlify/functions/create-transak-session';
                const fallbackUrl = __DEV__
                  ? `http://${devServerIp}:8888/create-transak-session`
                  : primaryUrl;

                console.log('Buy tab - Creating intent session via:', primaryUrl);
                let res = await fetch(primaryUrl, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ widgetParams }),
                });
                if (!res.ok) {
                  if (__DEV__) {
                    // Retry with fallback path
                    console.log('Buy tab - Primary function path failed, trying fallback path');
                    res = await fetch(fallbackUrl, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ widgetParams }),
                    });
                  }
                  if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(`create-transak-session HTTP ${res.status}: ${txt}`);
                  }
                }
                const { sessionId } = await res.json();
                const base = 'https://global-stg.transak.com';
                const u = `${base}?apiKey=${TRANSAK_API_KEY}&sessionId=${encodeURIComponent(sessionId)}`;
                console.log('Buy tab - Intent Session URL:', u);
                setUri(u);
              } catch (err: any) {
                console.warn('Buy tab - Intent session failed, falling back to URL params:', err?.message);
                const u = makeTransakUrl({ address: addr, fiatCurrency: fiat, symbol: intent.symbol, network: intent.network || 'mainnet', contractAddress: intent.contractAddress, product: 'BUY', walletAddressesData: wad });
                setUri(u);
              }
            }).catch((e) => {
              console.warn('Buy tab - Could not derive multi-coin addresses for intent, proceeding EVM only:', e?.message);
              const u = makeTransakUrl({ address: addr, fiatCurrency: fiat, symbol: intent.symbol, network: intent.network || 'mainnet', contractAddress: intent.contractAddress, product: 'BUY' });
              setUri(u);
            });
          } catch (error: any) {
            console.error('Buy tab - Error creating Transak session for intent:', error);
          }
        }
      }).catch((error: any) => {
        console.error('Buy tab - Error getting wallet address:', error);
        Alert.alert('Error', 'Failed to get wallet address: ' + (error?.message || 'Unknown error'));
        setLoading(false);
      });
      } else {
        // URI already exists - just ensure loading is false for instant display
        setLoading(false);
      }
    }, [defaultFiat, uri]) // Include uri in dependencies
  );

  // Track if we're in a Transak session to enable polling
  const [isTransakSession, setIsTransakSession] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string>('');
  const [lastWalletAddressesData, setLastWalletAddressesData] = useState<string>(''); // Store for transaction detection
  
  // CRITICAL: Track processed orderIds to prevent duplicate transaction creation
  // This prevents multiple transactions from being created when navigating through multiple completion pages
  // CRITICAL: Reset on component unmount to allow re-capture if app is restarted
  const processedOrderIdsRef = useRef<Set<string>>(new Set());
  const transactionCaptureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savingTransactionRef = useRef<Set<string>>(new Set()); // Track transactions currently being saved to prevent duplicates
  
  // CRITICAL: Clear processed orderIds on mount to allow transaction capture after app restart
  // BUT: Don't clear on every mount - use persistent storage to prevent duplicates across sessions
  useEffect(() => {
    // Check AsyncStorage for persistent processed orderIds (prevents duplicates across app restarts)
    AsyncStorage.getItem('crypto_pal_processed_order_ids').then(stored => {
      if (stored) {
        try {
          const storedArray = JSON.parse(stored) as string[];
          const storedSet = new Set<string>(storedArray);
          processedOrderIdsRef.current = storedSet;
          console.log(`Buy tab - 🔄 Loaded ${storedSet.size} processed orderIds from persistent storage`);
        } catch (e) {
          console.warn('Buy tab - Error loading processed orderIds:', e);
        }
      }
    });
    
    return () => {
      // Save processed orderIds to persistent storage on unmount
      if (processedOrderIdsRef.current.size > 0) {
        AsyncStorage.setItem('crypto_pal_processed_order_ids', JSON.stringify(Array.from(processedOrderIdsRef.current))).catch(() => {});
      }
      if (transactionCaptureTimeoutRef.current) {
        clearTimeout(transactionCaptureTimeoutRef.current);
      }
    };
  }, []);
  
  const handleNavigationChange = async (navState: { url: string; canGoBack?: boolean }) => {
    const url = navState.url;
    console.log('Buy tab - Navigation change:', url);
    
    // Track current URL and back button state for navigation
    setCurrentUrl(url);
    if (navState.canGoBack !== undefined) {
      setCanGoBack(navState.canGoBack);
    }
    
    // Check if we're in a Transak session
    const isTransakUrl = url.includes('transak.com') || 
                        url.includes('global-stg.transak.com') ||
                        url.includes('global.transak.com');
    
    if (isTransakUrl && !isTransakSession) {
      setIsTransakSession(true);
      console.log('Buy tab - Transak session started, enabling completion monitoring');
    }
    
    // CRITICAL: Enhanced order ID extraction - try multiple sources
    // 1. URL parameters (most reliable)
    // 2. URL path (e.g., /order/xxx)
    // 3. DOM extraction (if WebView allows)
    // 4. Last known orderId (fallback)
    const orderIdPatterns = [
      /[\?&]orderId=([a-f0-9-]{8}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{12})/i, // UUID format in query
      /[\?&#]orderId=([a-f0-9-]{8}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{12})/i, // UUID in hash
      /[\?&]order_id=([a-f0-9-]{8}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{12})/i, // order_id format
      /order\/([a-f0-9-]{8}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{12})/i, // Path-based UUID
      /user\/order\/([a-f0-9-]{8}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{12})/i, // User order path
      /[\?&]order=([a-f0-9-]{8}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{12})/i, // order parameter
      /#orderId=([a-f0-9-]{8}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{4}-[a-f0-9-]{12})/i, // Hash fragment UUID
    ];
    
    let extractedOrderId = '';
    for (const pattern of orderIdPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const potentialOrderId = match[1].trim();
        // CRITICAL: Validate it's NOT the API key before using it
        // Also validate it's a proper UUID format (8-4-4-4-12)
        const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (uuidPattern.test(potentialOrderId) && 
            potentialOrderId !== TRANSAK_API_KEY && 
            potentialOrderId !== '49362815-1fc8-4dde-ab46-72b51a21aeb3') {
          extractedOrderId = potentialOrderId;
          setLastOrderId(extractedOrderId);
          console.log(`Buy tab - ✅ Extracted valid orderId: ${extractedOrderId} (validated UUID format)`);
          break;
        } else {
          console.warn(`Buy tab - ⚠️ Skipping extraction - matched API key or invalid format: ${potentialOrderId.substring(0, 20)}...`);
        }
      }
    }
    
    // CRITICAL: If no orderId in URL, try to extract from WebView DOM (if available)
    // This is important for wallet-confirm and other pages that don't have orderId in URL
    if (!extractedOrderId && webViewRef.current) {
      // Try JavaScript injection to extract orderId from DOM
      try {
        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              // Try multiple selectors for orderId in DOM
              const orderIdSelectors = [
                '[data-order-id]',
                '[data-orderid]',
                '.order-id',
                '.orderId',
                '#orderId',
                '#order-id',
                'input[name="orderId"]',
                'input[name="order-id"]',
                '[data-transaction-id]'
              ];
              
              for (const selector of orderIdSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                  const value = element.value || element.textContent || element.getAttribute('data-order-id') || element.getAttribute('data-orderid');
                  if (value && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.trim())) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ORDER_ID_EXTRACTED', orderId: value.trim() }));
                    return;
                  }
                }
              }
              
              // Try to extract from URL in current page
              const urlParams = new URLSearchParams(window.location.search);
              const hashParams = new URLSearchParams(window.location.hash.substring(1));
              const orderId = urlParams.get('orderId') || urlParams.get('order_id') || hashParams.get('orderId') || hashParams.get('order_id');
              if (orderId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(orderId.trim())) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ORDER_ID_EXTRACTED', orderId: orderId.trim() }));
              }
            } catch (e) {
              // Silent fail - DOM extraction is optional
            }
          })();
          true; // Required for injectJavaScript
        `);
      } catch (e) {
        // Silent fail - DOM extraction is optional
      }
    }
    
    const orderId = extractedOrderId || lastOrderId; // Use extracted or fallback to last known
    
    // CRITICAL: EXPANDED completion detection for ALL Transak transaction scenarios
    // Research shows Transak uses multiple different URL patterns for different tokens/networks
    const redirectPatterns = [
      'https://cryptopal.app/transak/return',
      'https://www.cryptopal.app/transak/return',
    ];
    
    // CRITICAL: More restrictive completion detection - only ACTUAL completion pages
    // KEY INSIGHT: wallet-confirm is just a confirmation step, NOT actual completion
    // We need to wait for pages with orderId or specific completion indicators
    const hasOrderIdInUrl = /[?&]orderId=/i.test(url) || /[?&]order_id=/i.test(url) || /[?&]order=/i.test(url);
    const isLoginOrKyc = url.includes('login') || url.includes('kyc') || url.includes('otp') || url.includes('email');
    const isInitialFlow = url.includes('/buy') || url.includes('/sell') || url.includes('/home');
    
    // CRITICAL: Completion detection - wallet-confirm IS a completion page for many tokens
    // Research shows: wallet-confirm is the actual completion page for many Transak flows
    // We should capture transactions on wallet-confirm, but try to extract orderId from DOM if not in URL
    const isTransactionComplete = isTransakUrl && !isLoginOrKyc && !isInitialFlow && (
      // HIGH CONFIDENCE: Pages with orderId parameter (definitive completion indicator)
      hasOrderIdInUrl ||
      
      // HIGH CONFIDENCE: wallet-confirm IS a completion page (capture it!)
      // This is the actual completion page for many tokens/networks
      url.includes('wallet-confirm') ||
      
      // HIGH CONFIDENCE: Explicit completion/success pages
      url.includes('paymentstatus') ||
      url.includes('payment-status') ||
      url.includes('user/paymentstatus') ||
      url.includes('user/payment-status') ||
      url.includes('order-success') ||
      url.includes('payment-success') ||
      url.includes('transaction-success') ||
      url.includes('purchase-complete') ||
      url.includes('crypto-purchase-complete') ||
      url.includes('order-complete') ||
      
      // HIGH CONFIDENCE: Thank you pages (actual completion)
      url.includes('thankyou') ||
      url.includes('thank-you') ||
      
      // HIGH CONFIDENCE: Order pages with path-based orderId
      (url.includes('order/') && /order\/[a-f0-9-]+/i.test(url)) ||
      (url.includes('user/order/') && /user\/order\/[a-f0-9-]+/i.test(url)) ||
      
      // MEDIUM CONFIDENCE: Completion keywords
      url.includes('completed') ||
      (url.includes('complete') && !url.includes('confirm-order')) ||
      url.includes('sent-to-your-wallet') ||
      url.includes('crypto-sent') ||
      
      // MEDIUM CONFIDENCE: Status pages with parameters
      (url.includes('status') && /[?&]status=/i.test(url)) ||
      
      // LOW CONFIDENCE: Custom redirect patterns (only if orderId present)
      (redirectPatterns.some((p) => url.startsWith(p)) && (orderId || hasOrderIdInUrl))
    );
    
    // CRITICAL: If on wallet-confirm without orderId, try DOM extraction FIRST
    // wallet-confirm is a completion page, so we should capture it
    // But try to get orderId from DOM if not in URL
    // CRITICAL: For BTC and other non-EVM tokens, wallet-confirm often doesn't have orderId in URL
    // We need to wait a bit for DOM extraction to complete before capturing
    if (url.includes('wallet-confirm') && !orderId && !hasOrderIdInUrl) {
      console.log('Buy tab - ⏳ wallet-confirm page detected but no orderId in URL - trying DOM extraction');
      console.log('Buy tab - ⏳ Waiting 2 seconds for DOM extraction to find orderId (BTC/non-EVM tokens)');
      
      // For BTC/non-EVM tokens, wait a bit longer for DOM extraction
      // This ensures we capture the orderId before saving transaction
      setTimeout(() => {
        // Check if orderId was extracted by DOM handler
        const extractedOrderId = lastOrderId;
        if (extractedOrderId && extractedOrderId.trim() !== '') {
          console.log(`Buy tab - ✅ OrderId extracted from DOM after delay: ${extractedOrderId}`);
          // Trigger capture with extracted orderId
          handleNavigationChange({ url: currentUrl, canGoBack });
        } else {
          console.log('Buy tab - ⏳ Still no orderId after DOM extraction delay - proceeding with save anyway');
          // Proceed with transaction capture even without orderId - URL inference will provide tokenSymbol
        }
      }, 2000); // Wait 2 seconds for DOM extraction
      
      // Don't return early - let the completion detection proceed after delay
    }
    
    
        console.log('Buy tab - ENHANCED Transaction detection:', {
      url: url.substring(0, 150) + '...',
      isTransakUrl,
      isTransactionComplete,
      hasOrder: url.includes('order/'),
      hasPaymentStatus: url.includes('paymentstatus'),
      hasOrderId: /[?&]orderId=/i.test(url),
      hasSuccess: url.includes('success'),
      hasComplete: url.includes('complete'),
      hasConfirm: url.includes('confirm'),
      hasThankyou: url.includes('thankyou'),
      extractedOrderId: extractedOrderId || 'none',
      lastOrderId: lastOrderId || 'none',
      orderId: orderId || 'none',
      note: 'Enhanced detection covers ALL transaction scenarios - not just completion pages'
    });
    
    if (isTransactionComplete) {
      console.log(`Buy tab - 🔔 TRANSACTION COMPLETION DETECTED! URL: ${url.substring(0, 150)}`);
      
      // CRITICAL: Prevent duplicate transaction creation for the same orderId
      // Check if we've already processed this orderId in this session
      if (orderId && processedOrderIdsRef.current.has(orderId)) {
        console.log(`Buy tab - ⚠️ OrderId ${orderId} already processed - skipping duplicate transaction capture`);
        return; // Exit early - transaction already captured
      }
      
      console.log(`Buy tab - 🎯 PROCEEDING WITH TRANSACTION CAPTURE - orderId: ${orderId || 'NONE (will try DOM extraction)'}`);
      console.log(`Buy tab - Completion indicators:`, {
        hasOrderIdInUrl,
        isWalletConfirm: url.includes('wallet-confirm'),
        isPaymentStatus: url.includes('paymentstatus'),
        orderId: orderId || 'NONE',
        note: 'wallet-confirm is a valid completion page - capturing transaction'
      });
      console.log(`Buy tab - processedOrderIds size: ${processedOrderIdsRef.current.size}, has this orderId: ${orderId ? processedOrderIdsRef.current.has(orderId) : 'N/A'}`);
      
      // CRITICAL: Debounce transaction capture to prevent multiple rapid saves
      // Clear any existing timeout
      if (transactionCaptureTimeoutRef.current) {
        clearTimeout(transactionCaptureTimeoutRef.current);
        console.log(`Buy tab - 🔄 Cleared existing capture timeout`);
      }
      
      // CRITICAL: Check if orderId already processed BEFORE setting timeout
      // This prevents race conditions from multiple navigation events
      const finalOrderIdCheck = orderId || lastOrderId || '';
      if (finalOrderIdCheck && processedOrderIdsRef.current.has(finalOrderIdCheck)) {
        console.log(`Buy tab - ⚠️ OrderId ${finalOrderIdCheck} already processed - skipping duplicate capture`);
        return; // Exit early - already processed
      }
      
      // Set timeout to capture transaction after a short delay
      // This ensures we wait for WebView extraction and prevents rapid-fire saves
      // CRITICAL: Increased delay to 2 seconds to ensure DOM extraction completes for BTC/non-EVM tokens
      console.log(`Buy tab - ⏱️ Setting timeout to capture transaction in 2000ms (increased for BTC/non-EVM DOM extraction)...`);
      transactionCaptureTimeoutRef.current = setTimeout(async () => {
        console.log(`Buy tab - 🎬 TIMEOUT TRIGGERED - Starting transaction capture...`);
        
        // CRITICAL: Use orderId from URL or DOM extraction (lastOrderId)
        const finalOrderId = orderId || lastOrderId || '';
        
        // Double-check orderId wasn't processed while waiting
        if (finalOrderId && processedOrderIdsRef.current.has(finalOrderId)) {
          console.log(`Buy tab - ⚠️ OrderId ${finalOrderId} was processed during debounce - skipping duplicate`);
          return;
        }
        
        // Mark orderId as processed BEFORE capturing to prevent race conditions
        // CRITICAL: Also persist to AsyncStorage immediately to prevent duplicates across app restarts
        if (finalOrderId) {
          processedOrderIdsRef.current.add(finalOrderId);
          // Persist immediately to prevent duplicates
          AsyncStorage.setItem('crypto_pal_processed_order_ids', JSON.stringify(Array.from(processedOrderIdsRef.current))).catch(() => {});
          console.log(`Buy tab - 📝 Marking orderId ${finalOrderId} as processed (total processed: ${processedOrderIdsRef.current.size})`);
        } else {
          console.log(`Buy tab - ⚠️ NO ORDERID - proceeding with transaction capture anyway (will use URL inference for tokenSymbol)`);
        }
        
        console.log('Buy tab - Transaction completed, refreshing assets...');
        
        // CRITICAL: Stop the spinner immediately when transaction completes
        setLoading(false);
        
        // CRITICAL: TransactionStore handles notifications automatically - no flag needed!
        // Wallet tab will auto-update via useAssets hook which reads from TransactionStore
        
        // Immediately clear cache and trigger multiple refreshes to ensure update
        try {
          const { address } = useWalletStore.getState();
          if (address) {
            const cacheKey = `crypto_pal_assets_cache:${address}`;
            await AsyncStorage.removeItem(cacheKey);
            console.log('Buy tab - Cleared asset cache immediately');
          }
        } catch (e) {
          console.error('Buy tab - Error clearing cache:', e);
        }
        
        // Immediate refresh (cache already cleared)
        console.log('Buy tab - Triggering immediate refresh...');
        forceRefresh().catch(e => console.error('Buy tab - Immediate refresh error:', e));
        
        // CRITICAL: Multiple refreshes with increasing delays to catch blockchain propagation
        // Non-EVM tokens (BTC, SOL) may take longer to appear on-chain
        const refreshDelays = [5000, 15000, 45000, 90000]; // 5s, 15s, 45s, 90s (increased for non-EVM)
        refreshDelays.forEach((delay, index) => {
          setTimeout(async () => {
            console.log(`Buy tab - Force refresh attempt ${index + 1} after ${delay}ms...`);
            try {
              await forceRefresh();
              console.log(`Buy tab - Assets refreshed after ${delay}ms`);
            } catch (e) {
              console.error(`Buy tab - Refresh attempt ${index + 1} error:`, e);
            }
          }, delay);
        });
        
        // CRITICAL: Wait briefly for WebView extraction before saving transaction
        // This allows DOM extraction to find cryptoCurrency if URL parsing failed
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for WebView extraction
      
      // Capture the buy transaction using TransactionStore (single source of truth)
      try {
        const transactionStore = useTransactionStore.getState();
        
        // Use orderId extracted earlier (already includes all patterns including orderId=)
        // Don't re-extract - use the value from line 971
        
        // Parse URL parameters to extract transaction data
        const urlParams = new URLSearchParams(url.split('?')[1] || '');
        const transactionHash = urlParams.get('transactionHash') || urlParams.get('txHash') || '';
        
        // CRITICAL: Extract token symbol from URL params, intent, hash fragment, and URL patterns
        // Priority order: URL params > hash fragment > intent > URL patterns
        let tokenSymbol = urlParams.get('tokenSymbol') || 
                         urlParams.get('cryptoCurrency') || 
                         urlParams.get('cryptoCurrencyCode') ||
                         urlParams.get('crypto') ||
                         urlParams.get('symbol') ||
                         '';
        
        // Also check URL hash fragment
        if (!tokenSymbol) {
          try {
            const hashParams = new URLSearchParams(url.split('#')[1] || '');
            tokenSymbol = hashParams.get('cryptoCurrency') || 
                         hashParams.get('cryptoCurrencyCode') ||
                         hashParams.get('tokenSymbol') ||
                         '';
          } catch (e) {
            // Silent fail - hash parsing is optional
          }
        }
        
        // If no symbol in URL, check if we have an intent (from Search tab)
        if (!tokenSymbol) {
          const intent = popBuyIntent();
          tokenSymbol = intent?.symbol || '';
        }
        
        // Try to infer from URL patterns (comprehensive - covers ALL major tokens)
        if (!tokenSymbol) {
          const urlLower = url.toLowerCase();
          const networkParam = urlParams.get('network') || '';
          
          if (urlLower.includes('ethereum') || urlLower.includes('eth') || urlLower.includes('network=ethereum') || urlLower.includes('network=sepolia') || networkParam.toLowerCase().includes('ethereum') || networkParam.toLowerCase().includes('sepolia')) {
            tokenSymbol = 'ETH';
          } else if (urlLower.includes('bitcoin') || urlLower.includes('btc') || urlLower.includes('network=bitcoin') || networkParam.toLowerCase().includes('bitcoin') || networkParam.toLowerCase().includes('btc')) {
            tokenSymbol = 'BTC';
          } else if (urlLower.includes('polygon') || urlLower.includes('matic') || urlLower.includes('network=polygon') || networkParam.toLowerCase().includes('polygon') || networkParam.toLowerCase().includes('matic')) {
            tokenSymbol = 'MATIC';
          } else if (urlLower.includes('binance') || urlLower.includes('bnb') || urlLower.includes('network=binance') || networkParam.toLowerCase().includes('binance') || networkParam.toLowerCase().includes('bnb')) {
            tokenSymbol = 'BNB';
          } else if (urlLower.includes('ripple') || urlLower.includes('xrp') || urlLower.includes('xrpl') || urlLower.includes('network=xrp') || networkParam.toLowerCase().includes('xrp') || networkParam.toLowerCase().includes('ripple')) {
            tokenSymbol = 'XRP';
          } else if (urlLower.includes('stellar') || urlLower.includes('xlm') || urlLower.includes('network=stellar') || networkParam.toLowerCase().includes('stellar') || networkParam.toLowerCase().includes('xlm')) {
            tokenSymbol = 'XLM';
          } else if (urlLower.includes('cardano') || urlLower.includes('ada') || urlLower.includes('network=cardano') || networkParam.toLowerCase().includes('cardano') || networkParam.toLowerCase().includes('ada')) {
            tokenSymbol = 'ADA';
          } else if (urlLower.includes('tron') || urlLower.includes('trx') || urlLower.includes('network=tron') || networkParam.toLowerCase().includes('tron') || networkParam.toLowerCase().includes('trx')) {
            tokenSymbol = 'TRX';
          } else if (urlLower.includes('solana') || urlLower.includes('sol') || urlLower.includes('network=solana') || networkParam.toLowerCase().includes('solana') || networkParam.toLowerCase().includes('sol')) {
            tokenSymbol = 'SOL';
          }
        }
        
        // Log what we extracted
        console.log('Buy tab - Token symbol extraction:', {
          fromUrlParams: !!urlParams.get('cryptoCurrency') || !!urlParams.get('cryptoCurrencyCode'),
          fromHash: false, // Will be checked above
          fromIntent: false, // Will be checked above  
          fromPatterns: false, // Will be checked above
          finalTokenSymbol: tokenSymbol || '(not found)',
          url: url.substring(0, 200)
        });
        
        // Parse amounts with validation to prevent NaN
        // Try multiple parameter names that Transak might use
        let tokenAmount = urlParams.get('tokenAmount') || 
                         urlParams.get('cryptoAmount') || 
                         urlParams.get('cryptoCurrencyAmount') ||
                         urlParams.get('amount') ||
                         urlParams.get('cryptoCurrencyValue') ||
                         '';
        let currencyAmount = urlParams.get('currencyAmount') || 
                            urlParams.get('fiatAmount') || 
                            urlParams.get('fiatCurrencyAmount') ||
                            urlParams.get('fiatValue') ||
                            urlParams.get('totalAmount') ||
                            '';
        
        // Also try to extract from URL hash or query string patterns
        // Transak sometimes puts order data in the hash fragment or path
        try {
          // Try hash fragment
          const hashMatch = url.match(/[#&](amount|cryptoAmount|tokenAmount|cryptoCurrencyValue)=([^&]+)/i);
          if (hashMatch && !tokenAmount) {
            tokenAmount = decodeURIComponent(hashMatch[2]);
          }
          const fiatMatch = url.match(/[#&](fiatAmount|currencyAmount|fiatValue|totalAmount)=([^&]+)/i);
          if (fiatMatch && !currencyAmount) {
            currencyAmount = decodeURIComponent(fiatMatch[2]);
          }
          
          // Try extracting from URL path (e.g., /order/xxx?amount=123)
          const pathAmountMatch = url.match(/[?&](cryptoAmount|tokenAmount|amount)=([^&]+)/i);
          if (pathAmountMatch && !tokenAmount) {
            tokenAmount = decodeURIComponent(pathAmountMatch[2]);
          }
          const pathFiatMatch = url.match(/[?&](fiatAmount|currencyAmount|totalAmount)=([^&]+)/i);
          if (pathFiatMatch && !currencyAmount) {
            currencyAmount = decodeURIComponent(pathFiatMatch[2]);
          }
        } catch (e) {
          // Silent fail - URL parsing is best effort
        }
        
        // Validate and clean amounts (remove any non-numeric characters except decimal point)
        if (tokenAmount) {
          const cleaned = tokenAmount.replace(/[^\d.]/g, '');
          tokenAmount = cleaned && !isNaN(parseFloat(cleaned)) ? cleaned : '';
        }
        if (currencyAmount) {
          const cleaned = currencyAmount.replace(/[^\d.]/g, '');
          currencyAmount = cleaned && !isNaN(parseFloat(cleaned)) ? cleaned : '';
        }
        
        // CRITICAL: If amounts are still missing, try to estimate from common patterns
        // This ensures History tab always shows some amount even if URL parsing fails
        if (!tokenAmount && currencyAmount) {
          let tokenPriceEstimate = 2500; // Default to ETH
          if (tokenSymbol === 'BTC') {
            tokenPriceEstimate = 60000; // Approximate BTC price for estimation
          } else if (tokenSymbol === 'ETH') {
            tokenPriceEstimate = 2500; // Approximate ETH price for estimation
          } else if (tokenSymbol === 'MATIC') {
            tokenPriceEstimate = 0.7; // Approximate MATIC price
          } else if (tokenSymbol === 'USDC' || tokenSymbol === 'USDT' || tokenSymbol === 'DAI') {
            tokenPriceEstimate = 1; // Stablecoins
          }
          
          const estAmount = parseFloat(currencyAmount) / tokenPriceEstimate;
          if (!isNaN(estAmount) && estAmount > 0) {
            // Use appropriate decimals: BTC=8, ETH=18, stablecoins=6
            const decimals = tokenSymbol === 'BTC' ? 8 : 
                           (tokenSymbol === 'USDC' || tokenSymbol === 'USDT' || tokenSymbol === 'DAI') ? 6 : 18;
            tokenAmount = estAmount.toFixed(decimals);
            console.log(`Buy tab - Estimated ${tokenSymbol} amount: ${tokenAmount} from ${currencyAmount}`);
          }
        }
        
        const locale = Localization.getLocales()[0] || { currencyCode: 'USD' };
        const currencySymbol = urlParams.get('currencySymbol') || 
                              urlParams.get('fiatCurrency') || 
                              locale.currencyCode || 
                              'USD';
        
        console.log('Buy tab - Parsed transaction data:', {
          orderId: orderId || '(empty)',
          transactionHash: transactionHash || '(empty)',
          tokenSymbol: tokenSymbol || '(empty)',
          tokenAmount: tokenAmount || '(empty)',
          currencyAmount: currencyAmount || '(empty)',
          currencySymbol: currencySymbol || '(empty)',
          originalUrl: url,
          note: 'If orderId is present, Transak API will be called to fetch complete details'
        });
        
        // Use the actual transaction data from the completed purchase
        const buyData = {
          tokenSymbol: tokenSymbol,
          tokenAmount: tokenAmount,
          currencyAmount: currencyAmount,
          currencySymbol: currencySymbol,
          transactionHash: transactionHash || '', // Keep empty if not available, don't use orderId as hash
          orderId: orderId, // Store orderId separately for API fetching
          status: 'COMPLETED' as const
        };
        
        // Get wallet address
        console.log(`Buy tab - 🔍 Getting wallet address for transaction save...`);
        const walletAddress = await getWalletAddress();
        console.log(`Buy tab - 📍 Wallet address retrieved: ${walletAddress || 'NONE!'}`);
        
        // CRITICAL: If no wallet address, transaction cannot be saved
        if (!walletAddress || walletAddress.trim() === '') {
          console.error(`Buy tab - ❌ CRITICAL: No wallet address - transaction CANNOT be saved!`);
          console.error(`Buy tab - This transaction will be LOST: orderId=${orderId}, tokenSymbol=${tokenSymbol}`);
          return; // Exit - cannot save without wallet address
        }
        
        // CRITICAL: Use generic network mapper instead of hardcoded token checks
        // This works for ALL tokens (XRP, BTC, ETH, MATIC, etc.) - no special cases needed
        const isStaging = TRANSAK_BASE.includes('staging') || TRANSAK_BASE.includes('stg');
        const networkParam = urlParams.get('network') || '';
        
        // CRITICAL: If tokenSymbol is STILL empty, try to infer from URL patterns FIRST, then walletAddressesData
        // URL patterns are MOST RELIABLE - check them FIRST
        // BUT: walletAddressesData check MUST happen BEFORE network mapping to prevent BTC from being saved as ETH
        // CRITICAL: DO NOT infer if we have an orderId - API is the only reliable source
        if ((!tokenSymbol || tokenSymbol.trim() === '') && (!orderId || orderId.trim() === '')) {
          // PRIORITY 1: Use comprehensive network/token inference for ALL Transak-supported tokens
          // This uses the same logic as TransakNetworkMapper to ensure consistency
          const networkParam = urlParams.get('network') || urlParams.get('networkName') || '';
          const urlLower = url.toLowerCase();
          const networkParamLower = networkParam.toLowerCase();
          
          // Use mapTransakNetwork for inference - handles ALL tokens consistently
          const inferredNetwork = mapTransakNetwork(networkParam || '', '', isStaging);
          
          // If network mapping gives us a non-EVM token, use that
          if (!inferredNetwork.isEvm && inferredNetwork.chainId !== 1 && inferredNetwork.chainId !== 11155111) {
            // Map chainId to token symbol
            const chainIdToToken: Record<number, string> = {
              0: 'BTC',
              999999: 'SOL',
              999998: 'XRP',
              999997: 'XLM',
              999996: 'ADA',
              999995: 'TRX',
              999994: 'DOGE',
              999993: 'LTC',
              999992: 'BCH',
              999991: 'ATOM',
              999990: 'DOT',
              999989: 'NEAR',
              999988: 'ALGO',
              999987: 'XTZ',
              999986: 'TON',
            };
            tokenSymbol = chainIdToToken[inferredNetwork.chainId] || '';
            if (tokenSymbol) {
              console.log(`Buy tab - Inferred ${tokenSymbol} from network mapping (non-EVM)`);
            }
          }
          
          // If still no token, try URL patterns (enhanced for all supported tokens)
          if (!tokenSymbol) {
            const tokenPatterns = [
              { patterns: ['ethereum', 'eth', 'network=ethereum', 'network=sepolia', 'sepolia'], symbol: 'ETH' },
              { patterns: ['polygon', 'matic', 'network=polygon', 'amoy'], symbol: 'MATIC' },
              { patterns: ['bitcoin', 'btc', 'network=bitcoin'], symbol: 'BTC' },
              { patterns: ['ripple', 'xrp', 'xrpl', 'network=xrp'], symbol: 'XRP' },
              { patterns: ['stellar', 'xlm', 'network=stellar'], symbol: 'XLM' },
              { patterns: ['cardano', 'ada', 'network=cardano'], symbol: 'ADA' },
              { patterns: ['tron', 'trx', 'network=tron'], symbol: 'TRX' },
              { patterns: ['solana', 'sol', 'network=solana'], symbol: 'SOL' },
              { patterns: ['binance', 'bnb', 'network=binance', 'bsc'], symbol: 'BNB' },
              { patterns: ['celo', 'network=celo'], symbol: 'CELO' },
              { patterns: ['cronos', 'cro', 'network=cronos'], symbol: 'CRO' },
              { patterns: ['moonbeam', 'glmr', 'network=moonbeam'], symbol: 'GLMR' },
              { patterns: ['moonriver', 'movr', 'network=moonriver'], symbol: 'MOVR' },
              { patterns: ['gnosis', 'xdai', 'network=gnosis'], symbol: 'XDAI' },
              { patterns: ['arbitrum', 'arb', 'network=arbitrum'], symbol: 'ARB' },
              { patterns: ['optimism', 'op', 'network=optimism'], symbol: 'OP' },
              { patterns: ['avalanche', 'avax', 'network=avalanche'], symbol: 'AVAX' },
              { patterns: ['base', 'network=base'], symbol: 'ETH' }, // Base uses ETH
              { patterns: ['linea', 'network=linea'], symbol: 'ETH' }, // Linea uses ETH
              { patterns: ['fantom', 'ftm', 'network=fantom'], symbol: 'FTM' },
            ];
            
            for (const { patterns, symbol } of tokenPatterns) {
              if (patterns.some(p => urlLower.includes(p) || networkParamLower.includes(p))) {
                tokenSymbol = symbol;
                console.log(`Buy tab - Inferred ${symbol} from URL pattern (PRIORITY 1) - no orderId yet`);
                break;
              }
            }
          }
          
          // PRIORITY 2: If URL doesn't help OR we have an orderId (transaction completing), check walletAddressesData
          // CRITICAL: This MUST happen BEFORE network mapping to prevent BTC from being saved as ETH/Sepolia
          // Check walletAddressesData if:
          // 1. We have an orderId (transaction is completing) OR we're on a confirmation page
          // 2. (URL gave us NO clues OR we detected wrong token like ETH when it should be BTC)
          // CRITICAL: Get networkFromUrl early to check if it's empty
          const networkFromUrlEarly = networkParam || (url.includes('network=') ? url.match(/network=([^&]+)/)?.[1] : '') || '';
          const isConfirmationPage = url.includes('paymentstatus') || 
                                    url.includes('wallet-confirm') || 
                                    url.includes('user/confirm-order') ||
                                    url.includes('confirm-order') ||
                                    url.includes('payment-confirmation');
          // CRITICAL: Check walletAddressesData if we have an orderId (transaction completing) OR on confirmation page
          // This ensures BTC is detected even if we're not on a specific confirmation page pattern
          const shouldCheckWalletAddressesData = (orderId || isConfirmationPage) && lastWalletAddressesData;
          const mightBeWrongToken = tokenSymbol && (
            (tokenSymbol === 'ETH' && networkFromUrlEarly === '') || // ETH detected but no network in URL
            (tokenSymbol === 'ETH' && (isConfirmationPage || orderId) && !url.includes('ethereum') && !url.includes('eth'))
          );
          
          if (shouldCheckWalletAddressesData && (!tokenSymbol || mightBeWrongToken)) {
            try {
              const addrData = JSON.parse(lastWalletAddressesData);
              const coins = addrData.coins || addrData;
              const coinKeys = Object.keys(coins || {});
              
              // REMOVED: BTC inference from walletAddressesData - it's unreliable because walletAddressesData contains ALL tokens
              // We cannot infer which token was purchased just from walletAddressesData presence
              // The Transak API (called with orderId) is the ONLY reliable source for token/network information
              // If API fails, leave tokenSymbol empty and let retry mechanism fetch it later
            } catch (e) {
              // Silent fail - JSON parsing might fail
              console.warn('Buy tab - Error parsing walletAddressesData for BTC inference:', e);
            }
          }
        }
        
        // CRITICAL: Enhanced network detection - try multiple sources
        // Priority: URL parameter > URL path > tokenSymbol inference > default
        let networkFromUrl = networkParam || '';
        
        // Try to extract network from URL path or query string
        if (!networkFromUrl) {
          const networkMatch = url.match(/[?&]network=([^&]+)/i);
          if (networkMatch) {
            networkFromUrl = networkMatch[1];
          } else {
            // Try to infer from URL path (e.g., /polygon/, /ethereum/, etc.)
            const urlLower = url.toLowerCase();
            if (urlLower.includes('/polygon/') || urlLower.includes('polygon')) {
              networkFromUrl = 'polygon';
            } else if (urlLower.includes('/ethereum/') || urlLower.includes('ethereum')) {
              networkFromUrl = 'ethereum';
            } else if (urlLower.includes('/bitcoin/') || urlLower.includes('bitcoin')) {
              networkFromUrl = 'bitcoin';
            } else if (urlLower.includes('/ripple/') || urlLower.includes('xrp') || urlLower.includes('xrpl')) {
              networkFromUrl = 'xrp';
            } else if (urlLower.includes('/solana/') || urlLower.includes('solana')) {
              networkFromUrl = 'solana';
            }
          }
        }
        
        // CRITICAL: If we have tokenSymbol but no network, infer network from token
        // This prevents defaulting to Sepolia for non-EVM tokens
        if (!networkFromUrl && tokenSymbol) {
          const tokenUpper = tokenSymbol.toUpperCase();
          if (tokenUpper === 'BTC') {
            networkFromUrl = 'bitcoin';
          } else if (tokenUpper === 'XRP') {
            networkFromUrl = 'xrp';
          } else if (tokenUpper === 'SOL') {
            networkFromUrl = 'solana';
          } else if (tokenUpper === 'XLM') {
            networkFromUrl = 'stellar';
          } else if (tokenUpper === 'ADA') {
            networkFromUrl = 'cardano';
          } else if (tokenUpper === 'TRX') {
            networkFromUrl = 'tron';
          } else if (tokenUpper === 'MATIC') {
            networkFromUrl = 'polygon';
          } else if (tokenUpper === 'BNB') {
            networkFromUrl = 'binance';
          }
          // For EVM tokens without explicit network, default to Ethereum (not Sepolia for production)
          else if (['ETH', 'USDT', 'USDC', 'DAI'].includes(tokenUpper)) {
            networkFromUrl = 'ethereum'; // Mainnet, not Sepolia
          }
        }
        
        // CRITICAL: Map network using generic mapper - handles ALL tokens
        // This ensures correct network detection for all supported tokens
        const networkMapping = mapTransakNetwork(networkFromUrl, tokenSymbol, isStaging);
        let chainId = networkMapping.chainId;
        let networkName = networkMapping.networkName;
        let isEvm = networkMapping.isEvm;
        
        // CRITICAL: If mapping failed and we have tokenSymbol, try direct mapping
        if (!networkName || networkName === 'Unknown' || (chainId === 11155111 && tokenSymbol && !networkFromUrl.includes('sepolia'))) {
          // Default network mapping might have failed - try again with tokenSymbol
          if (tokenSymbol) {
            const retryMapping = mapTransakNetwork('', tokenSymbol, isStaging);
            if (retryMapping.networkName && retryMapping.networkName !== 'Unknown') {
              chainId = retryMapping.chainId;
              networkName = retryMapping.networkName;
              isEvm = retryMapping.isEvm;
              console.log(`Buy tab - ✅ Retry mapping succeeded with tokenSymbol ${tokenSymbol}:`, { chainId, networkName });
            }
          }
        }
        
        console.log('Buy tab - Network detection (enhanced):', {
          tokenSymbol: tokenSymbol || '(unknown)',
          networkFromUrl,
          networkParam,
          isStaging,
          mappedChainId: chainId,
          mappedNetworkName: networkName,
          isEvm: isEvm,
          walletAddress,
          note: 'Enhanced network detection: URL > path > token inference > mapping retry'
        });
        
        // CRITICAL: Fetch Transak Order API data FIRST before saving transaction
        // The API is the SINGLE SOURCE OF TRUTH for transaction data
        // Only use URL-parsed data as fallback if API is unavailable
        let finalTransactionData = { ...buyData };
        let finalChainId = chainId;
        let finalNetworkName = networkName;
        
        // CRITICAL: If we don't have tokenSymbol yet but have orderId, WAIT for API data
        // Don't save transaction with wrong network (e.g., BTC saved as Sepolia)
        const hasValidTokenData = tokenSymbol && tokenSymbol.trim() !== '';
        const shouldWaitForApi = orderId && orderId.trim() !== '' && !hasValidTokenData;
        
        // CRITICAL: Use orderId from URL or DOM extraction (lastOrderId)
        const finalOrderId = orderId || lastOrderId || '';
        
        if (finalOrderId && finalOrderId.trim() !== '') {
          console.log('Buy tab - Fetching Transak order details (non-blocking):', {
            orderId: finalOrderId,
            orderIdSource: orderId ? 'URL' : lastOrderId ? 'DOM' : 'none',
            hasValidTokenData,
            shouldWaitForApi,
            currentTokenSymbol: tokenSymbol || '(empty)',
            note: 'Transaction will save immediately with URL data, API will update later'
          });
          
          try {
            // CRITICAL: Make API call NON-BLOCKING - save transaction immediately with URL data
            // API will update transaction later via retry mechanism
            // This prevents blocking transaction completion while still getting API data when available
            const { fetchTransakOrder } = await import('../services/TransakOrderService');
            const orderDetails = await Promise.race([
              fetchTransakOrder(finalOrderId),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)) // 8 seconds timeout (reduced from 20s)
            ]);
            
            if (orderDetails) {
              console.log('Buy tab - ✅ Fetched complete order details from Transak API (BEFORE saving):', {
                cryptoCurrency: orderDetails.cryptoCurrency,
                cryptoAmount: orderDetails.cryptoAmount,
                fiatAmount: orderDetails.fiatAmount,
                network: orderDetails.network,
                status: orderDetails.status,
                hasHash: !!orderDetails.transactionHash
              });
              
              // CRITICAL: Use API data as PRIMARY source - it's the most accurate
              // Override ALL URL-parsed data with API data
              finalTransactionData = {
                tokenSymbol: orderDetails.cryptoCurrency?.toUpperCase() || buyData.tokenSymbol,
                tokenAmount: orderDetails.cryptoAmount || buyData.tokenAmount,
                currencyAmount: orderDetails.fiatAmount || buyData.currencyAmount,
                currencySymbol: orderDetails.fiatCurrency?.toUpperCase() || buyData.currencySymbol,
                transactionHash: orderDetails.transactionHash || buyData.transactionHash,
                orderId: finalOrderId, // Use finalOrderId (URL or DOM extraction)
                status: 'COMPLETED' as const
              };
              
              // CRITICAL: Use generic network mapper with API's network field
              // This handles ALL tokens correctly (XRP, BTC, ETH, etc.)
              // For XRP specifically, ensure we use the cryptoCurrency field if network is missing
              const apiNetworkField = orderDetails.network || '';
              const apiCryptoCurrency = orderDetails.cryptoCurrency || '';
              
              // CRITICAL: If network is empty but we have cryptoCurrency, try using cryptoCurrency as network hint
              // This works for tokens like XRP, BTC, SOL where cryptoCurrency IS the network identifier
              let networkToMap = apiNetworkField;
              if (!networkToMap && apiCryptoCurrency) {
                // For non-EVM tokens, cryptoCurrency often IS the network (e.g., "BTC" = Bitcoin network)
                const currencyLower = apiCryptoCurrency.toLowerCase();
                if (['btc', 'xrp', 'sol', 'ada', 'trx', 'xlm', 'doge', 'ltc', 'bch', 'atom', 'dot'].includes(currencyLower)) {
                  networkToMap = currencyLower; // Use cryptoCurrency as network identifier
                  console.log(`Buy tab: Using cryptoCurrency ${apiCryptoCurrency} as network identifier`);
                }
              }
              
              const apiNetworkMapping = mapTransakNetwork(
                networkToMap || apiNetworkField,
                apiCryptoCurrency,
                isStaging
              );
              
              // CRITICAL: Only use mapped network if it's not the default "Unknown Network"
              // If mapping failed, try cryptoCurrency-based inference
              if (apiNetworkMapping.networkName === 'Unknown Network' && apiCryptoCurrency) {
                // Try mapping with cryptoCurrency as primary identifier
                const currencyBasedMapping = mapTransakNetwork(apiCryptoCurrency.toLowerCase(), '', isStaging);
                if (currencyBasedMapping.networkName !== 'Unknown Network') {
                  finalChainId = currencyBasedMapping.chainId;
                  finalNetworkName = currencyBasedMapping.networkName;
                  console.log(`Buy tab: ✅ Using cryptoCurrency-based mapping: ${currencyBasedMapping.networkName}`);
                } else {
                  finalChainId = apiNetworkMapping.chainId;
                  finalNetworkName = apiNetworkMapping.networkName;
                }
              } else {
                finalChainId = apiNetworkMapping.chainId;
                finalNetworkName = apiNetworkMapping.networkName;
              }
              
              console.log('Buy tab - Network mapped from Transak API:', {
                apiNetwork: orderDetails.network || '(empty)',
                apiCryptoCurrency: apiCryptoCurrency || '(empty)',
                networkToMap: networkToMap || '(empty)',
                mappedChainId: finalChainId,
                mappedNetworkName: finalNetworkName,
                isEvm: apiNetworkMapping.isEvm,
                note: 'Network mapping uses both network and cryptoCurrency fields for maximum compatibility'
              });
            } else {
              console.warn('Buy tab - Transak API timeout or unavailable - will use URL-extracted data as fallback');
              // CRITICAL: Use URL-extracted tokenSymbol as fallback when API fails
              // This prevents "Awaiting details..." from displaying - user sees actual token even if incomplete
              // The retry mechanism will update it with complete data when API becomes available
              if (tokenSymbol && tokenSymbol.trim() !== '') {
                finalTransactionData.tokenSymbol = tokenSymbol.toUpperCase();
                console.log(`Buy tab - ⚠️ API failed but using URL-extracted tokenSymbol as fallback: ${finalTransactionData.tokenSymbol}`);
              } else {
                finalTransactionData.tokenSymbol = '';
                console.log('Buy tab - API failed and no URL-extracted tokenSymbol - leaving empty for retry mechanism');
              }
            }
          } catch (apiError: any) {
            console.warn('Buy tab - Could not fetch Transak order details (will retry later):', {
              error: apiError?.message || apiError,
              orderId: orderId,
              note: 'Transaction will be saved with empty tokenSymbol, then updated when API becomes available.'
            });
            
            // CRITICAL: Use URL-extracted tokenSymbol as fallback when API fails
            // This prevents "Awaiting details..." from displaying - user sees actual token even if incomplete
            if (tokenSymbol && tokenSymbol.trim() !== '') {
              finalTransactionData.tokenSymbol = tokenSymbol.toUpperCase();
              console.log(`Buy tab - ⚠️ API error but using URL-extracted tokenSymbol as fallback: ${finalTransactionData.tokenSymbol}`);
            } else {
              finalTransactionData.tokenSymbol = '';
              console.log('Buy tab - API error and no URL-extracted tokenSymbol - leaving empty for retry mechanism');
            }
          }
        }
        
        // CRITICAL: DO NOT infer tokenSymbol when API fails and we have orderId
        // The API is the ONLY reliable source - URL inference is unreliable and causes misidentification
        // (e.g., USDT on Ethereum gets misidentified as BTC or ETH)
        // Only infer if we have NO orderId (transaction hasn't completed yet)
        if (!finalTransactionData.tokenSymbol || finalTransactionData.tokenSymbol.trim() === '') {
          if (orderId && orderId.trim() !== '') {
            // CRITICAL: We have orderId but API failed - DO NOT INFER
            // Leave empty so retry mechanism can fetch correct data from API
            finalTransactionData.tokenSymbol = '';
            console.log('Buy tab - API failed but orderId exists - leaving tokenSymbol empty for retry mechanism');
          } else {
            // No orderId = transaction hasn't completed yet, safe to infer from URL
            // Priority 1: Use tokenSymbol extracted from URL
            if (tokenSymbol && tokenSymbol.trim() !== '') {
              finalTransactionData.tokenSymbol = tokenSymbol;
            } else {
              // Priority 2: Try to extract from URL one more time with more aggressive patterns
              const urlLower = url.toLowerCase();
              const tokenPatterns = [
                { patterns: ['ethereum', 'eth', 'network=ethereum', 'network=sepolia'], symbol: 'ETH' },
                { patterns: ['polygon', 'matic', 'network=polygon'], symbol: 'MATIC' },
                { patterns: ['bitcoin', 'btc', 'network=bitcoin'], symbol: 'BTC' },
                { patterns: ['ripple', 'xrp', 'xrpl', 'network=xrp'], symbol: 'XRP' },
                { patterns: ['stellar', 'xlm', 'network=stellar'], symbol: 'XLM' },
                { patterns: ['cardano', 'ada', 'network=cardano'], symbol: 'ADA' },
                { patterns: ['tron', 'trx', 'network=tron'], symbol: 'TRX' },
                { patterns: ['solana', 'sol', 'network=solana'], symbol: 'SOL' },
                { patterns: ['binance', 'bnb', 'network=binance'], symbol: 'BNB' },
              ];
              
              for (const { patterns, symbol } of tokenPatterns) {
                if (patterns.some(p => urlLower.includes(p))) {
                  finalTransactionData.tokenSymbol = symbol;
                  console.log(`Buy tab - Last resort (no orderId): Inferred ${symbol} from URL pattern`);
                  break;
                }
              }
            }
          }
        }
        
        // CRITICAL: Prepare transaction data for TransactionStore
        // TransactionStore will handle persistence, retry, and notifications automatically
        const now = new Date();
        const timestamp = now.getTime();
        
        // CRITICAL: Ensure tokenSymbol is ALWAYS set - use best available source
        // Priority: API data > URL-extracted > pattern inference
        // CRITICAL: Use URL-extracted data as fallback even if API fails - better than "Awaiting details..."
        let finalTokenSymbol = (finalTransactionData.tokenSymbol || tokenSymbol || '').trim().toUpperCase();
        
        // CRITICAL: If API failed but we have URL-extracted tokenSymbol, USE IT as fallback
        // This prevents "Awaiting details..." from displaying - user will see actual token even if incomplete
        // The retry mechanism will update it with complete data later
        if ((!finalTokenSymbol || finalTokenSymbol === '') && orderId && orderId.trim() !== '') {
          // API failed but we might have URL-extracted data - use it as fallback
          if (tokenSymbol && tokenSymbol.trim() !== '') {
            finalTokenSymbol = tokenSymbol.trim().toUpperCase();
            console.log(`Buy tab - ⚠️ API failed but using URL-extracted tokenSymbol as fallback: ${finalTokenSymbol}`);
          } else {
            // No URL data either - leave empty for retry mechanism
            finalTokenSymbol = '';
            console.log('Buy tab - Final check: orderId exists but no tokenSymbol available - leaving empty for retry mechanism');
          }
        } else if (!finalTokenSymbol || finalTokenSymbol === '') {
          // FINAL FALLBACK: Only if no orderId - try one more aggressive extraction from URL
            // PRIORITY 1: Extract from URL path or query string
            const urlLower = url.toLowerCase();
            const urlParts = url.split(/[?&#]/);
            for (const part of urlParts) {
              const partLower = part.toLowerCase();
              if (partLower.includes('crypto=') || partLower.includes('currency=')) {
                const match = part.match(/(?:crypto|currency)=([a-z0-9]+)/i);
                if (match && match[1]) {
                  finalTokenSymbol = match[1].toUpperCase();
                  break;
                }
              }
            }
            
            // REMOVED: walletAddressesData inference - it's unreliable because walletAddressesData contains ALL tokens
            // We cannot infer which token was purchased just from walletAddressesData presence
            // The Transak API is the ONLY reliable source for token/network information
            // If API fails, leave tokenSymbol empty and let retry mechanism fetch it later
            
            // CRITICAL: DO NOT infer from network name when we have an orderId
            // If API failed, leave tokenSymbol empty so retry mechanism can fetch correct data
            // Network inference is unreliable (e.g., USDT on Ethereum could be misidentified as ETH)
            // Only infer if we have NO orderId and NO API data available
            if (!finalTokenSymbol && !orderId && finalNetworkName) {
              const networkLower = finalNetworkName.toLowerCase();
              if (networkLower.includes('bitcoin') || networkLower.includes('btc')) {
                finalTokenSymbol = 'BTC';
                finalChainId = 0;
                finalNetworkName = 'Bitcoin';
              } else if (networkLower.includes('polygon') || networkLower.includes('matic')) {
                finalTokenSymbol = 'MATIC';
              } else if (networkLower.includes('ripple') || networkLower.includes('xrp')) {
                finalTokenSymbol = 'XRP';
              } else if (networkLower.includes('cardano') || networkLower.includes('ada')) {
                finalTokenSymbol = 'ADA';
              } else if (networkLower.includes('ethereum') || networkLower.includes('sepolia')) {
                finalTokenSymbol = 'ETH';
              }
              // If network doesn't match any known pattern, leave empty for API retry
            } else if (!finalTokenSymbol && orderId) {
              // CRITICAL: If we have orderId but API failed, leave empty - retry will fix it
              console.log('Buy tab - OrderId present but API failed - leaving tokenSymbol empty for retry mechanism');
            }
          }
        
        // CRITICAL: Log final tokenSymbol for debugging
        console.log('Buy tab - Final tokenSymbol resolution:', {
          fromFinalTransactionData: finalTransactionData.tokenSymbol || '(empty)',
          fromTokenSymbol: tokenSymbol || '(empty)',
          finalTokenSymbol: finalTokenSymbol || '(STILL EMPTY - will be retried)',
          networkName: finalNetworkName,
          chainId: finalChainId,
          orderId: finalOrderId || '(no orderId)',
          orderIdSource: orderId ? 'URL' : lastOrderId ? 'DOM' : 'none'
        });
        
          // CRITICAL: Check if transaction with this orderId already exists BEFORE saving
          // This prevents duplicate transactions even if navigation triggers multiple saves
          // CRITICAL: Also check by timestamp + tokenSymbol to catch duplicates even without orderId
          if (walletAddress) {
            // CRITICAL: Check if we're already saving this transaction (race condition prevention)
            // Use finalOrderId (from URL or DOM extraction)
            const finalOrderIdForSave = orderId || lastOrderId || '';
            const saveKey = finalOrderIdForSave || `${timestamp}_${finalTokenSymbol}`;
            if (savingTransactionRef.current.has(saveKey)) {
              console.log(`Buy tab - ⚠️ Transaction ${saveKey} is already being saved - skipping duplicate save`);
              return; // Exit - already saving
            }
            
            // Mark as saving immediately
            savingTransactionRef.current.add(saveKey);
            
            // CRITICAL: Clear the save lock after 10 seconds to prevent permanent lock
            setTimeout(() => {
              savingTransactionRef.current.delete(saveKey);
            }, 10000);
            
            const transactionStore = useTransactionStore.getState();
            const existingTransactions = transactionStore.getTransactions(walletAddress) || [];
            
            // Check by orderId first (most reliable) - use finalOrderId
            if (finalOrderIdForSave && finalOrderIdForSave.trim() !== '') {
              const existingWithOrderId = existingTransactions.find(tx => 
                (tx as any).orderId === finalOrderIdForSave && tx.type === 'BUY'
              );
              
              if (existingWithOrderId) {
                console.log(`Buy tab - ⚠️ Transaction with orderId ${finalOrderIdForSave} already exists (${existingWithOrderId.id}) - skipping duplicate save`);
                savingTransactionRef.current.delete(saveKey); // Remove lock
                return; // Exit - transaction already saved
              }
            }
            
            // CRITICAL: Enhanced duplicate detection - check by timestamp + tokenSymbol (within 10 seconds)
            // This prevents the same transaction from being saved multiple times during navigation
            // CRITICAL: If no orderId, be MORE strict - require tokenSymbol match within 10 seconds
            const timestampWindow = 10000; // 10 seconds (increased for slow networks)
            const duplicateByTimestamp = existingTransactions.find(tx => {
              if (tx.type !== 'BUY') return false;
              
              const timeDiff = Math.abs(tx.timestamp - timestamp);
              if (timeDiff >= timestampWindow) return false;
              
              // If we have orderId, only match if orderId matches OR if same token+timestamp
              // Use finalOrderId (from URL or DOM extraction)
              const finalOrderIdForCheck = orderId || lastOrderId || '';
              if (finalOrderIdForCheck && finalOrderIdForCheck.trim() !== '') {
                const txOrderId = (tx as any).orderId;
                if (txOrderId && txOrderId === finalOrderIdForCheck) return true; // Same orderId = duplicate
              }
              
              // Match by tokenSymbol if both have it (not empty/unknown)
              const txTokenSymbol = ((tx as any).tokenSymbol || tx.tokenName || '').toUpperCase();
              const newTokenSymbol = finalTokenSymbol.toUpperCase();
              
              if (txTokenSymbol && newTokenSymbol && 
                  txTokenSymbol !== 'UNKNOWN' && newTokenSymbol !== 'UNKNOWN' &&
                  txTokenSymbol !== '' && newTokenSymbol !== '') {
                return txTokenSymbol === newTokenSymbol;
              }
              
              // If one has token and other doesn't, check if they're within 3 seconds (very recent)
              if (timeDiff < 3000 && (txTokenSymbol || newTokenSymbol)) {
                return true; // Very recent + same type = likely duplicate
              }
              
              return false;
            });
            
            if (duplicateByTimestamp) {
              console.log(`Buy tab - ⚠️ Duplicate transaction detected by timestamp+token (${finalTokenSymbol}) - skipping save`);
              console.log(`Buy tab - Existing: ${duplicateByTimestamp.id} (${duplicateByTimestamp.timestamp}), New: ${timestamp}`);
              const finalOrderIdForLog = orderId || lastOrderId || '';
              console.log(`Buy tab - Duplicate details:`, {
                existingOrderId: (duplicateByTimestamp as any).orderId || 'none',
                newOrderId: finalOrderIdForLog || 'none',
                existingToken: (duplicateByTimestamp as any).tokenSymbol || duplicateByTimestamp.tokenName,
                newToken: finalTokenSymbol
              });
              savingTransactionRef.current.delete(saveKey); // Remove lock
              return; // Exit - duplicate transaction
            }
            
            // CRITICAL: Allow transaction save even without orderId if we have URL-extracted tokenSymbol
            // This ensures transactions are captured even when API is unavailable
            // The retry mechanism will update them with complete data later
            // Use finalOrderId (from URL or DOM extraction)
            const finalOrderIdForBlock = orderId || lastOrderId || '';
            if (!finalOrderIdForBlock || finalOrderIdForBlock.trim() === '') {
              // Only block if we have NO tokenSymbol at all (not even URL-inferred)
              // If we have URL-inferred tokenSymbol, save it - it's better than nothing
              const hasAnyTokenSymbol = finalTokenSymbol && finalTokenSymbol.trim() !== '' && finalTokenSymbol !== 'UNKNOWN';
              const hasUrlInferredToken = tokenSymbol && tokenSymbol.trim() !== '' && tokenSymbol !== 'UNKNOWN';
              
              if (!hasAnyTokenSymbol && !hasUrlInferredToken) {
                console.log(`Buy tab - ⚠️ No orderId AND no tokenSymbol - trying aggressive URL inference before saving`);
                console.log(`Buy tab - Will save with best available data - retry mechanism will update later`);
                // Continue with save - use URL inference below
              } else {
                console.log(`Buy tab - ✅ Have tokenSymbol (${hasAnyTokenSymbol ? finalTokenSymbol : tokenSymbol}) - proceeding with save`);
              }
            }
          }
        
        // Build transaction record
        // CRITICAL: Even if tokenSymbol is empty, save the transaction - retry mechanism will fix it
        const transactionData: Omit<TransactionRecord, 'id'> = {
          type: 'BUY',
          timestamp,
          date: now.toLocaleDateString(),
          time: now.toLocaleTimeString(),
          tokenName: finalTokenSymbol || tokenSymbol || 'Unknown Token', // Use URL-extracted tokenSymbol as fallback
          tokenAmount: finalTransactionData.tokenAmount || tokenAmount || '', // Use URL-extracted amount as fallback
          currencyAmount: finalTransactionData.currencyAmount || currencyAmount || '', // Use URL-extracted currency as fallback
          currencySymbol: finalTransactionData.currencySymbol || currencySymbol || 'USD', // Use URL-extracted currency symbol as fallback
          walletAddress: walletAddress || '',
          transactionHash: finalTransactionData.transactionHash || '',
          status: finalTransactionData.status || 'COMPLETED',
          purchaseCurrency: finalTransactionData.currencySymbol || '',
          purchaseAmount: finalTransactionData.currencyAmount || '',
          chainId: finalChainId,
          networkName: finalNetworkName,
          // CRITICAL: Always store tokenSymbol - use best available data
          // Priority: finalTokenSymbol (from API or URL) > tokenSymbol (URL-extracted) > 'UNKNOWN' placeholder
          // CRITICAL: Use 'UNKNOWN' as placeholder so Wallet tab can display it - better than empty string
          tokenSymbol: (finalTokenSymbol && finalTokenSymbol !== '' && finalTokenSymbol !== 'UNKNOWN')
            ? finalTokenSymbol
            : (tokenSymbol && tokenSymbol !== '' ? tokenSymbol : 'UNKNOWN'), // Always use UNKNOWN instead of empty - allows display
          orderId: orderId || lastOrderId || undefined, // CRITICAL: Store orderId (from URL or DOM extraction) for automatic retry
          transakOrderStatus: (!finalTransactionData.tokenAmount || finalTransactionData.tokenAmount === '' || !finalTransactionData.transactionHash || finalTransactionData.transactionHash === '' || !finalTokenSymbol) 
            ? 'PENDING_API_FETCH' 
            : undefined,
        };
        
        // CRITICAL: Log transaction data BEFORE saving to debug persistence issues
        const saveKey = orderId || `${timestamp}_${finalTokenSymbol}`;
        console.log('Buy tab - 💾 ABOUT TO SAVE TRANSACTION:', {
          walletAddress: walletAddress || 'MISSING!',
          normalizedAddress: walletAddress?.toLowerCase() || 'MISSING!',
          storageKey: `crypto_pal_transactions_${walletAddress?.toLowerCase()}`,
          saveKey: saveKey,
          transactionData: {
            type: transactionData.type,
            tokenSymbol: transactionData.tokenSymbol,
            tokenName: transactionData.tokenName,
            tokenAmount: transactionData.tokenAmount,
            currencyAmount: transactionData.currencyAmount,
            orderId: transactionData.orderId,
            chainId: transactionData.chainId,
            networkName: transactionData.networkName
          }
        });
        
        // Save transaction using TransactionStore (automatic persistence + notifications)
        const transactionId = await transactionStore.addTransaction(transactionData, walletAddress || '');
        
        console.log('Buy tab - ✅ Transaction saved to TransactionStore:', {
          transactionId,
          tokenSymbol: finalTokenSymbol || tokenSymbol || 'MISSING',
          tokenAmount: finalTransactionData.tokenAmount || tokenAmount || 'MISSING',
          currencyAmount: finalTransactionData.currencyAmount || currencyAmount || 'MISSING',
          chainId: finalChainId,
          networkName: finalNetworkName,
          hasOrderId: !!orderId,
          note: 'TransactionStore will automatically: 1) Persist to storage, 2) Notify all components, 3) Retry if incomplete'
        });
        
        // CRITICAL: Verify the transaction was actually saved by reading back from storage
        setTimeout(async () => {
          const verifyStore = useTransactionStore.getState();
          const savedTxs = verifyStore.getTransactions(walletAddress || '');
          const found = savedTxs?.find(tx => tx.id === transactionId);
          if (found) {
            console.log(`Buy tab - ✅ VERIFICATION: Transaction ${transactionId} confirmed in TransactionStore`);
          } else {
            console.error(`Buy tab - ❌ VERIFICATION FAILED: Transaction ${transactionId} NOT found in TransactionStore!`);
            console.error(`Buy tab - Total transactions in store for ${walletAddress}: ${savedTxs?.length || 0}`);
          }
        }, 500);
        
        // CRITICAL: If we got API data, update transaction immediately with complete info
        // TransactionStore handles notifications automatically - no manual refresh needed!
        if (orderId && orderId.trim() !== '' && finalTransactionData.tokenSymbol) {
          // Transaction is complete, but we might want to update with latest API data
          // TransactionStore's syncIncompleteTransactions will handle this automatically
          // No manual background retry needed!
        }
        
        console.log('Buy tab - Transaction saved with final data:', {
          transactionId,
          tokenSymbol: finalTransactionData.tokenSymbol,
          tokenAmount: finalTransactionData.tokenAmount,
          currencyAmount: finalTransactionData.currencyAmount,
          chainId: finalChainId,
          networkName: finalNetworkName,
          hasOrderId: !!orderId
        });
        
        console.log('Buy transaction captured successfully with final data:', {
          transactionId,
          walletAddress,
          chainId: finalChainId,
          networkName: finalNetworkName,
          tokenSymbol: finalTransactionData.tokenSymbol,
          tokenAmount: finalTransactionData.tokenAmount,
          currencyAmount: finalTransactionData.currencyAmount,
          currencySymbol: finalTransactionData.currencySymbol
        });
      } catch (error) {
        console.error('Buy tab - ❌ ERROR capturing buy transaction:', error);
        console.error('Buy tab - Error details:', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : 'N/A',
          orderId: orderId || 'MISSING',
          url: url.substring(0, 100),
          note: 'Transaction capture failed - investigate AsyncStorage permissions or TransactionStore issues'
        });
        // Don't crash the app - transaction capture is not critical
        // Remove orderId from processed set on error so it can be retried
        if (orderId) {
          processedOrderIdsRef.current.delete(orderId);
          console.log(`Buy tab - ⚠️ Removed orderId ${orderId} from processed set due to error - can be retried`);
        }
        
        // CRITICAL: Clear save lock on error
        // Note: timestamp and finalTokenSymbol may not be in scope here, use orderId or generate a fallback key
        if (orderId) {
          savingTransactionRef.current.delete(orderId);
        }
      }
      }, 1000); // Debounce delay: 1 second - allows WebView extraction to complete first
      
      console.log(`Buy tab - ⏱️ Transaction capture scheduled for 1000ms from now`);
    } else {
      console.log(`Buy tab - ❌ Transaction completion NOT detected for URL: ${url.substring(0, 150)}`);
    }
  };

  // Handle back button - go back in WebView if possible, else navigate back to previous screen
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        console.log('Buy tab - Back button pressed, going back in WebView');
        webViewRef.current.goBack();
        return true; // Prevent default back behavior
      }
      return false; // Allow default back behavior (navigate back to previous screen)
    });

    return () => {
      backHandler.remove();
      setIsTransakSession(false);
      setLastOrderId('');
      // Clear processed orderIds when component unmounts or session ends
      processedOrderIdsRef.current.clear();
      // Clear any pending transaction capture timeout
      if (transactionCaptureTimeoutRef.current) {
        clearTimeout(transactionCaptureTimeoutRef.current);
        transactionCaptureTimeoutRef.current = null;
      }
    };
  }, [canGoBack]);

  // CRITICAL: Only show spinner if we don't have a URI yet (initial load)
  // Once WebView has a URI, let it handle its own loading state
  if (loading && !uri) {
    return <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />;
  }
  if (isRestricted) return <Text style={styles.restrictedText}>Buy is restricted in your region.</Text>;

  return (
    <View style={{ flex: 1 }}>
      {/* CRITICAL: Recent Purchases Section - Shows previous BUY transactions */}
      {recentBuyTransactions.length > 0 && (
        <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 8 }}>
          <TouchableOpacity 
            onPress={() => setShowRecentPurchases(!showRecentPurchases)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>
              Recent Purchases ({recentBuyTransactions.length})
            </Text>
            <Text style={{ fontSize: 14, color: '#666' }}>
              {showRecentPurchases ? '▲ Hide' : '▼ Show'}
            </Text>
          </TouchableOpacity>
          
          {showRecentPurchases && displayedTransactions.length > 0 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={{ paddingVertical: 8 }}
              contentContainerStyle={{ paddingHorizontal: 8 }}
            >
              {displayedTransactions.map((tx: any) => {
                const tokenSymbol = tx.tokenSymbol || tx.tokenName || 'Unknown';
                const tokenAmount = tx.tokenAmount || '—';
                const currencyAmount = tx.currencyAmount || '—';
                const currencySymbol = tx.currencySymbol || 'USD';
                const date = new Date(tx.timestamp);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={{
                      backgroundColor: '#f9fafb',
                      borderRadius: 8,
                      padding: 12,
                      marginHorizontal: 6,
                      minWidth: 160,
                      borderWidth: 1,
                      borderColor: '#e5e7eb'
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>
                        {tokenSymbol}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        {dateStr}
                      </Text>
                    </View>
                    {tokenAmount && tokenAmount !== '—' && tokenAmount !== '' && !isNaN(parseFloat(tokenAmount)) && (
                      <Text style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                        {parseFloat(tokenAmount).toFixed(6)} {tokenSymbol}
                      </Text>
                    )}
                    {currencyAmount && currencyAmount !== '—' && currencyAmount !== '' && !isNaN(parseFloat(currencyAmount)) && (
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A84FF' }}>
                        {currencySymbol} {parseFloat(currencyAmount).toFixed(2)}
                      </Text>
                    )}
                    {((!tokenAmount || tokenAmount === '—' || tokenAmount === '') && (!currencyAmount || currencyAmount === '—' || currencyAmount === '')) && (
                      <Text style={{ fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 }}>
                        Details loading...
                      </Text>
                    )}
                    {(tx.status === 'PENDING_API_FETCH' || (tx as any).transakOrderStatus === 'PENDING_API_FETCH') && (
                      <Text style={{ fontSize: 11, color: '#f59e0b', marginTop: 4, fontStyle: 'italic' }}>
                        Processing...
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
      
      {/* Show spinner overlay only when WebView is loading AND we have a URI */}
      {/* CRITICAL: Keep overlay minimal - don't block Transak's UI from appearing */}
      {loading && uri && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1, pointerEvents: 'none' }}>
          <ActivityIndicator size="small" color="#0A84FF" />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri }}
        style={{ flex: 1 }}
        key={`buy-${uri.substring(0, 50)}`}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        startInLoadingState={true}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        // CRITICAL: Performance improvements
        renderToHardwareTextureAndroid={true}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEnabled={true}
        // CRITICAL: Inject JavaScript to extract transaction data from Transak confirmation pages
        injectedJavaScript={`
          (function() {
            // Only run on Transak paymentstatus/confirmation pages
            if (!window.location.href.includes('transak.com') || 
                (!window.location.href.includes('paymentstatus') && 
                 !window.location.href.includes('payment-confirmation') &&
                 !window.location.href.includes('wallet-confirm') &&
                 !window.location.href.includes('user/confirm-order') &&
                 !window.location.href.includes('confirm-order'))) {
              return;
            }
            
            // Function to extract data from page
            function extractTransactionData() {
              const data = {
                orderId: '',
                cryptoCurrency: '',
                cryptoAmount: '',
                fiatAmount: '',
                fiatCurrency: '',
                transactionHash: ''
              };
              
              // Extract orderId from URL (both query params and hash)
              const urlParams = new URLSearchParams(window.location.search);
              const hashParams = new URLSearchParams(window.location.hash.substring(1));
              data.orderId = urlParams.get('orderId') || 
                           hashParams.get('orderId') || 
                           urlParams.get('order_id') ||
                           hashParams.get('order_id') ||
                           '';
              
              // CRITICAL: Also try to extract orderId from page content (DOM)
              // Transak confirmation pages may display orderId in text, links, or data attributes
              // Also check email-style format: #755ec6b7-7b1d-4df0-adde-bcd740656cc3
              if (!data.orderId) {
                try {
                  // Look for UUID pattern (orderId format) in page text
                  // Handle both formats: plain UUID and email-style with # prefix
                  const pageText = document.body.innerText || document.body.textContent || '';
                  const uuidPattern = /#?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
                  const uuidMatch = pageText.match(uuidPattern);
                  if (uuidMatch) {
                    data.orderId = uuidMatch[1];
                    console.log('Transak extraction - Found orderId in page text:', data.orderId);
                  }
                  
                  // Also check data attributes and specific selectors
                  const orderIdSelectors = [
                    '[data-order-id]',
                    '[data-orderid]',
                    '[data-order]',
                    '.order-id',
                    '.orderId',
                    '[id*="order"]',
                    'a[href*="orderId"]',
                    'a[href*="order_id"]'
                  ];
                  
                  for (const selector of orderIdSelectors) {
                    try {
                      const elements = document.querySelectorAll(selector);
                      for (const el of elements) {
                        const value = el.getAttribute('data-order-id') ||
                                     el.getAttribute('data-orderid') ||
                                     el.getAttribute('data-order') ||
                                     el.textContent?.trim() ||
                                     el.getAttribute('href')?.match(/[?&#](?:orderId|order_id)=([a-f0-9-]+)/i)?.[1] ||
                                     '';
                        if (value && /[a-f0-9-]{8,}/i.test(value)) {
                          // Extract UUID from value if it contains one
                          const uuidMatch = value.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                          if (uuidMatch) {
                            data.orderId = uuidMatch[1];
                            console.log('Transak extraction - Found orderId via selector:', selector, data.orderId);
                            break;
                          }
                        }
                      }
                      if (data.orderId) break;
                    } catch (e) {
                      // Silent fail for selector errors
                    }
                  }
                } catch (e) {
                  // Silent fail
                }
              }
              
              // CRITICAL: Extract cryptoCurrency from URL parameters FIRST (most reliable)
              data.cryptoCurrency = urlParams.get('cryptoCurrency') || 
                                   urlParams.get('cryptoCurrencyCode') ||
                                   hashParams.get('cryptoCurrency') ||
                                   hashParams.get('cryptoCurrencyCode') ||
                                   '';
              
              // Try to extract from page content (Transak confirmation pages)
              try {
                // Look for transaction details in various DOM elements
                const pageText = document.body.innerText || document.body.textContent || '';
                
                // CRITICAL: Look for crypto amount patterns with more flexibility
                // Patterns: "0.00129534 BTC", "BTC 0.00129534", "Bitcoin: 0.00129534"
                // Support ALL tokens including XRP, XLM, ADA, SOL, etc.
                const cryptoPatterns = [
                  /(\\d+\\.?\\d*)\\s*(BTC|ETH|MATIC|BNB|USDC|USDT|DAI|XRP|XLM|ADA|SOL|TRX|DOGE|LTC|BCH|ATOM|DOT|BITCOIN|ETHEREUM|POLYGON|RIPPLE|STELLAR|CARDANO|SOLANA|TRON)/i,
                  /(BTC|ETH|MATIC|BNB|USDC|USDT|DAI|XRP|XLM|ADA|SOL|TRX|DOGE|LTC|BCH|ATOM|DOT)\\s*(\\d+\\.?\\d*)/i,
                  /([A-Z]{2,})\\s*:\\s*(\\d+\\.?\\d*)/i,
                  // XRP-specific patterns: "XRP: 100.5", "100.5 XRP", "Ripple: 100.5"
                  /(?:XRP|RIPPLE)\\s*[:]?\\s*(\\d+\\.?\\d*)/i,
                  /(\\d+\\.?\\d*)\\s*(?:XRP|RIPPLE)/i
                ];
                
                for (const pattern of cryptoPatterns) {
                  const match = pageText.match(pattern);
                  if (match) {
                    // Pattern 1: amount symbol (e.g., "0.00129534 BTC")
                    if (match[1] && /\\d/.test(match[1])) {
                      data.cryptoAmount = match[1].trim();
                      data.cryptoCurrency = (match[2] || match[3] || '').toUpperCase().substring(0, 4);
                    }
                    // Pattern 2: symbol amount (e.g., "BTC 0.00129534")
                    else if (match[2] && /\\d/.test(match[2])) {
                      data.cryptoAmount = match[2].trim();
                      data.cryptoCurrency = (match[1] || '').toUpperCase().substring(0, 4);
                    }
                    break;
                  }
                }
                
                // CRITICAL: Look for fiat amount patterns with more flexibility
                // Patterns: "112 GBP", "£112", "GBP 112", "Paid: 112 GBP"
                const fiatPatterns = [
                  /(?:paid|cost|total|you\\s+pay|you\\s+receive)\\s*[:=]?\\s*([£$€]?\\s*\\d+\\.?\\d*)\\s*(GBP|USD|EUR|NZD|AUD|CAD)/i,
                  /([£$€]?\\s*\\d+\\.?\\d*)\\s*(GBP|USD|EUR|NZD|AUD|CAD)/i,
                  /(GBP|USD|EUR|NZD|AUD|CAD)\\s*([£$€]?\\s*\\d+\\.?\\d*)/i
                ];
                
                for (const pattern of fiatPatterns) {
                  const match = pageText.match(pattern);
                  if (match) {
                    const amount = (match[1] || match[2] || '').replace(/[£$€\\s]/g, '').trim();
                    const currency = (match[2] || match[1] || '').toUpperCase();
                    if (amount && /\\d/.test(amount)) {
                      data.fiatAmount = amount;
                      data.fiatCurrency = currency.length === 3 ? currency : 
                                         (match[0].includes('£') ? 'GBP' : 
                                          match[0].includes('$') ? 'USD' : 
                                          match[0].includes('€') ? 'EUR' : 'GBP');
                      break;
                    }
                  }
                }
                
                // Look for transaction hash in links or text (both hex and base58 formats)
                // Support EVM (0x...), Bitcoin (base58), XRP (base58 starting with 'r'), etc.
                const hashPatterns = [
                  /0x[a-fA-F0-9]{64}/,  // EVM transactions
                  /[a-fA-F0-9]{64}/,    // Generic hex (Bitcoin, etc.)
                  /[13][a-km-zA-HJ-NP-Z1-9]{25,34}/,  // Bitcoin address format
                  /r[a-km-zA-HJ-NP-Z1-9]{25,34}/,     // XRP address format (starts with 'r')
                  /[a-km-zA-HJ-NP-Z1-9]{26,35}/       // Generic base58 (XRP, Stellar, etc.)
                ];
                
                for (const pattern of hashPatterns) {
                  const match = pageText.match(pattern);
                  if (match && match[0].length >= 26) {
                    data.transactionHash = match[0];
                    break;
                  }
                }
                
                // Try to extract from data attributes, input fields, or specific DOM elements
                const dataSelectors = [
                  '[data-crypto-amount]', '[data-fiat-amount]', '[data-order-id]',
                  '[data-amount]', '[data-currency]', '[data-transaction-hash]',
                  'input[name*="amount"]', 'input[name*="currency"]', 'input[name*="hash"]'
                ];
                
                dataSelectors.forEach(selector => {
                  try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                      const value = el.getAttribute('value') || el.getAttribute('data-crypto-amount') || 
                                   el.getAttribute('data-fiat-amount') || el.getAttribute('data-order-id') ||
                                   el.getAttribute('data-amount') || el.textContent || '';
                      
                      if (selector.includes('crypto-amount') || (selector.includes('amount') && !value.includes('GBP') && !value.includes('USD'))) {
                        if (!data.cryptoAmount && value && /\\d/.test(value)) data.cryptoAmount = value.trim();
                      }
                      if (selector.includes('fiat-amount') || selector.includes('currency')) {
                        if (!data.fiatAmount && value && /\\d/.test(value)) data.fiatAmount = value.trim();
                        if (!data.fiatCurrency && value && /[A-Z]{3}/.test(value)) data.fiatCurrency = value.match(/[A-Z]{3}/)?.[0] || '';
                      }
                      if (selector.includes('order-id') || selector.includes('order')) {
                        if (!data.orderId && value) data.orderId = value.trim();
                      }
                      if (selector.includes('hash')) {
                        if (!data.transactionHash && value && value.length >= 26) data.transactionHash = value.trim();
                      }
                    });
                  } catch (e) {
                    // Silent fail for selector errors
                  }
                });
              } catch (e) {
                // Silent fail
              }
              
              // CRITICAL: Send data back to React Native if we found ANY useful data
              // Even if only orderId or cryptoCurrency is found, send it so transaction can be updated
              if (data.orderId || data.cryptoCurrency || data.cryptoAmount || data.fiatAmount || data.transactionHash) {
                if (window.ReactNativeWebView) {
                  console.log('Transak page extraction - Sending data to React Native:', data);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'TRANSAK_TRANSACTION_DATA',
                    data: data
                  }));
                } else {
                  console.warn('Transak page extraction - ReactNativeWebView not available');
                }
              } else {
                console.log('Transak page extraction - No data found on page');
              }
            }
            
            // Extract immediately and also on page load
            extractTransactionData();
            setTimeout(extractTransactionData, 1000); // Also try after 1 second (page may load async)
            setTimeout(extractTransactionData, 3000); // And after 3 seconds
            
            return true;
          })();
        `}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            
            // Handle orderId extraction from DOM
            if (message.type === 'ORDER_ID_EXTRACTED' && message.orderId) {
              const extractedOrderId = message.orderId.trim();
              console.log(`Buy tab - ✅ OrderId extracted from DOM: ${extractedOrderId}`);
              setLastOrderId(extractedOrderId);
              
              // CRITICAL: If we're on a completion page but didn't have orderId, trigger capture IMMEDIATELY
              // This is especially important for BTC/non-EVM tokens where orderId isn't in URL
              if (currentUrl.includes('wallet-confirm') || currentUrl.includes('confirm') || currentUrl.includes('paymentstatus')) {
                console.log('Buy tab - ✅ OrderId now available from DOM - triggering transaction capture immediately');
                console.log(`Buy tab - OrderId: ${extractedOrderId}, URL: ${currentUrl.substring(0, 100)}`);
                // Trigger navigation change handler again with orderId - this will capture the transaction
                setTimeout(() => {
                  handleNavigationChange({ url: currentUrl, canGoBack });
                }, 500); // Small delay to ensure orderId is set in state
              }
              return;
            }
            
            if (message.type === 'TRANSAK_TRANSACTION_DATA' && message.data) {
              console.log('Buy tab - ✅ Extracted transaction data from WebView page:', message.data);
              
              // Update transaction if we have extracted data
              const { orderId, cryptoCurrency, cryptoAmount, fiatAmount, fiatCurrency, transactionHash } = message.data;
              
              // CRITICAL: Update transaction if we have ANY useful data (including cryptoCurrency)
              if (orderId || cryptoCurrency || cryptoAmount || fiatAmount || transactionHash) {
                console.log('Buy tab - Updating transaction with WebView-extracted data:', {
                  hasOrderId: !!orderId,
                  hasCryptoCurrency: !!cryptoCurrency,
                  hasCryptoAmount: !!cryptoAmount,
                  hasFiatAmount: !!fiatAmount,
                  hasTransactionHash: !!transactionHash,
                  cryptoCurrency,
                  fiatCurrency
                });
                
                // Find and update transaction using TransactionStore
                import('../utils/wallet').then(({ getWalletAddress }) => {
                  getWalletAddress().then(async (walletAddress) => {
                    if (!walletAddress) {
                      console.warn('Buy tab - No wallet address for WebView data update');
                      return;
                    }
                    
                    const transactionStore = useTransactionStore.getState();
                    const transactions = transactionStore.getTransactions(walletAddress, { type: 'BUY' });
                    
                    // Try to find transaction by orderId first
                    let matchingTx = orderId 
                      ? transactions.find(tx => (tx as any).orderId === orderId || tx.id.includes(orderId.substring(0, 8)))
                      : null;
                    
                    // If not found by orderId, use most recent BUY transaction
                    if (!matchingTx) {
                      matchingTx = transactions
                        .sort((a, b) => b.timestamp - a.timestamp)[0];
                    }
                    
                    if (matchingTx) {
                      const updatedData: Partial<TransactionRecord> = {};
                      if (cryptoAmount) {
                        updatedData.tokenAmount = cryptoAmount;
                        console.log('Buy tab - Setting tokenAmount from WebView:', cryptoAmount);
                      }
                      if (cryptoCurrency) {
                        const cryptoUpper = cryptoCurrency.toUpperCase();
                        updatedData.tokenSymbol = cryptoUpper;
                        updatedData.tokenName = cryptoUpper;
                        
                        // CRITICAL: If cryptoCurrency is BTC, also update chainId and networkName
                        // This ensures BTC transactions show correct network (Bitcoin, not Sepolia)
                        if (cryptoUpper === 'BTC') {
                          updatedData.chainId = 0;
                          updatedData.networkName = 'Bitcoin';
                          console.log('Buy tab - Setting BTC network from WebView: chainId=0, networkName=Bitcoin');
                        }
                        
                        console.log('Buy tab - Setting tokenSymbol from WebView:', cryptoUpper);
                      }
                      if (fiatAmount) {
                        updatedData.currencyAmount = fiatAmount;
                        console.log('Buy tab - Setting currencyAmount from WebView:', fiatAmount);
                      }
                      if (fiatCurrency) {
                        updatedData.currencySymbol = fiatCurrency.toUpperCase();
                        console.log('Buy tab - Setting currencySymbol from WebView:', fiatCurrency.toUpperCase());
                      }
                      if (transactionHash) {
                        updatedData.transactionHash = transactionHash;
                        console.log('Buy tab - Setting transactionHash from WebView:', transactionHash);
                      }
                      if (orderId) {
                        updatedData.orderId = orderId;
                        console.log('Buy tab - Setting orderId from WebView:', orderId);
                      }
                      
                      // Use TransactionStore to update (automatic notifications)
                      await transactionStore.updateTransaction(matchingTx.id, updatedData, walletAddress);
                      console.log('Buy tab - ✅ Successfully updated transaction with WebView-extracted data:', {
                        transactionId: matchingTx.id,
                        updatedFields: Object.keys(updatedData),
                        note: 'TransactionStore automatically notified all components - no manual refresh needed!'
                      });
                    } else {
                      console.warn('Buy tab - No matching BUY transaction found to update with WebView data');
                    }
                  });
                }).catch(err => {
                  console.error('Buy tab - Error updating transaction with WebView data:', err);
                });
              } else {
                console.warn('Buy tab - WebView extraction found no usable data (no orderId, cryptoAmount, or fiatAmount)');
              }
            }
          } catch (e) {
            // Silent fail for non-JSON messages
            if (event.nativeEvent.data && typeof event.nativeEvent.data === 'string' && event.nativeEvent.data.trim() !== '') {
              // Log if it looks like it might be a message we care about
              if (event.nativeEvent.data.includes('TRANSAK') || event.nativeEvent.data.includes('transaction')) {
                console.warn('Buy tab - Failed to parse WebView message (might be valid):', event.nativeEvent.data.substring(0, 100));
              }
            }
          }
        }}
        onLoadStart={() => {
          console.log('Buy tab - WebView load start');
          // Set loading during navigation (but don't block if already loaded)
          if (uri) {
            setLoading(true);
          }
        }}
        onLoadEnd={() => {
          console.log('Buy tab - WebView load end');
          // CRITICAL: Always set loading to false when page loads
          // This ensures Transak's form is visible, not stuck on spinner
          setLoading(false);
        }}
        onLoadProgress={(event) => {
          // Progress indicator: if page is mostly loaded (>80%), hide spinner early
          // This makes the page feel faster to users
          if (event.nativeEvent.progress > 0.8) {
            setLoading(false);
          }
        }}
        onError={(e) => {
          console.error('WebView error:', e.nativeEvent);
          // On error, allow back navigation
          setCanGoBack(true);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView HTTP error:', nativeEvent.statusCode, nativeEvent.url);
          // On HTTP error (like 400, 404, 500), allow back navigation
          setCanGoBack(true);
        }}
        {...(Platform.OS === 'ios' ? { useWebKit: true } : {})}
        onNavigationStateChange={(navState) => {
          handleNavigationChange({
            url: navState.url,
            canGoBack: navState.canGoBack
          });
        }}
      />
    </View>
  );
};

// ──────────────────────────────────────────────────────────
const SellRoute: React.FC<{ defaultFiat?: string }> = ({ defaultFiat }) => {
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const { refresh, forceRefresh } = useAssets();

  useFocusEffect(
    useCallback(() => {
      console.log('SellRoute: Focus effect triggered - setting up SELL flow');
      const locale = Localization.getLocales()[0] || { regionCode: 'US', currencyCode: 'USD' };
      const region = locale.regionCode || 'US';
      const restricted = ['US', 'CA'].includes(region);
      setIsRestricted(restricted);
      
      // Reset URI on focus to ensure clean state
      setUri('');
      setLoading(true);

      getWalletAddress().then(async (addr) => {
        if (!addr) {
          setLoading(false);
          return;
        }
        
        if (!restricted) {
          const fiat = defaultFiat || locale.currencyCode || 'USD';
          
          // CRITICAL: Set URL immediately using URL params for instant display (same as Buy route)
          getAllWalletAddresses().then(async (addrMap) => {
            const wad = formatAddressesForTransak(addrMap);
            
            // Set URL immediately for instant webview display
            const immediateUrl = makeTransakUrl({ 
              address: addr || '', 
              fiatCurrency: fiat, 
              product: 'SELL',
              walletAddressesData: wad 
            });
            setUri(immediateUrl);
            setLoading(false); // Show webview immediately
            
            // Try session creation in background (non-blocking)
            try {
              const widgetParams: any = {
                defaultFlow: 'sell',
                productsAvailed: 'SELL',
                defaultProduct: 'SELL',
                isBuyOrSell: 'SELL',
                defaultFiatCurrency: fiat,
                walletAddressesData: wad,
                disableWalletAddressForm: true,
              };
              
              const devServerIp = process.env.EXPO_PUBLIC_NETLIFY_DEV_IP || 'localhost';
              const primaryUrl = __DEV__
                ? `http://${devServerIp}:8888/.netlify/functions/create-transak-session`
                : 'https://cryptopal.app/.netlify/functions/create-transak-session';
              const fallbackUrl = __DEV__
                ? `http://${devServerIp}:8888/create-transak-session`
                : primaryUrl;
              
              const sessionPromise = (url: string) => fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ widgetParams }),
              });
              
              const timeoutPromise = new Promise<Response>((_, reject) => 
                setTimeout(() => reject(new Error('Session creation timeout')), 2000)
              );
              
              let res: Response;
              try {
                res = await Promise.race([sessionPromise(primaryUrl), timeoutPromise]);
              } catch (e) {
                if (__DEV__) {
                  res = await Promise.race([sessionPromise(fallbackUrl), timeoutPromise]);
                } else {
                  throw e;
                }
              }
              if (res.ok) {
                const { sessionId } = await res.json();
                const base = 'https://global-stg.transak.com';
                const sessionUrl = `${base}?apiKey=${TRANSAK_API_KEY}&sessionId=${encodeURIComponent(sessionId)}`;
                // Upgrade to session-based URL if successful
                setUri(sessionUrl);
              }
            } catch (err) {
              // Silent failure - URL params already set
            }
          }).catch(() => {
            // Fallback if getAllWalletAddresses fails
            const fallback = makeTransakUrl({ address: addr || '', fiatCurrency: fiat, product: 'SELL' });
            setUri(fallback);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      }).catch((error) => {
        console.error('Buy tab - Error getting wallet address:', error);
        Alert.alert('Error', `Failed to get wallet address: ${error.message}. Please check your wallet setup.`);
        setLoading(false);
      });
    }, [defaultFiat])
  );

  const handleNavigationChange = (event: { url: string }) => {
    console.log('Sell tab - Navigation change:', event.url);
    if (event.url.includes('transak.com') && event.url.includes('success')) {
      console.log('Sell tab - Transaction successful, force refreshing assets');
      forceRefresh();
    }
  };

  if (loading) return <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />;
  if (isRestricted) return <Text style={styles.restrictedText}>Sell is restricted in your region.</Text>;

  return (
    <View style={{ flex: 1 }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1 }}
        cacheMode="LOAD_NO_CACHE"
        key={`sell-${uri.substring(0, 50)}`}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onLoadStart={() => {
          console.log('Sell tab - WebView load start');
        }}
        onLoadEnd={() => {
          console.log('Sell tab - WebView load end');
          setLoading(false);
        }}
        onError={(e) => console.error('WebView error:', e.nativeEvent)}
        {...(Platform.OS === 'ios' ? { useWebKit: true } : {})}
        onNavigationStateChange={handleNavigationChange}
      />
    </View>
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
    Alert.alert('Buy your crypto', `Selet your currency and coin here... ${a.symbol} on ${a.network || 'mainnet'}…`);
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
        swipeEnabled={false}
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
