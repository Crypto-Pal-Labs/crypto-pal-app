// Pre-warm caches for BUY > SEARCH modal so it opens instantly.
// This fills the SAME AsyncStorage keys Buy.tsx already reads,
// so no changes inside Buy.tsx are required.

import AsyncStorage from '@react-native-async-storage/async-storage';

type Pair = [number, number];

const ID_CACHE_KEY       = 'cg_id_cache_v1';
const ABOUT_CACHE_PREFIX = 'cg_about_';
const CHART_CACHE_PREFIX = 'cg_chart_';

// Tweak to your taste: top assets & networks you care about.
// Keep it small (20–40) to avoid hitting CG rate limits.
const POPULAR = [
  'bitcoin|BTC', 'ethereum|ETH', 'tether|USDT', 'binancecoin|BNB', 'usd-coin|USDC',
  'solana|SOL', 'ripple|XRP', 'cardano|ADA', 'dogecoin|DOGE', 'tron|TRX',
  'polkadot|DOT', 'matic-network|MATIC', 'litecoin|LTC', 'chainlink|LINK',
  'bitcoin-cash|BCH', 'stellar|XLM', 'uniswap|UNI', 'ethereum-classic|ETC',
  'cosmos|ATOM', 'filecoin|FIL', 'arbitrum|ARB', 'the-open-network|TON'
];

// Which chart ranges to prefetch. Keep ALL modest (e.g., 1825 days).
const RANGES: Array<{ key: string; days: number }> = [
  { key: '1',   days: 1 },
  { key: '7',   days: 7 },
  { key: '30',  days: 30 },
  { key: '365', days: 365 },
  { key: 'max', days: 1825 },
];

// ──────────────────────────────────────────────────────────
// Helpers (minimal copies of what Buy.tsx uses)
// ──────────────────────────────────────────────────────────
async function saveIdCache(obj: Record<string, string>) {
  await AsyncStorage.setItem(ID_CACHE_KEY, JSON.stringify(obj));
}

async function loadIdCache(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(ID_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function resolveCgId(symbol: string, name?: string, idCache?: Record<string, string>) {
  const sym = (symbol || '').toLowerCase();
  const nm  = (name || '').toLowerCase();
  const k1 = `${sym}|${nm}`;
  const k2 = sym;

  const cache = idCache ?? (await loadIdCache());
  if (cache[k1]) return { id: cache[k1], cache };
  if (cache[k2]) return { id: cache[k2], cache };

  try {
    const q = encodeURIComponent(`${name ?? ''} ${symbol}`.trim());
    const s = await fetch(`https://api.coingecko.com/api/v3/search?query=${q}`);
    const j = await s.json();
    const coins: any[] = Array.isArray(j?.coins) ? j.coins : [];
    let pick = coins.find(c => (c?.symbol || '').toLowerCase() === sym);
    if (!pick && nm) pick = coins.find(c => (c?.name || '').toLowerCase().includes(nm));
    const id = (pick?.id || coins[0]?.id) as string | undefined;
    if (!id) return { id: null, cache };
    cache[k1] = id; cache[k2] = id;
    await saveIdCache(cache);
    return { id, cache };
  } catch {
    return { id: null, cache };
  }
}

async function prefetchAbout(id: string) {
  const key = ABOUT_CACHE_PREFIX + id;
  const have = await AsyncStorage.getItem(key);
  if (have != null) return;
  try {
    const r  = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`);
    const j  = await r.json();
    const txt = (j?.description?.en as string | undefined)?.replace(/<\/?[^>]+(>|$)/g, '') || '';
    await AsyncStorage.setItem(key, txt);
  } catch {}
}

async function prefetchChart(id: string, rk: string, days: number) {
  const key = `${CHART_CACHE_PREFIX}${id}_${rk}`;
  const have = await AsyncStorage.getItem(key);
  if (have != null) return;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`);
    const j = await r.json();
    const pairs: Pair[] = (j?.prices || []);
    await AsyncStorage.setItem(key, JSON.stringify(pairs));
  } catch {}
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// ──────────────────────────────────────────────────────────
// Public entry: call once on app start
// ──────────────────────────────────────────────────────────
export async function prewarmBuySearchCache() {
  // 1) Seed the ID cache quickly via the /markets endpoint (fast, 250 ids)
  try {
    const m = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false`);
    const list: Array<{ id: string; symbol: string; name: string }> = await m.json();
    const idCache = await loadIdCache();
    for (const row of list) {
      const sym = (row.symbol || '').toLowerCase();
      idCache[sym] = row.id;
      idCache[`${sym}|${(row.name || '').toLowerCase()}`] = row.id;
    }
    await saveIdCache(idCache);
  } catch {}

  // 2) Pre-resolve & prefetch content for a curated small set
  let cache = await loadIdCache();
  let count = 0;

  for (const entry of POPULAR) {
    const [name, sym] = entry.includes('|') ? entry.split('|') : [entry, entry];
    const out = await resolveCgId(sym, name, cache);
    cache = out.cache;
    const id = out.id;
    if (!id) continue;

    // About
    await prefetchAbout(id);

    // A couple of ranges first (so modal paints instantly),
    // then the rest with gentle throttling to avoid 429s.
    await Promise.allSettled([
      prefetchChart(id, '7', 7),
      prefetchChart(id, '1', 1),
    ]);

    await sleep(80);
    for (const r of RANGES) {
      if (r.key === '7' || r.key === '1') continue;
      await prefetchChart(id, r.key, r.days);
      await sleep(120);
    }

    // Soft limit to stay polite
    count += 1;
    if (count >= 25) break;
  }
}
