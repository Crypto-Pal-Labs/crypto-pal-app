// src/services/coingecko.ts
const BASE = 'https://api.coingecko.com/api/v3';

import { cacheGet, cacheSet } from '../utils/cache';

const KEY_ID_MAP = 'cg:idmap:v1';
const KEY_CHART = (id: string, days: string | number) => `cg:chart:${id}:${days}`;
const TTL_ID_MAP = 24 * 60 * 60 * 1000;  // 24h
const TTL_CHART  = 6  * 60 * 60 * 1000;  // 6h

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (res.ok) return res;
      if (res.status === 429) await new Promise(r => setTimeout(r, 600 + i * 400));
      else await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw lastErr ?? new Error('Network error');
}

export type CgCoin = { id: string; symbol: string; name: string };
export async function getIdMap(): Promise<CgCoin[]> {
  const cached = await cacheGet<CgCoin[]>(KEY_ID_MAP);
  if (cached) return cached;
  const res = await fetchWithRetry(`${BASE}/coins/list?include_platform=false`);
  const data = (await res.json()) as CgCoin[];
  // Keep small to reduce memory? we’ll store all; filter can happen in caller.
  await cacheSet(KEY_ID_MAP, data, TTL_ID_MAP);
  return data;
}

export type CgMarket = {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  market_cap: number | null;
  current_price: number | null;
};
export async function getMarketsByIds(ids: string[]): Promise<Record<string, CgMarket>> {
  if (!ids.length) return {};
  const chunked: string[][] = [];
  for (let i = 0; i < ids.length; i += 200) chunked.push(ids.slice(i, i + 200));

  const out: Record<string, CgMarket> = {};
  for (const chunk of chunked) {
    const url = `${BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(chunk.join(','))}&per_page=${chunk.length}`;
    const res = await fetchWithRetry(url);
    const arr = (await res.json()) as any[];
    for (const x of arr) {
      out[x.id] = {
        id: x.id, symbol: x.symbol, name: x.name,
        image: x.image ?? null,
        market_cap: x.market_cap ?? null,
        current_price: x.current_price ?? null,
      };
    }
  }
  return out;
}

export type CgChart = { prices: [number, number][] };
export async function getMarketChart(id: string, days: number | 'max'): Promise<CgChart | null> {
  const key = KEY_CHART(id, String(days));
  const cached = await cacheGet<CgChart>(key);
  if (cached) return cached;
  const url = `${BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  try {
    const res = await fetchWithRetry(url);
    const data = (await res.json()) as CgChart;
    if (data?.prices?.length) await cacheSet(key, data, TTL_CHART);
    return data ?? null;
  } catch {
    return null;
  }
}
