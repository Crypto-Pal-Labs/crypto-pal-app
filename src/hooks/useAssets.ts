// src/hooks/useAssets.ts
import { useState, useRef, useCallback } from "react";
import * as ethers from "ethers";
import * as Localization from "expo-localization";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useWalletStore } from "../store/useWalletStore";
import { useChain } from "../hooks/useChain";
import { covalentGet } from "../lib/covalent"; // reads EXPO_PUBLIC_COVALENT_KEY internally

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
  // token meta → helps UI format correctly
  contract_address?: string;
  contract_decimals?: number;
  contract_name?: string;
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
  if (!Array.isArray(itemsRaw)) throw new Error("Covalent payload missing items/balances");
  return itemsRaw as CovalentItem[];
}

// CG id map for symbols we support in v1
const TICKER_TO_ID = {
  ETH: "ethereum",
  BNB: "binancecoin",
  MATIC: "matic-network",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
} as const;

const SYMBOL_LOGO: Record<string, string> = {
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  MATIC: "https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/large/Tether-logo.png",
  DAI: "https://assets.coingecko.com/coins/images/9956/large/4943.png",
};

// fetch CoinGecko prices for a set of symbols (USD + local)
async function loadCgPrices(symbols: string[], localCurrency: string) {
  const ids = Array.from(
    new Set(
      symbols
        .map((s) => TICKER_TO_ID[(s || "").toUpperCase() as keyof typeof TICKER_TO_ID] || "")
        .filter(Boolean)
    )
  );
  if (!ids.length) return {} as Record<string, any>;

  const vs = `usd,${(localCurrency || "usd").toLowerCase()}`;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=${vs}`;
  const res = await abortableFetch(url, 8000);
  if (!res.ok) return {};
  return res.json();
}

export const useAssets = () => {
  const address = useWalletStore((s) => s.address);
  const { chain } = useChain();

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
      const prices = await loadCgPrices([symbol], localCurrency);
      const id = TICKER_TO_ID[symbol as keyof typeof TICKER_TO_ID] || "";
      const parsed = Number(ethers.utils.formatUnits(wei, 18)) || 0;
      const quoteLocal = parsed * Number(prices?.[id]?.[localCurrency.toLowerCase()] || 0);
      const quoteUsd = parsed * Number(prices?.[id]?.usd || 0);

      const nativeRow: BalanceItem = {
        contract_ticker_symbol: symbol,
        balance: wei.toString(),
        quoteLocal,
        quoteUsd,
        logo_url: SYMBOL_LOGO[symbol] || "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
        contract_decimals: 18,
        contract_address: undefined,
        contract_name: symbol,
      };

      setBalances(parsed > 0 ? [nativeRow] : []);
      setNfts([]); // NFTs via fallback not implemented (ok for MVP)
      setError(null);
    } catch (e: any) {
      setError(e?.message || "RPC error while loading balance.");
    } finally {
      setLoading(false);
    }
  }, [address, RPC_URL, chain.chainId, chain.name, chain.nativeSymbol, localCurrency]);

  // ---- Main path (Covalent) with safety nets + live native override ----
  const fetchAssetsInternal = useCallback(async () => {
    if (!isActiveRef.current) return;

    if (!address) {
      setError("No wallet address found.");
      setLoading(false);
      return;
    }

    // If this chain is not supported by Covalent, jump straight to fallback
    if (chain.covalentSupported === false) {
      await fetchAssetsFallback();
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // 1) Covalent balances_v2
      const base = "https://api.covalenthq.com/v1";
      const url = `${base}/${encodeURIComponent(chain.covalentChainId)}/address/${address}/balances_v2/?quote-currency=USD&format=JSON&nft=true&no-nft-fetch=false&no-spam=true`;

      let json: any;
      try {
        json = await covalentGet(url);
      } catch (e: any) {
        const msg = String(e?.message || e);
        // Chain not supported → fallback
        if (msg.includes("not supported") || msg.includes("501")) {
          await fetchAssetsFallback();
          return;
        }
        throw e;
      }

      const items: CovalentItem[] = extractItems(json);

      // 2) Split tokens vs NFTs
      const tokenItems = items.filter((i) => i.type !== "nft" && i.balance !== "0");
      const nftItems: NFTItem[] =
        (items
          .filter((i) => i.type === "nft" && (i.nft_data?.length ?? 0) > 0)
          .flatMap((i) =>
            (i.nft_data || []).map((nft) => ({
              token_id: nft.token_id,
              token_balance: nft.token_balance,
              contract_name: i.contract_name || "Unknown",
              contract_address: i.contract_address || "",
              logo_url: nft.token_url || i.logo_url || "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
            }))
          )) || [];

      // 3) Price map
      const symbols = tokenItems.map((i) => (i.contract_ticker_symbol || "").toUpperCase());
      const prices = await loadCgPrices(symbols, localCurrency);

      // 4) Build balance rows with USD/local quotes
      const pricedBalances: BalanceItem[] = tokenItems.map((i) => {
        const sym = (i.contract_ticker_symbol || "TOKEN").toUpperCase();
        const id = TICKER_TO_ID[sym as keyof typeof TICKER_TO_ID] || "";
        const decimals = i.contract_decimals ?? 18;
        const units = Number(ethers.utils.formatUnits(i.balance || "0", decimals)) || 0;

        const usd = Number(prices?.[id]?.usd || 0);
        const loc = Number(prices?.[id]?.[localCurrency.toLowerCase()] || 0);

        return {
          contract_ticker_symbol: sym,
          balance: i.balance || "0",
          quoteLocal: units * loc,
          quoteUsd: units * usd,
          logo_url: i.logo_url || SYMBOL_LOGO[sym] || "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
          contract_address: i.contract_address || undefined,
          contract_decimals: decimals,
          contract_name: i.contract_name || undefined,
        };
      });

      // 5) Live native override (so sender/receiver both update instantly)
      try {
        const providerLive = new ethers.providers.StaticJsonRpcProvider(RPC_URL, { chainId: chain.chainId, name: chain.name });
        const liveWei = await providerLive.getBalance(address);
        const nativeSym = (chain.nativeSymbol || "ETH").toUpperCase();
        const id = TICKER_TO_ID[nativeSym as keyof typeof TICKER_TO_ID] || "";
        const units = Number(ethers.utils.formatEther(liveWei)) || 0;
        const usd = Number(prices?.[id]?.usd || 0);
        const loc = Number(prices?.[id]?.[localCurrency.toLowerCase()] || 0);

        const idx = pricedBalances.findIndex((b) => b.contract_ticker_symbol.toUpperCase() === nativeSym);
        const nativeRow: BalanceItem = {
          contract_ticker_symbol: nativeSym,
          balance: liveWei.toString(),
          quoteLocal: units * loc,
          quoteUsd: units * usd,
          logo_url: SYMBOL_LOGO[nativeSym] || "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
          contract_decimals: 18,
          contract_address: undefined,
          contract_name: nativeSym,
        };
        if (idx >= 0) pricedBalances[idx] = nativeRow;
        else pricedBalances.unshift(nativeRow);
      } catch {
        // non-fatal
      }

      setNfts(nftItems);
      setBalances(pricedBalances);
      setError(null);
    } catch (err: any) {
      const msg = String(err?.message || err);
      setError(msg);
      Alert.alert("Load Error", `Failed to load assets: ${msg}. Pull to refresh.`);
    } finally {
      setLoading(false);
    }
  }, [address, chain.covalentChainId, chain.covalentSupported, chain.chainId, chain.name, chain.nativeSymbol, RPC_URL, localCurrency, fetchAssetsFallback]);

  // ---- refresh wiring: run once on focus, then every 60s, plus fast invalidation watcher ----
  const refresh = useCallback(() => {
    if (!isActiveRef.current) return;
    fetchAssetsInternal();
  }, [fetchAssetsInternal]);

  // mimic useFocusEffect without importing it here; parent will call refresh on tab focus anyway
  // but we also keep a background 60s tick while the tab is open
  const startTimers = useCallback(() => {
    isActiveRef.current = true;

    // slow periodic refresh (60s) to avoid flicker
    const slow = setInterval(() => {
      if (isActiveRef.current) fetchAssetsInternal();
    }, 60000);

    // fast invalidation watcher (so Wallet refreshes right after send)
    const invKey = address ? INVALIDATE_KEY(address, chain.chainId) : null;
    const fast = setInterval(async () => {
      if (!invKey) return;
      try {
        const bump = await AsyncStorage.getItem(invKey);
        if (bump && bump !== lastInvalidateRef.current) {
          lastInvalidateRef.current = bump;
          fetchAssetsInternal();
        }
      } catch {}
    }, 2000);

    return () => {
      isActiveRef.current = false;
      clearInterval(slow);
      clearInterval(fast);
    };
  }, [address, chain.chainId, fetchAssetsInternal]);

  // expose timers to parent (Wallet will mount/unmount this hook with tab)
  // parent triggers initial refresh, then timers keep it warm
  // We simply kick off fetch once now for safety:
  if (isActiveRef.current && balances.length === 0 && !loading) {
    // noop: avoids surprise calls during replacements; Wallet will call refresh()
  }

  return { balances, nfts, loading, error, refresh, startTimers };
};
