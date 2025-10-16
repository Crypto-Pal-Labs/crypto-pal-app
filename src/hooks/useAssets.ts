// src/hooks/useAssets.ts
import { useState, useRef, useCallback } from "react";
import { useWalletStore } from "../store/useWalletStore";
import * as ethers from "ethers";
import { useChain } from "../hooks/useChain";
import { useFocusEffect } from "@react-navigation/native";
import * as Localization from "expo-localization";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { covalentGet } from "../lib/covalent";   // ← uses Basic / X-API-Key internally
import { getExtra } from "../config/extra";

interface CovalentItem {
  contract_ticker_symbol?: string;
  balance: string;
  quote?: number;
  logo_url?: string;
  type: string; // e.g. "cryptocurrency", "stablecoin", "nft", etc.
  contract_address?: string;
  nft_data?: any[];
  contract_name?: string;
  contract_decimals?: number;
}

export type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;                 // base units
  quoteLocal: number;
  quoteUsd: number;
  logo_url: string;
  // NEW: carry precise token meta so UI can format correctly
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

const INVALIDATE_KEY = (addr: string, chainId: number) =>
  `assetsInvalidate:${addr.toLowerCase()}:${chainId}`;

// Small helper to bound long RPC calls
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { onTimeout ? resolve(onTimeout()) : reject(new Error('timeout')); }, ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); onTimeout ? resolve(onTimeout()) : reject(e); });
  });
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

  const EXTRA = getExtra();
  const HAS_AUTH =
    typeof EXTRA?.COVALENT_AUTH_B64 === "string" &&
    EXTRA.COVALENT_AUTH_B64.length > 10;

  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "usd").toLowerCase();

  const RPC_URL = chain.rpcUrls[0] || "";

  // ---------- helpers ----------
  const retryFetch = async (fn: () => Promise<any>, retries = 3, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        console.warn(`Retry attempt ${attempt} failed:`, err?.message || err);
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  };

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  };

  // Normalize Covalent balances payload: supports data.items OR data.balances
  function extractItems(json: any): CovalentItem[] {
    const itemsRaw =
      json?.data?.items ??
      json?.data?.balances ??
      json?.data?.Balances ??
      [];
    if (!Array.isArray(itemsRaw)) {
      throw new Error("Covalent payload missing items/balances");
    }
    return itemsRaw as CovalentItem[];
  }

  // ---- CoinGecko price map used in both main and fallback paths ----
  const tickerToIdMap = {
    ETH: "ethereum",
    USDC: "usd-coin",
    BNB: "binancecoin",
    MATIC: "matic-network",
  } as const;

  const loadCgPrices = async (symbols: string[]) => {
    const ids = [
      ...new Set(
        symbols
          .map((sym) => tickerToIdMap[sym as keyof typeof tickerToIdMap] || "")
          .filter(Boolean)
      ),
    ];
    if (ids.length === 0) return {};
    const vsCurrencies = `usd,${localCurrency}`;
    const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(
      ","
    )}&vs_currencies=${vsCurrencies}`;
    const priceResp = await fetchWithTimeout(priceUrl);
    if (!priceResp.ok) return {};
    return priceResp.json();
  };

  // ---- Fallback for chains where Covalent isn't supported (e.g., testnets) ----
  const fetchAssetsFallback = async () => {
    if (!address) {
      setError("No wallet address found.");
      setLoading(false);
      return;
    }

    try {
      const provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL, {
        chainId: chain.chainId,
        name: chain.name,
      });
      const wei = await provider.getBalance(address);
      const symbol = chain.nativeSymbol;
      const prices = await loadCgPrices([symbol]);
      const id = (symbol as "ETH" | "BNB" | "MATIC") in tickerToIdMap
        ? tickerToIdMap[symbol as keyof typeof tickerToIdMap]
        : "";
      const parsed = Number(ethers.utils.formatUnits(wei, 18)) || 0;
      const quoteLocal = parsed * (prices?.[id]?.[localCurrency] ?? 0);
      const quoteUsd = parsed * (prices?.[id]?.usd ?? 0);

      const nativeRow: BalanceItem = {
        contract_ticker_symbol: symbol,
        balance: wei.toString(),
        quoteLocal,
        quoteUsd,
        logo_url: "https://placeholder.com/40x40",
        contract_decimals: 18,
        contract_address: undefined,
        contract_name: symbol,
      };

      setBalances(parsed > 0 ? [nativeRow] : []);
      setNfts([]); // NFTs unsupported via fallback
      setError(null);
    } catch (e: any) {
      setError(e?.message || "RPC error while loading balance.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetsInternal = async () => {
    if (!isActiveRef.current) return;

    if (!address) {
      setError("No wallet address found.");
      setLoading(false);
      return;
    }

    // If Covalent isn't supported for this chain → use fallback immediately
    if (chain.covalentSupported === false) {
      await fetchAssetsFallback();
      return;
    }

    if (!HAS_AUTH) {
      setError("Covalent auth missing in build. Check EXPO_PUBLIC_COVALENT_KEY.");
      setLoading(false);
      Alert.alert("Config Error", "Covalent auth missing in build.");
      return;
    }

    setError(null);
    try {
      await retryFetch(async () => {
        // Build the v2 balances endpoint; covalentGet adds the Basic header
        const base = "https://api.covalenthq.com/v1";
        const url = `${base}/${encodeURIComponent(
          chain.covalentChainId
        )}/address/${address}/balances_v2/?quote-currency=USD&format=JSON&nft=true&no-nft-fetch=false&no-spam=true`;

        let json: any;
        try {
          json = await covalentGet(url);
        } catch (e: any) {
          // If API says not supported, fall back to RPC
          const msg = String(e?.message || e);
          if (msg.includes("not supported") || msg.includes("501")) {
            await fetchAssetsFallback();
            return;
          }
          throw e;
        }

        const items: CovalentItem[] = extractItems(json);

        const tempBalances = items.filter((i) => i.type !== "nft" && i.balance !== "0");
        const nftItems =
          items
            .filter((i) => i.type === "nft" && (i.nft_data?.length ?? 0) > 0)
            .flatMap((i) =>
              (i.nft_data || []).map((nft) => ({
                token_id: nft.token_id,
                token_balance: nft.token_balance,
                contract_name: i.contract_name || "Unknown",
                contract_address: i.contract_address || "",
                logo_url: nft.token_url || i.logo_url || "https://placeholder.com/40x40",
              }))
            ) || [];

        setNfts(nftItems);

        const prices = await loadCgPrices(
          tempBalances.map((i) => (i.contract_ticker_symbol || "").toUpperCase())
        );

        const pricedBalances: BalanceItem[] = tempBalances.map((i) => {
          const ticker = (i.contract_ticker_symbol || "").toUpperCase();
          const id = (ticker as "ETH" | "USDC" | "BNB" | "MATIC") in tickerToIdMap
            ? tickerToIdMap[ticker as keyof typeof tickerToIdMap]
            : "";
          const decimals = i.contract_decimals ?? 18;
          const parsed = Number(ethers.utils.formatUnits(i.balance || "0", decimals)) || 0;
          const quoteLocal = parsed * (prices?.[id]?.[localCurrency] ?? 0);
          const quoteUsd = parsed * (prices?.[id]?.usd ?? 0);
          return {
            contract_ticker_symbol: i.contract_ticker_symbol || "Unknown",
            balance: i.balance || "0",
            quoteLocal,
            quoteUsd,
            logo_url: i.logo_url || "https://placeholder.com/40x40",
            // carry meta forward
            contract_address: i.contract_address || undefined,
            contract_decimals: decimals,
            contract_name: i.contract_name || undefined,
          };
        });

        // ★ NEW: always override native balance with live RPC so it reflects instantly (sender & receiver)
        try {
          const providerLive = new ethers.providers.StaticJsonRpcProvider(RPC_URL, {
            chainId: chain.chainId, name: chain.name,
          });
          const liveWei = await withTimeout(providerLive.getBalance(address), 2500, () => null as any);
          if (liveWei) {
            const nativeSymbol = (chain.nativeSymbol || 'ETH').toUpperCase() as 'ETH'|'BNB'|'MATIC';
            const id = (nativeSymbol in tickerToIdMap) ? tickerToIdMap[nativeSymbol] : '';
            const parsed = Number(ethers.utils.formatEther(liveWei)) || 0;
            const quoteLocal = parsed * (prices?.[id]?.[localCurrency] ?? 0);
            const quoteUsd = parsed * (prices?.[id]?.usd ?? 0);

            const idx = pricedBalances.findIndex(
              (b) => (b.contract_ticker_symbol || '').toUpperCase() === nativeSymbol
            );
            if (idx >= 0) {
              pricedBalances[idx] = {
                ...pricedBalances[idx],
                balance: liveWei.toString(),
                quoteLocal,
                quoteUsd,
              };
            } else {
              pricedBalances.unshift({
                contract_ticker_symbol: nativeSymbol,
                balance: liveWei.toString(),
                quoteLocal,
                quoteUsd,
                logo_url: 'https://placeholder.com/40x40',
                contract_decimals: 18,
                contract_address: undefined,
                contract_name: nativeSymbol,
              });
            }
          }
        } catch {}

        setBalances(pricedBalances);
      });
    } catch (err: any) {
      const msg = String(err?.message || err);
      // If Covalent replies "not supported", silently fallback to RPC
      if (msg.includes("not supported") || msg.includes("501")) {
        await fetchAssetsFallback();
        return;
      }
      setError(msg);
      Alert.alert("Load Error", `Failed to load assets: ${msg}. Pull to refresh.`);
    } finally {
      setLoading(false);
    }
  };

  // refresh control (keep your debounce rhythm)
  const debounce = (fn: () => void, ms: number) => {
    let timeout: any = null;
    return () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(fn, ms);
    };
  };
  const debouncedFetch = debounce(fetchAssetsInternal, 500);

  useFocusEffect(
    useCallback(() => {
      isActiveRef.current = true;
      debouncedFetch();

      // slow periodic refresh
      const slow = setInterval(() => {
        if (!loading && isActiveRef.current) debouncedFetch();
      }, 10000);

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
      }, 1500);

      return () => {
        isActiveRef.current = false;
        clearInterval(slow);
        clearInterval(fast);
      };
    }, [chain.covalentChainId, chain.covalentSupported, chain.rpcUrls, address])
  );

  return { balances, nfts, loading, error, refresh: debouncedFetch };
};
