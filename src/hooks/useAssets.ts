// src/hooks/useAssets.ts
import { useState, useRef, useCallback } from "react";
import { useWalletStore } from "../store/useWalletStore";
import * as ethers from "ethers";
import { useChain } from "../hooks/useChain";
import { useFocusEffect } from "@react-navigation/native";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { covalentGet } from "../lib/covalent";

type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;                // base units (token decimals)
  quoteLocal?: number;            // local fiat (approx)
  quoteUsd?: number;              // USD fiat (approx)
  logo_url?: string;
  contract_address?: string;
  contract_decimals?: number;
  contract_name?: string;
};

type UseAssetsResult = {
  balances: BalanceItem[];
  nfts: any[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// Sticky cache from HistoryTab (contains recent token contracts seen)
const RX_CACHE_KEY = (addr: string) => `rxCache_v1:${addr.toLowerCase()}`;
const INVALIDATE_KEY = (addr: string, chainId: number) => `assetsInvalidate:${addr.toLowerCase()}:${chainId}`;

const CG_IDS: Record<"ETH" | "BNB" | "MATIC", string> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  MATIC: "matic-network",
};

export function useAssets(): UseAssetsResult {
  const address = useWalletStore((s) => s.address);
  const { chain } = useChain();

  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [nfts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isActiveRef = useRef<boolean>(false);
  const lastInvalidateRef = useRef<string | null>(null);

  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();
  const localVs = localCurrency.toLowerCase();

  const RPC_URL = chain.rpcUrls?.[0] || "";

  const fetchPrices = useCallback(async (sym: "ETH" | "BNB" | "MATIC") => {
    try {
      const id = CG_IDS[sym] || "ethereum";
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,${localVs}`;
      const j = await fetch(url).then((r) => r.json());
      const usd = Number(j?.[id]?.usd || 0);
      const local = Number(j?.[id]?.[localVs] || 0);
      return { usd, local };
    } catch {
      return { usd: 0, local: 0 };
    }
  }, [localVs]);

  // Merge RPC token balances for contracts seen in recent History (receiver immediacy)
  const mergeRpcTokenBalances = useCallback(async (owner: string, list: BalanceItem[]) => {
    if (!owner || !RPC_URL) return list;
    const provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL, { chainId: chain.chainId, name: chain.name });

    // collect contracts from sticky cache for this chain
    let contracts: string[] = [];
    try {
      const raw = await AsyncStorage.getItem(RX_CACHE_KEY(owner));
      if (raw) {
        const arr = JSON.parse(raw) as any[];
        const set = new Set<string>();
        for (const t of arr) {
          if (t?.isToken && Number(t.chainId) === Number(chain.chainId) && t?.tokenContract) {
            set.add(String(t.tokenContract).toLowerCase());
          }
        }
        contracts = Array.from(set).slice(0, 40);
      }
    } catch {}

    const byAddr = new Map<string, BalanceItem>();
    list.forEach((b) => {
      if (b.contract_address) byAddr.set(b.contract_address.toLowerCase(), b);
    });

    for (const ct of contracts) {
      if (!ct || byAddr.has(ct)) continue;
      try {
        const erc20 = new ethers.Contract(ct, ERC20_ABI, provider);
        const [bal, symR, decR] = await Promise.all([
          erc20.balanceOf(owner),
          erc20.symbol().catch(() => "TOKEN"),
          erc20.decimals().catch(() => 18),
        ]);
        if (!bal || bal.isZero()) continue;
        const sym = String(symR || "TOKEN");
        const dec = Number(decR) || 18;

        list.push({
          contract_ticker_symbol: sym.toUpperCase(),
          balance: bal.toString(),
          quoteLocal: 0,
          quoteUsd: 0,
          logo_url: "https://placeholder.com/40x40",
          contract_address: ct,
          contract_decimals: dec,
          contract_name: undefined,
        });
      } catch {
        // ignore single token errors
      }
    }
    return list;
  }, [RPC_URL, chain.chainId, chain.name]);

  const fetchAssetsInternal = useCallback(async () => {
    if (!address || !chain) return;
    setLoading(true); setError(null);
    try {
      const owner = address.toLowerCase();

      // 1) Covalent balances
      const url = `https://api.covalenthq.com/v1/${chain.covalentChainId}/address/${owner}/balances_v2/?quote-currency=USD&nft=false&no-nft-fetch=true`;
      const json = await covalentGet(url);
      const items: any[] = json?.data?.items || [];

      // Map covalent items -> BalanceItem (only non-zero)
      let list: BalanceItem[] = [];
      for (const it of items) {
        const balStr = String(it?.balance || "0");
        if (!balStr || balStr === "0") continue;

        const ca = String(it?.contract_address || "").toLowerCase();
        // Skip null/placeholder address
        if (ca === "0x0000000000000000000000000000000000000000") continue;

        const sym = String(it?.contract_ticker_symbol || "TOKEN").toUpperCase();
        const dec = Number(it?.contract_decimals ?? 18);
        const quote_rate = Number(it?.quote_rate || 0);
        const logo = it?.logo_url || null;

        // Covalent 'quote' often in USD (balance * quote_rate)
        const qty = Number(ethers.utils.formatUnits(balStr, Number.isFinite(dec) ? dec : 18)) || 0;
        const quoteUsd = quote_rate ? qty * quote_rate : 0;

        list.push({
          contract_ticker_symbol: sym,
          balance: balStr,
          quoteUsd,
          // local will be filled later for native; tokens left 0 here (unless we add CG map later)
          quoteLocal: 0,
          logo_url: logo || undefined,
          contract_address: ca || undefined,
          contract_decimals: Number.isFinite(dec) ? dec : 18,
          contract_name: it?.contract_name || undefined,
        });
      }

      // 2) Ensure native balance via RPC (authoritative & immediate)
      try {
        const provider = new ethers.providers.StaticJsonRpcProvider(RPC_URL, { chainId: chain.chainId, name: chain.name });
        const nativeBal = await provider.getBalance(owner);
        const nativeIndex = list.findIndex(
          (b) => !b.contract_address || b.contract_ticker_symbol === chain.nativeSymbol
        );
        const nativeRow: BalanceItem = {
          contract_ticker_symbol: chain.nativeSymbol,
          balance: nativeBal.toString(),
          logo_url: "https://placeholder.com/40x40",
          quoteLocal: 0,
          quoteUsd: 0,
          contract_address: undefined,
          contract_decimals: 18,
          contract_name: chain.nativeSymbol,
        };
        if (nativeIndex >= 0) list[nativeIndex] = nativeRow; else list.unshift(nativeRow);
      } catch {
        // ignore RPC native errors
      }

      // 3) Merge tokens from RPC for contracts seen in recent History
      list = await mergeRpcTokenBalances(owner, list);

      // 4) Compute pricing for native (USD + local)
      const px = await fetchPrices(chain.nativeSymbol as "ETH" | "BNB" | "MATIC");
      list = list.map((b) => {
        if (b.contract_ticker_symbol === chain.nativeSymbol) {
          const qty = Number(ethers.utils.formatUnits(b.balance, 18)) || 0;
          return { ...b, quoteUsd: qty * (px.usd || 0), quoteLocal: qty * (px.local || 0) };
        }
        return b;
      });

      // 5) Sort by fiat value desc, fallback to symbol
      list.sort((a, b) => (b.quoteUsd || 0) - (a.quoteUsd || 0) || (b.quoteLocal || 0) - (a.quoteLocal || 0) || (a.contract_ticker_symbol || "").localeCompare(b.contract_ticker_symbol || ""));

      if (isActiveRef.current) setBalances(list);
    } catch (e: any) {
      if (isActiveRef.current) setError(String(e?.message || e));
    } finally {
      if (isActiveRef.current) setLoading(false);
    }
  }, [address, chain, RPC_URL, fetchPrices, mergeRpcTokenBalances]);

  const debouncedFetch = useCallback(() => {
    fetchAssetsInternal();
  }, [fetchAssetsInternal]);

  useFocusEffect(
    useCallback(() => {
      if (!address) return;
      isActiveRef.current = true;
      debouncedFetch();

      // slow periodic refresh
      const slow = setInterval(() => {
        if (!loading && isActiveRef.current) debouncedFetch();
      }, 10000);

      // watch invalidation bumps (fast)
      const invKey = INVALIDATE_KEY(address, chain.chainId);
      const fast = setInterval(async () => {
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
    }, [address, chain.chainId, debouncedFetch, fetchAssetsInternal, loading])
  );

  return { balances, nfts, loading, error, refresh: debouncedFetch };
}
