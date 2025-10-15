// src/hooks/useAssets.ts
import { useState, useRef, useCallback } from "react";
import { useWalletStore } from "../store/useWalletStore";
import * as ethers from "ethers";
import { useChain } from "../hooks/useChain";
import { useFocusEffect } from "@react-navigation/native";
import * as Localization from "expo-localization";
import { Alert } from "react-native";
import { covalent } from "../lib/covalent";
import { getExtra } from "../config/extra";

interface CovalentItem {
  contract_ticker_symbol?: string;
  balance: string;
  quote?: number;
  logo_url?: string;
  type: string;
  contract_address?: string;
  nft_data?: any[];
  contract_name?: string;
  contract_decimals?: number;
}

export type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;
  quoteLocal: number;
  quoteUsd: number;
  logo_url: string;
};

export type NFTItem = {
  token_id: string;
  token_balance: string;
  contract_name: string;
  contract_address: string;
  logo_url: string;
};

export const useAssets = () => {
  const address = useWalletStore((s) => s.address);
  const { chain } = useChain();
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isActiveRef = useRef(true);

  const EXTRA = getExtra();
  const HAS_AUTH =
    typeof EXTRA?.COVALENT_AUTH_B64 === "string" &&
    EXTRA.COVALENT_AUTH_B64.length > 10;

  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "usd").toLowerCase();

  const RPC_URL = chain.rpcUrls[0] || "";

  // ---- simple helpers ----
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

  // ---- Fallback for chains where Covalent isn't supported (e.g., Polygon Amoy) ----
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
      const id = tickerToIdMap[symbol as keyof typeof tickerToIdMap] || "";
      const parsed = Number(ethers.utils.formatUnits(wei, 18)) || 0;
      const quoteLocal = parsed * (prices?.[id]?.[localCurrency] ?? 0);
      const quoteUsd = parsed * (prices?.[id]?.usd ?? 0);

      const nativeRow: BalanceItem = {
        contract_ticker_symbol: symbol,
        balance: wei.toString(),
        quoteLocal,
        quoteUsd,
        logo_url: "https://placeholder.com/40x40", // optional: add chain logo later
      };

      setBalances(parsed > 0 ? [nativeRow] : []); // only native balance for fallback
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
        const data = await covalent.balances(chain.covalentChainId, address, { includeNft: true });
        const items: CovalentItem[] = data?.data?.items || [];

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

        const pricedBalances = tempBalances.map((i) => {
          const ticker = (i.contract_ticker_symbol || "").toUpperCase();
          const id = tickerToIdMap[ticker as keyof typeof tickerToIdMap] || "";
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
          };
        });

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
      const interval = setInterval(() => {
        if (!loading && isActiveRef.current) debouncedFetch();
      }, 10000);
      return () => {
        isActiveRef.current = false;
        clearInterval(interval);
      };
    }, [chain.covalentChainId, chain.covalentSupported, chain.rpcUrls, address])
  );

  return { balances, nfts, loading, error, refresh: debouncedFetch };
};
