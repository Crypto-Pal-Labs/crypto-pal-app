// src/hooks/useAssets.ts
import { useState, useRef, useCallback } from "react";
import * as ethers from "ethers";
import * as Localization from "expo-localization";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useWalletStore } from "../store/useWalletStore";
import { useChain } from "../hooks/useChain";
import { covalentGet } from "../lib/covalent"; // uses EXPO_PUBLIC_COVALENT_KEY if present

// ---------- Types ----------
interface CovalentItem {
  contract_ticker_symbol?: string;
  balance: string;
  logo_url?: string | null;
  type: string; // "cryptocurrency", "stablecoin", "nft", ...
  contract_address?: string;
  nft_data?: any[];
  contract_name?: string;
  contract_decimals?: number;
}

export type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;           // base units
  quoteLocal: number;
  quoteUsd: number;
  logo_url: string;
  contract_address?: string;
  contract_decimals?: number;
  contract_name?: string;
  chainId?: number;          // Added for multi-chain support
};

export type NFTItem = {
  token_id: string;
  token_balance: string;
  contract_name: string;
  contract_address: string;
  logo_url: string;
};

// used by Wallet to invalidate after send
const INVALIDATE_KEY = (addr: string, chainId: number) =>
  `assetsInvalidate:${addr.toLowerCase()}:${chainId}`;

// ---------- Price helpers (CoinGecko with API key + CoinPaprika fallback) ----------
type PriceEntry = { usd: number; local: number };

// Symbol → CoinGecko ID
const CG_IDS: Record<string, string> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  ARB: "arbitrum",
  OP: "optimism",
  BASE: "base",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
};

// Fallback prices for when API fails - using more realistic current prices
const FALLBACK_PRICES: Record<string, { usd: number; local: number }> = {
  MATIC: { usd: 0.65, local: 0.65 }, // More realistic MATIC price
  ETH: { usd: 2500, local: 2500 },
  BNB: { usd: 350, local: 350 },
  AVAX: { usd: 25, local: 25 },
  ARB: { usd: 1.2, local: 1.2 },
  OP: { usd: 2.5, local: 2.5 },
  BASE: { usd: 0.0001, local: 0.0001 },
};

// Price cache to prevent rapid changes
const PRICE_CACHE = new Map<string, { usd: number; local: number; timestamp: number }>();
const PRICE_CACHE_DURATION = 30000; // 30 seconds cache

// Symbol → CoinPaprika ID
const PAPRIKA_IDS: Record<string, string> = {
  ETH: "eth-ethereum",
  BNB: "bnb-binance-coin",
  MATIC: "matic-polygon",
  USDC: "usdc-usd-coin",
  USDT: "usdt-tether",
  DAI: "dai-dai",
};

const CG_DEMO = (process.env.EXPO_PUBLIC_COINGECKO_API_KEY || "").trim();
const CG_PRO  = (process.env.EXPO_PUBLIC_COINGECKO_PRO_API_KEY || "").trim();

function withTimeout<T>(p: Promise<T>, ms = 9000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// CoinGecko price loader with caching and stability
async function loadCgPrices(symbols: string[], localCurrency: string): Promise<Record<string, PriceEntry>> {
  const ids = Array.from(
    new Set(
      symbols.map((s) => CG_IDS[(s || "").toUpperCase()] || "").filter(Boolean)
    )
  );
  if (!ids.length) return {};

  const vs = (localCurrency || "USD").toLowerCase();
  const base = CG_PRO ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";

  const url = `${base}/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd,${encodeURIComponent(vs)}${
    CG_DEMO && !CG_PRO ? `&x_cg_demo_api_key=${encodeURIComponent(CG_DEMO)}` : ""
  }`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (CG_PRO) headers["x-cg-pro-api-key"] = CG_PRO;
  else if (CG_DEMO) headers["x-cg-demo-api-key"] = CG_DEMO;

  try {
    const res = await withTimeout(fetch(url, { headers }), 8500);
    if (!res.ok) throw new Error(`CG HTTP ${res.status}`);
    const data: any = await res.json();
    const out: Record<string, PriceEntry> = {};
    const now = Date.now();
    
    Object.keys(CG_IDS).forEach((sym) => {
      const id = CG_IDS[sym];
      const d = data?.[id] || {};
      const usd = Number(d?.usd || 0);
      const local = Number(d?.[vs] || 0);
      
      // Only use API prices if they're reasonable (not 0 or extremely high)
      if (usd > 0 && usd < 100000 && local > 0 && local < 100000) {
        out[sym] = { usd, local };
        // Cache the price
        PRICE_CACHE.set(sym, { usd, local, timestamp: now });
      } else {
        // Use cached price if available, otherwise fallback
        const cached = PRICE_CACHE.get(sym);
        if (cached && (now - cached.timestamp) < PRICE_CACHE_DURATION) {
          out[sym] = { usd: cached.usd, local: cached.local };
        } else if (FALLBACK_PRICES[sym]) {
          out[sym] = FALLBACK_PRICES[sym];
        }
      }
    });
    
    console.log('CoinGecko prices loaded:', out);
    return out;
  } catch (e) {
    console.log('CoinGecko API failed, using cache/fallback:', e);
    // Return cached prices or fallbacks
    const out: Record<string, PriceEntry> = {};
    const now = Date.now();
    
    symbols.forEach(sym => {
      const cached = PRICE_CACHE.get(sym);
      if (cached && (now - cached.timestamp) < PRICE_CACHE_DURATION) {
        out[sym] = { usd: cached.usd, local: cached.local };
      } else if (FALLBACK_PRICES[sym]) {
        out[sym] = FALLBACK_PRICES[sym];
      }
    });
    
    return out;
  }
}

// CoinPaprika fallback (no key required)
async function loadPaprikaPrices(symbols: string[], localCurrency: string): Promise<Record<string, PriceEntry>> {
  const out: Record<string, PriceEntry> = {};
  const quotesParam = `quotes=USD,${encodeURIComponent(localCurrency.toUpperCase())}`;

  await Promise.all(symbols.map(async (sym) => {
    const id = PAPRIKA_IDS[(sym || "").toUpperCase()];
    if (!id) return;
    const url = `https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(id)}?${quotesParam}`;
    try {
      const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }), 8500);
      if (!res.ok) return;
      const json: any = await res.json();
      const usd = Number(json?.quotes?.USD?.price || 0);
      const loc = Number(json?.quotes?.[localCurrency.toUpperCase()]?.price || 0);
      out[sym.toUpperCase()] = { usd, local: loc };
    } catch { /* ignore */ }
  }));

  return out;
}

// Load prices with CG first, then Paprika fill-ins
async function getPriceMap(symbols: string[], localCurrency: string): Promise<Record<string, PriceEntry>> {
  const unique = Array.from(new Set(symbols.map((s) => (s || "").toUpperCase()).filter(Boolean)));
  if (!unique.length) return {};
  const cg = await loadCgPrices(unique, localCurrency);
  // fill missing or zero via Paprika
  const need = unique.filter((s) => !(cg[s]?.usd > 0));
  if (need.length === 0) return cg;
  const pk = await loadPaprikaPrices(need, localCurrency);
  const merged: Record<string, PriceEntry> = { ...cg };
  for (const s of need) merged[s] = merged[s] || pk[s] || { usd: 0, local: 0 };
  return merged;
}

// ---------- small helpers ----------
function abortableFetch(url: string, timeout = 10000, headers?: Record<string,string>) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  return fetch(url, { headers: { Accept: "application/json", ...(headers || {}) }, signal: ctrl.signal })
    .finally(() => clearTimeout(id));
}

function extractItems(json: any): CovalentItem[] {
  const itemsRaw =
    json?.data?.items ??
    json?.data?.balances ??
    json?.data?.Balances ??
    [];
  if (!Array.isArray(itemsRaw)) return [];
  return itemsRaw as CovalentItem[];
}

// Logos (non-null)
const SYMBOL_LOGO: Record<string, string> = {
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  MATIC: "https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/large/Tether-logo.png",
  DAI: "https://assets.coingecko.com/coins/images/9956/large/4943.png",
};

// ---------- Hook ----------
export const useAssets = () => {
  const address = useWalletStore((s) => s.address);
  const { chain, chains } = useChain();

  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isActiveRef = useRef(true);
  const lastInvalidateRef = useRef<string | null>(null);

  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();

  const RPC_URL = chain.rpcUrls?.[0] || "";

  // ---- Fallback path for chains not supported by Covalent (e.g., Polygon Amoy) ----
  const fetchAssetsFallback = useCallback(async () => {
    if (!address) {
      setError("No wallet address found.");
      setLoading(false);
      return;
    }
    try {
      const provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL, { chainId: chain.chainId, name: chain.name });
      const wei = await provider.getBalance(address);
      const symbol = (chain.nativeSymbol || "ETH").toUpperCase();
      const prices = await getPriceMap([symbol], localCurrency);

      const units = Number(ethers.utils.formatUnits(wei, 18)) || 0;
      const quoteUsd   = units * Number(prices?.[symbol]?.usd || 0);
      const quoteLocal = units * Number(prices?.[symbol]?.local || 0);

      const nativeRow: BalanceItem = {
        contract_ticker_symbol: symbol,
        balance: wei.toString(),
        quoteLocal,
        quoteUsd,
        logo_url: SYMBOL_LOGO[symbol] || SYMBOL_LOGO.ETH,
        contract_decimals: 18,
        contract_address: undefined,
        contract_name: symbol,
      };

      setBalances(units > 0 ? [nativeRow] : [nativeRow]); // show even if 0 units for clarity
      setNfts([]);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "RPC load error.");
    } finally {
      setLoading(false);
    }
  }, [address, RPC_URL, chain.chainId, chain.name, chain.nativeSymbol, localCurrency]);

  // ---- Multi-chain balance fetcher ----
  const fetchAllChainBalances = useCallback(async () => {
    if (!isActiveRef.current || !address) return { balances: [], nfts: [] };

    console.log(`useAssets: Fetching from ${chains.length} chains:`, chains.map(c => c.name));
    
    const allBalances: BalanceItem[] = [];
    const allNfts: NFTItem[] = [];
    const allSymbols = new Set<string>();

    // Fetch from all chains in parallel
    const chainPromises = chains.map(async (currentChain) => {
      try {
        const rpcUrl = currentChain.rpcUrls?.[0];
        if (!rpcUrl) return { balances: [], nfts: [] };

        // If chain is not supported by Covalent OR is Polygon Amoy, use fallback
        if (currentChain.covalentSupported === false || currentChain.chainId === 80002) {
          const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, { 
            chainId: currentChain.chainId, 
            name: currentChain.name 
          });
          const wei = await provider.getBalance(address);
          const symbol = (currentChain.nativeSymbol || "ETH").toUpperCase();
          const units = Number(ethers.utils.formatUnits(wei, 18)) || 0;
          
          // Always include the native token, even if balance is 0, for consistency
          allSymbols.add(symbol);
          return {
            balances: [{
              contract_ticker_symbol: symbol,
              balance: wei.toString(),
              quoteLocal: 0, // Will be filled later
              quoteUsd: 0,   // Will be filled later
              logo_url: SYMBOL_LOGO[symbol] || SYMBOL_LOGO.ETH,
              contract_decimals: 18,
              contract_address: undefined,
              contract_name: symbol,
              chainId: currentChain.chainId,
            }],
            nfts: []
          };
        }

        // Use Covalent for supported chains
        const base = "https://api.covalenthq.com/v1";
        const url = `${base}/${encodeURIComponent(currentChain.covalentChainId as any)}/address/${address}/balances_v2/?quote-currency=USD&format=JSON&nft=true&no-nft-fetch=false&no-spam=true`;

        let json: any = null;
        try { 
          json = await covalentGet(url); 
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (msg.includes("not supported") || msg.includes("501")) {
            // Fallback to RPC for this chain
            const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, { 
              chainId: currentChain.chainId, 
              name: currentChain.name 
            });
            const wei = await provider.getBalance(address);
            const symbol = (currentChain.nativeSymbol || "ETH").toUpperCase();
            const units = Number(ethers.utils.formatUnits(wei, 18)) || 0;
            
            if (units > 0) {
              allSymbols.add(symbol);
              return {
                balances: [{
                  contract_ticker_symbol: symbol,
                  balance: wei.toString(),
                  quoteLocal: 0,
                  quoteUsd: 0,
                  logo_url: SYMBOL_LOGO[symbol] || SYMBOL_LOGO.ETH,
                  contract_decimals: 18,
                  contract_address: undefined,
                  contract_name: symbol,
                  chainId: currentChain.chainId,
                }],
                nfts: []
              };
            }
            return { balances: [], nfts: [] };
          }
          throw e;
        }

        const items: CovalentItem[] = extractItems(json);
        const tokenItems = items.filter((i) => i.type !== "nft");
        const nftItems: NFTItem[] = items
          .filter((i) => i.type === "nft" && (i.nft_data?.length ?? 0) > 0)
          .flatMap((i) =>
            (i.nft_data || []).map((nft) => ({
              token_id: nft.token_id,
              token_balance: nft.token_balance,
              contract_name: i.contract_name || "Unknown",
              contract_address: i.contract_address || "",
              logo_url: nft.token_url || i.logo_url || SYMBOL_LOGO.ETH,
            }))
          );

        // Collect symbols for price lookup
        tokenItems.forEach((i) => {
          const sym = (i.contract_ticker_symbol || "").toUpperCase();
          if (sym) allSymbols.add(sym);
        });

        const balances: BalanceItem[] = tokenItems.map((i) => {
          const sym = (i.contract_ticker_symbol || "TOKEN").toUpperCase();
          const decimals = i.contract_decimals ?? 18;
          return {
            contract_ticker_symbol: sym,
            balance: i.balance || "0",
            quoteLocal: 0, // Will be filled later
            quoteUsd: 0,   // Will be filled later
            logo_url: (i.logo_url || SYMBOL_LOGO[sym] || SYMBOL_LOGO.ETH),
            contract_address: i.contract_address || undefined,
            contract_decimals: decimals,
            contract_name: i.contract_name || undefined,
            chainId: currentChain.chainId,
          };
        });

        return { balances, nfts: nftItems };
      } catch (error) {
        console.warn(`Failed to fetch assets for chain ${currentChain.name}:`, error);
        return { balances: [], nfts: [] };
      }
    });

    const results = await Promise.all(chainPromises);
    
    // Combine all results
    results.forEach(({ balances, nfts }) => {
      allBalances.push(...balances);
      allNfts.push(...nfts);
    });

    // Get prices for all symbols
    const prices = await getPriceMap(Array.from(allSymbols), localCurrency);
    console.log('Price map fetched:', prices);

    // Apply prices to all balances with stability checks
    const pricedBalances = allBalances.map((balance) => {
      const sym = balance.contract_ticker_symbol.toUpperCase();
      const decimals = balance.contract_decimals ?? 18;
      const units = Number(ethers.utils.formatUnits(balance.balance, decimals)) || 0;
      
      // Get prices with stability checks
      let usd = Number(prices?.[sym]?.usd || 0);
      let loc = Number(prices?.[sym]?.local || 0);
      
      // Stability check: if prices are unreasonable, use cached or fallback
      if (usd === 0 || usd > 100000 || loc === 0 || loc > 100000) {
        const cached = PRICE_CACHE.get(sym);
        const now = Date.now();
        
        if (cached && (now - cached.timestamp) < PRICE_CACHE_DURATION) {
          usd = cached.usd;
          loc = cached.local;
          console.log(`Using cached price for ${sym}: usd=${usd}, loc=${loc}`);
        } else if (FALLBACK_PRICES[sym]) {
          usd = FALLBACK_PRICES[sym].usd;
          loc = FALLBACK_PRICES[sym].local;
          console.log(`Using fallback price for ${sym}: usd=${usd}, loc=${loc}`);
        }
      }

      console.log(`Balance pricing for ${sym}: units=${units}, usd=${usd}, loc=${loc}`);

      return {
        ...balance,
        quoteLocal: units * loc,
        quoteUsd: units * usd,
      };
    });

    console.log(`useAssets: Returning ${pricedBalances.length} balances from all chains:`, pricedBalances.map(b => ({ symbol: b.contract_ticker_symbol, chainId: b.chainId })));
    return { balances: pricedBalances, nfts: allNfts };
  }, [address, chains, localCurrency]);

  // ---- Main path (Multi-chain) ----
  const fetchAssetsInternal = useCallback(async () => {
    if (!isActiveRef.current) return;

    if (!address) {
      setError("No wallet address found.");
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { balances, nfts } = await fetchAllChainBalances();
      setBalances(balances);
      setNfts(nfts);
      setError(null);
    } catch (err: any) {
      const msg = String(err?.message || err);
      setError(msg);
      Alert.alert("Load Error", `Failed to load assets: ${msg}. Pull to refresh.`);
    } finally {
      setLoading(false);
    }
  }, [address, fetchAllChainBalances]);

  // ---- refresh controls (60s slow poll + fast "invalidation" ping) ----
  const refresh = useCallback(() => {
    if (!isActiveRef.current) return;
    console.log('Assets refresh triggered');
    fetchAssetsInternal();
  }, [fetchAssetsInternal]);

  const startTimers = useCallback(() => {
    isActiveRef.current = true;

    const slow = setInterval(() => {
      if (isActiveRef.current) fetchAssetsInternal();
    }, 60000);

    // Check for invalidation on any chain
    const invKeys = address ? chains.map(c => INVALIDATE_KEY(address, c.chainId)) : [];
    const fast = setInterval(async () => {
      if (!invKeys.length) return;
      try {
        for (const invKey of invKeys) {
          const bump = await AsyncStorage.getItem(invKey);
          if (bump && bump !== lastInvalidateRef.current) {
            lastInvalidateRef.current = bump;
            fetchAssetsInternal();
            break; // Only refresh once per cycle
          }
        }
      } catch {}
    }, 2000);

    return () => {
      isActiveRef.current = false;
      clearInterval(slow);
      clearInterval(fast);
    };
  }, [address, chains, fetchAssetsInternal]);

  // Manual refresh for external triggers (like Transak purchases)
  const forceRefresh = useCallback(() => {
    console.log('Force refresh triggered');
    if (!isActiveRef.current) return;
    fetchAssetsInternal();
  }, [fetchAssetsInternal]);

  return { balances, nfts, loading, error, refresh, startTimers, forceRefresh };
};
