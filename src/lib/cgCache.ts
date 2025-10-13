// src/lib/cgCache.ts
// Simple in-memory cache for CoinGecko IDs and market rows.
// Works across the app lifetime (resets on app restart).

export type CGMarket = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  sparkline_in_7d?: { price: number[] };
};

type IdKey = string;     // e.g. "eth|ethereum" or "eth"
type CGId = string;      // e.g. "ethereum"

const ID_TTL_MS = 1000 * 60 * 60 * 24; // 24h — IDs basically never change
const MK_TTL_MS = 1000 * 60 * 5;       // 5 minutes for prices

const idStore = new Map<IdKey, { id: CGId; ts: number }>();
const marketStore = new Map<CGId, { row: CGMarket; ts: number }>();

const now = () => Date.now();

export function getCachedId(key: IdKey): string | undefined {
  const r = idStore.get(key);
  if (!r) return;
  if (now() - r.ts > ID_TTL_MS) { idStore.delete(key); return; }
  return r.id;
}

export function setCachedId(key: IdKey, id: string) {
  idStore.set(key, { id, ts: now() });
}

export function getCachedMarket(id: string): CGMarket | undefined {
  const r = marketStore.get(id);
  if (!r) return;
  if (now() - r.ts > MK_TTL_MS) { marketStore.delete(id); return; }
  return r.row;
}

export function setCachedMarkets(rows: CGMarket[]) {
  const ts = now();
  rows.forEach(row => marketStore.set(row.id, { row, ts }));
}

// Resolve a CG id by symbol/name (with cache + /search fallback)
export async function resolveCgId(symbol: string, name?: string): Promise<string | null> {
  const sym = (symbol || '').toLowerCase();
  const nm = (name || '').toLowerCase();
  const k1 = `${sym}|${nm}`;  // best key (symbol + name)
  const k2 = sym;             // fallback key (symbol only)

  const c1 = getCachedId(k1);
  if (c1) return c1;
  const c2 = getCachedId(k2);
  if (c2) return c2;

  try {
    const q = encodeURIComponent(`${name ?? ''} ${symbol}`.trim());
    const s = await fetch(`https://api.coingecko.com/api/v3/search?query=${q}`);
    const j = await s.json();

    const coins = Array.isArray(j?.coins) ? j.coins : [];
    // Try to match by exact symbol first, then pick first result
    const lowerSym = sym;
    let pick = coins.find((c: any) => (c?.symbol || '').toLowerCase() === lowerSym);

    // If ambiguous, prefer name match that contains our name
    if (!pick && nm) {
      pick = coins.find((c: any) => (c?.name || '').toLowerCase().includes(nm));
    }

    // Otherwise fallback to the first hit
    const id = (pick?.id || coins[0]?.id) as string | undefined;
    if (!id) return null;

    setCachedId(k1, id);
    setCachedId(k2, id);
    return id;
  } catch {
    return null;
  }
}

// Fetch market rows for a list of ids in batches, using cache (5m TTL)
export async function fetchMarketsBatched(ids: string[]): Promise<CGMarket[]> {
  const unique = Array.from(new Set(ids));
  const fresh: CGMarket[] = [];
  const missing: string[] = [];

  unique.forEach(id => {
    const hit = getCachedMarket(id);
    if (hit) fresh.push(hit);
    else missing.push(id);
  });

  if (!missing.length) return fresh;

  // Batch by 50 ids (CG supports a fair number per call)
  const B = 50;
  for (let i = 0; i < missing.length; i += B) {
    const slice = missing.slice(i, i + B);
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
      slice.join(',')
    )}&sparkline=true&price_change_percentage=1h,24h,7d`;
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const rows: CGMarket[] = await r.json();
      setCachedMarkets(rows);
      fresh.push(...rows);
      // tiny delay to be kind to CG rate-limits
      if (i + B < missing.length) {
        await new Promise(res => setTimeout(res, 250));
      }
    } catch {
      // ignore batch errors; we still return what we have
    }
  }

  return fresh;
}
