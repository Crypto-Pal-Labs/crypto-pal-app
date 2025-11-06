// src/screens/Wallet.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, FlatList, ActivityIndicator, TextInput, StyleSheet, Image,
  RefreshControl, TouchableOpacity, Alert, Modal,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackActions } from "@react-navigation/native";
import * as ethers from "ethers";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { Picker } from "@react-native-picker/picker";

// ✅ Correct relative paths from src/screens/*
import { useAssets, type BalanceItem } from "../hooks/useAssetsSimplified";
import { useChain } from "../hooks/useChain";
import { useWalletStore } from "../store/useWalletStore";
import { useChainStore } from "../store/useChainStore";
import { useTransactionStore } from "../store/useTransactionStore";
import { getWalletAddress, clearWallet } from "../utils/wallet";
import { priceService } from "../services/PriceService";

// ---------- Types used locally ----------
type CGMarket = {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_24h?: number | null;
};

type PriceEntry = { usd: number; local: number };

// ---------- Small helpers ----------
const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

// polite queued fetcher to avoid CG rate limits
let q = Promise.resolve();
let last = 0;
const GAP = 250;
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  // Simplified percentage change fetcher using centralized service
  async function getPercentageChanges(symbols: string[]): Promise<Record<string, number>> {
    try {
      // Removed verbose percentage change logging
      
      // Use the centralized PriceService which handles rate limiting and fallbacks
      const priceMap = await priceService.getPrices(symbols, 'USD');
      
      // For percentage changes, we need to make a separate call to CoinGecko's markets endpoint
      // But we'll use the centralized service's rate limiting approach
      const ids = symbols.map(s => PRICE_IDS[s.toUpperCase()]).filter(Boolean);
      if (ids.length === 0) return {};
      
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&sparkline=false&price_change_percentage=24h`;
      
      // Use the centralized service's rate limiting approach
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'x-cg-demo-api-key': process.env.EXPO_PUBLIC_COINGECKO_API_KEY || "CG-LDY1yCcPNnvXG6vnd1TpLQe2"
        }
      });
      
      if (!response.ok) {
        // Try CryptoCompare as fallback for percentage changes (reliable source)
        try {
          const cryptoCompareResponse = await fetch(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbols.join(',')}&tsyms=USD`);
          
          if (cryptoCompareResponse.ok) {
            const cryptoCompareData = await cryptoCompareResponse.json();
            const result: Record<string, number> = {};
            
            symbols.forEach(symbol => {
              const symbolData = cryptoCompareData.RAW?.[symbol]?.USD;
              if (symbolData && symbolData.CHANGEPCT24HOUR !== undefined) {
                // Use actual CryptoCompare value (even if 0) - this ensures consistency across devices
                result[symbol] = symbolData.CHANGEPCT24HOUR;
              }
            });
            
            if (Object.keys(result).length > 0) {
              return result; // Return CryptoCompare data (consistent across devices)
            }
          }
        } catch (cryptoCompareError) {
          // Silent failure
        }
        
        return {};
      }
      
      const data = await response.json();
      const result: Record<string, number> = {};
      
      symbols.forEach(symbol => {
        const id = PRICE_IDS[symbol.toUpperCase()];
        const marketData = data.find((item: any) => item.id === id);
        if (marketData && marketData.price_change_percentage_24h !== undefined) {
          result[symbol] = marketData.price_change_percentage_24h;
        }
      });
      
      // Removed verbose percentage change result logging
      return result;
    } catch (error) {
      console.error('Wallet: Error getting percentage changes:', error);
      return {};
    }
  }

// ---------- Simple price cache (fallback for testnets) ----------
const PRICE_IDS: Record<string, string> = {
  ETH: "ethereum", WETH: "ethereum",
  ETC: "ethereum-classic", // Added ETC support
  BNB: "binancecoin", WBNB: "binancecoin",
  MATIC: "polygon-ecosystem-token", WMATIC: "polygon-ecosystem-token", // Use correct CoinGecko ID for MATIC
  AVAX: "avalanche-2", WAVAX: "avalanche-2",
  USDT: "tether", USDC: "usd-coin", DAI: "dai",
  FTM: "fantom", WFTM: "fantom", // Added Fantom support
  BTC: "bitcoin", // Bitcoin support
  SOL: "solana", // Solana support
  XRP: "ripple", // XRP support
  XLM: "stellar", // Stellar support
  ADA: "cardano", // Cardano support
  TRX: "tron", // Tron support
  DOGE: "dogecoin", // Dogecoin support
  LTC: "litecoin", // Litecoin support
  BCH: "bitcoin-cash", // Bitcoin Cash support
  ATOM: "cosmos", // Cosmos support
  DOT: "polkadot", // Polkadot support
};

async function loadSymbolPrices(symbols: string[], localCurrency: string) {
  try {
    console.log(`Wallet: loadSymbolPrices called for ${symbols.length} symbols:`, symbols);
    const prices = await priceService.getPrices(symbols, localCurrency);
    console.log(`Wallet: ✅ Price service returned ${Object.keys(prices).length} prices:`, Object.keys(prices));
    // CRITICAL: Ensure all returned keys are uppercase for consistent lookup
    const normalizedPrices: Record<string, PriceEntry> = {};
    Object.keys(prices).forEach(key => {
      normalizedPrices[key.toUpperCase()] = prices[key];
    });
    console.log(`Wallet: Normalized price keys:`, Object.keys(normalizedPrices));
    return normalizedPrices;
  } catch (error) {
    console.error('Wallet: ❌ Error loading prices via centralized service:', error);
    return {} as Record<string, PriceEntry>;
  }
}

const Wallet: React.FC = () => {
  const navigation = useNavigation();
  const isMounted = useRef(true);

  const setAddress = useWalletStore((state: any) => state.setAddress);

  const { chain, chains, activeChainId, setActiveChainId } = useChain();
  const { balances, nfts, loading, error, refresh, forceRefresh } = useAssets();

  // Force default to All Networks on Wallet Tab load
  useEffect(() => {
    const initializeDefault = async () => {
      try {
        console.log('Wallet: Current activeChainId:', activeChainId);
        console.log('Wallet: Clearing stored chain selection and forcing to All Networks (0)');
        
        // Clear the stored chain selection to force default
        await AsyncStorage.removeItem('cp-active-chain');
        
        // Set to All Networks
        setActiveChainId(0);
        
        // Removed verbose initialization logging
        
        // Mark as initialized to prevent Picker from overriding
        setIsInitialized(true);
      } catch (error) {
        console.log('Wallet: Error initializing default chain:', error);
        setActiveChainId(0);
      }
    };
    
    initializeDefault();
  }, []); // Only run once on mount

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"crypto" | "nfts">("crypto");
  const [refreshing, setRefreshing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showLoadingPopup, setShowLoadingPopup] = useState(false);
  const lastRefreshTime = useRef(0);
  const REFRESH_COOLDOWN = 2000; // 2 seconds minimum between refreshes (reduced for testing)

  // currency handling
  const locale = Localization.getLocales()[0] || { currencyCode: "USD" as const };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();
  const currencyOptions: string[] = Array.from(new Set(["USD", localCurrency]));
  const [currency, setCurrency] = useState<string>("USD");

  // for ETH pending-delta visual (existing pattern)
  const [localBalanceDelta, setLocalBalanceDelta] = useState(0);
  
  // Track logged missing prices to reduce spam
  const loggedMissingPrices = useRef<Set<string>>(new Set());
  const loggedBuyTransactions = useRef<Set<string>>(new Set());
  const loggedBalanceCheck = useRef<boolean>(false);

  // 24h % map for each symbol (nice-to-have)
  const [cgMap, setCgMap] = useState<Record<string, CGMarket>>({});
  const resolving = useRef<Set<string>>(new Set());
  // Real-time percentage change updates
  useEffect(() => {
    const updatePercentageChanges = async () => {
      try {
        // Get unique symbols from current balances for real-time updates
        const balanceSymbols = Array.from(new Set(balances.map((b: BalanceItem) => (b.contract_ticker_symbol || "").toUpperCase()).filter(Boolean)));
        // CRITICAL: Always include common tokens AND non-EVM tokens in price fetches
        // This ensures ALL tokens display $value and %change, not just EVM tokens
        const commonSymbols = ['ETH', 'ETC', 'BNB', 'MATIC', 'USDC', 'USDT', 'DAI', 'FTM', 'BTC', 'SOL', 'XRP', 'XLM', 'ADA', 'TRX', 'DOGE', 'LTC', 'BCH', 'ATOM', 'DOT'];
        const allSymbols = Array.from(new Set([...commonSymbols, ...balanceSymbols]));
        
        // Ensure common tokens are always included
        ['MATIC', 'BTC', 'SOL', 'XRP'].forEach(token => {
          if (!allSymbols.some(s => s.toUpperCase() === token)) {
            allSymbols.push(token);
          }
        });
        
        const percentageChanges = await getPercentageChanges(allSymbols);
        
        if (Object.keys(percentageChanges).length === 0) {
          return; // Don't set fallback values - let ensurePctFor handle missing data
        }
        
        const next: Record<string, CGMarket> = {};
        
        allSymbols.forEach(symbol => {
          const pct24h = percentageChanges[symbol];
          if (pct24h !== undefined) {
            next[symbol.toLowerCase()] = {
              id: symbol.toLowerCase(),
              symbol: symbol.toLowerCase(),
              name: symbol,
              image: null,
              current_price: null,
              price_change_percentage_24h: pct24h
            };
          }
        });
        
        // Handle MATIC if missing
        if (!next['matic'] && !next['polygon']) {
          try {
            const maticChanges = await getPercentageChanges(['MATIC']);
            if (maticChanges['MATIC'] !== undefined) {
              next['matic'] = {
                id: 'polygon-ecosystem-token', // Use correct CoinGecko ID
                symbol: 'MATIC',
                name: 'Polygon',
                image: null,
                current_price: null,
                price_change_percentage_24h_in_currency: maticChanges['MATIC'],
                price_change_percentage_24h: maticChanges['MATIC'],
              };
            }
          } catch (error) {
            // Silent failure
          }
        }
        
        if (isMounted.current) {
          setCgMap(prev => ({ ...prev, ...next }));
        }
      } catch (error) {
        console.error('Wallet: Error updating percentage changes:', error);
      }
    };
    
    // Initial load
    updatePercentageChanges();
    
    // Refresh every 60 seconds for real-time updates
    const interval = setInterval(() => {
      if (isMounted.current && balances.length > 0) {
        updatePercentageChanges();
      }
    }, 60000); // 60 seconds
    
    return () => clearInterval(interval);
  }, [balances]);

  const ensurePctFor = async (symbol: string, name?: string) => {
    const key = (symbol || "").toLowerCase();
    if (!key || resolving.current.has(key) || cgMap[key]) return;
    resolving.current.add(key);
    
    try {
      console.log(`Wallet: Fetching percentage change for ${symbol}`);
      
      // Try direct mapping first for common tokens
      const directMapping: Record<string, string> = {
        'eth': 'ethereum',
        'matic': 'polygon-ecosystem-token', // Updated to correct MATIC ID
        'bnb': 'binancecoin',
        'usdc': 'usd-coin',
        'usdt': 'tether',
        'dai': 'dai'
      };
      
      let coinId = directMapping[key];
      
      if (!coinId) {
        // Fallback to search API
        try {
          const searchResponse = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`, {
            headers: {
              'Accept': 'application/json',
              'x-cg-demo-api-key': process.env.EXPO_PUBLIC_COINGECKO_API_KEY || "CG-LDY1yCcPNnvXG6vnd1TpLQe2"
            }
          });
          if (searchResponse.ok) {
            const search = await searchResponse.json();
            const match =
              search?.coins?.find((c: any) => c.symbol?.toLowerCase() === key) ||
              search?.coins?.[0];
            coinId = match?.id;
          }
        } catch (error) {
          console.log(`Wallet: Search API failed for ${symbol}:`, error);
        }
      }
      
      if (!coinId) {
        console.log(`Wallet: No CoinGecko ID found for ${symbol}`);
        return;
      }

      console.log(`Wallet: Fetching market data for ${symbol} (${coinId})`);
      const rows = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coinId)}&sparkline=false&price_change_percentage=24h`,
        {
          headers: {
            'Accept': 'application/json',
            'x-cg-demo-api-key': process.env.EXPO_PUBLIC_COINGECKO_API_KEY || "CG-LDY1yCcPNnvXG6vnd1TpLQe2"
          }
        }
      ).then(r => r.ok ? r.json() : null).catch(() => null);
      
      if (Array.isArray(rows) && rows[0]) {
        const r = rows[0];
        const entry: CGMarket = {
          id: r.id, 
          symbol: r.symbol, 
          name: r.name, 
          image: r.image ?? null,
          current_price: r.current_price ?? null,
          price_change_percentage_24h_in_currency: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h ?? null,
          price_change_percentage_24h: r.price_change_percentage_24h ?? null,
        };
        
        console.log(`Wallet: ✅ Got percentage change for ${symbol}: ${entry.price_change_percentage_24h}%`);
        
        if (isMounted.current) {
          setCgMap((prev) => ({ ...prev, [key]: entry, [`${key}|${(name || r.name || "").toLowerCase()}`]: entry }));
        }
      } else {
        console.log(`Wallet: ⚠️ No market data received for ${symbol}`);
      }
    } catch (error) {
      console.error(`Wallet: Error fetching percentage change for ${symbol}:`, error);
    } finally {
      resolving.current.delete(key);
    }
  };

  // keep address in store (existing flow)
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadAddress = async () => {
    if (!isMounted.current) return;
    setLoadError(null);
    try {
      const currentAddress = await getWalletAddress();
      if (currentAddress) {
        setAddress(currentAddress);
      } else {
        throw new Error("No address returned from secure store.");
      }
    } catch (err: any) {
      if (isMounted.current) setLoadError(err?.message || "Failed to load wallet address.");
    }
  };

  const handleLogout = async () => {
    if (!isMounted.current) return;
    try {
      await clearWallet();
      navigation.dispatch(StackActions.replace("Welcome"));
    } catch (error) {
      if (isMounted.current) {
        console.error("Logout error:", error);
        Alert.alert("Error", "Failed to logout.");
      }
    }
  };

  const loadLocalDelta = async () => {
    try {
      const storedDelta = await AsyncStorage.getItem("localBalanceDelta");
      if (isMounted.current) setLocalBalanceDelta(storedDelta ? parseFloat(storedDelta) : 0);
    } catch (e) {
      console.error("Local delta fetch error:", e);
    }
  };

  // --- Fallback price cache inside the screen (guarantees non-zero fiat for Amoy) ---
  const [priceCache, setPriceCache] = useState<Record<string, PriceEntry>>({});
  
  // CRITICAL: Memoize symbols to prevent infinite loops - use stable string representation
  const balanceSymbolsKey = useMemo(() => {
    return balances
      .map((b: BalanceItem) => `${b.contract_ticker_symbol?.toUpperCase()}_${b.chainId}`)
      .sort()
      .join(',');
  }, [balances.map(b => `${b.contract_ticker_symbol}_${b.chainId}`).join(',')]);
  
  const balanceSymbols = useMemo(() => {
    const syms = Array.from(
      new Set(
        balances
          .map((b: BalanceItem) => ((b.contract_ticker_symbol || "") as string).toUpperCase())
          .filter((s: string) => !!s)
      )
    );
    return syms;
  }, [balanceSymbolsKey]);
  
  // CRITICAL: Debounce price loading to prevent rapid successive calls
  useEffect(() => {
    if (!balanceSymbols.length) return;
    
    const timeoutId = setTimeout(() => {
      if (isMounted.current) {
        loadSymbolPrices(balanceSymbols, localCurrency)
          .then((map) => {
            if (isMounted.current) {
              setPriceCache(map);
            }
          })
          .catch(() => {});
      }
    }, 200); // 200ms debounce to prevent flashing
    
    return () => clearTimeout(timeoutId);
  }, [balanceSymbols.join(','), localCurrency]); // Use stable string dependency

  // compute header total with fallback
  const totalValue = balances
    .reduce((sum: number, item: BalanceItem) => {
      const sym = (item.contract_ticker_symbol || "").toUpperCase();
      const dec = item.contract_decimals ?? 18;
      let qty = Number(ethers.utils.formatUnits(item.balance, dec));
      if (sym === "ETH") {
        const originalEth = Number(ethers.utils.formatUnits(item.balance, 18));
        qty = originalEth + localBalanceDelta;
      }
      let quote = currency === "USD" ? (item.quoteUsd ?? 0) : (item.quoteLocal ?? 0);
      if (!quote || !Number.isFinite(quote)) {
        // Only use real-time price cache, no fallback rates
        const realTimePrice = currency === "USD" ? (priceCache[sym]?.usd || 0) : (priceCache[sym]?.local || 0);
        quote = qty * realTimePrice;
        if (realTimePrice === 0) {
          // Only log once per session for missing prices
          if (!loggedMissingPrices.current.has(sym)) {
            console.log(`Wallet: No real-time price for ${sym}, showing zero value`);
            loggedMissingPrices.current.add(sym);
          }
        }
      }
      return sum + (Number.isFinite(quote) ? quote : 0);
    }, 0)
    .toFixed(2);

  const onRefresh = async () => {
    console.log('Wallet: onRefresh called - START');
    
    if (!isMounted.current) {
      console.log('Wallet: onRefresh - component not mounted, returning');
      return;
    }
    
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.current;
    console.log(`Wallet: Time since last refresh: ${timeSinceLastRefresh}ms, cooldown: ${REFRESH_COOLDOWN}ms`);
    
    if (timeSinceLastRefresh < REFRESH_COOLDOWN) {
      console.log(`Wallet: Skipping refresh - cooldown active (${Math.round((REFRESH_COOLDOWN - timeSinceLastRefresh) / 1000)}s remaining)`);
      return;
    }
    
    console.log('Wallet: onRefresh proceeding with refresh');
    setRefreshing(true);
    lastRefreshTime.current = now;
    
    // Show loading popup after 1 second if still loading
    const loadingTimeout = setTimeout(() => {
      console.log('Wallet: Showing loading popup after 1 second');
      setShowLoadingPopup(true);
    }, 1000);
    
    try {
      console.log('Wallet: Starting refresh...');
      
      // Force clear cache before refresh to ensure fresh data
      try {
        const { address } = useWalletStore.getState();
        if (address) {
          const cacheKey = `crypto_pal_assets_cache:${address}`;
          await AsyncStorage.removeItem(cacheKey);
          console.log('Wallet: Cleared asset cache before refresh');
        }
      } catch (e) {
        console.error('Wallet: Error clearing cache:', e);
      }
      
      // Use forceRefresh to bypass all caches
      await forceRefresh();
      console.log('Wallet: Force refresh completed, clearing timeout');
      clearTimeout(loadingTimeout);
      setShowLoadingPopup(false);
      
      await AsyncStorage.removeItem("localBalanceDelta");
      await loadLocalDelta();
    } catch (error) {
      console.error('Wallet: Refresh error:', error);
      clearTimeout(loadingTimeout);
      setShowLoadingPopup(false);
    } finally {
      setRefreshing(false);
      console.log('Wallet: onRefresh completed');
    }
  };

  // Track if this is first load after app start (per session)
  const isFirstLoad = useRef(true);
  const hasShownPopupThisSession = useRef(false);
  const lastFocusTime = useRef(0);
  const MIN_FOCUS_INTERVAL = 3000; // 3 seconds minimum between focus refreshes
  const MIN_POPUP_DISPLAY_TIME = 30000; // 30 seconds minimum popup display on first load
  const popupShowTime = useRef(0);
  
  // on tab focus: use cache if available, refresh in background
  // CRITICAL: TransactionStore automatically handles purchased tokens
  // No need to check flags - useAssets hook will automatically include purchased tokens
  // CRITICAL: Stabilize refresh function reference to prevent infinite loops
  // Use ref to store refresh function and update it only when address changes
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  
  useFocusEffect(
    React.useCallback(() => {
      // CRITICAL: Prevent infinite refresh loops by checking if we're already refreshing
      const now = Date.now();
      const timeSinceLastFocus = now - lastFocusTime.current;
      
      if (timeSinceLastFocus < MIN_FOCUS_INTERVAL && lastFocusTime.current > 0) {
        console.log(`Wallet: Skipping refresh - too soon since last focus (${timeSinceLastFocus}ms < ${MIN_FOCUS_INTERVAL}ms)`);
        return;
      }
      
      lastFocusTime.current = now;
      
      // CRITICAL: TransactionStore is reactive - components auto-update when transactions change
      // No manual refresh needed for purchased tokens - they appear automatically
      console.log('Wallet: Tab focused - assets will auto-update from TransactionStore if new purchases detected');
      
      // CRITICAL: Always show popup on first load of this session (even if cache exists)
      // This ensures users see feedback during initial asset discovery
      const currentBalancesLength = balances.length;
      const shouldShowPopup = (isFirstLoad.current && !hasShownPopupThisSession.current) || currentBalancesLength === 0;
      
      if (shouldShowPopup) {
        // Show popup immediately on first load (before checking cache)
        console.log('Wallet: First load detected - showing popup immediately');
        setShowLoadingPopup(true);
        hasShownPopupThisSession.current = true;
        popupShowTime.current = Date.now(); // Track when popup was shown
        
        // CRITICAL: Ensure popup shows for minimum 3 seconds so user sees it
        // Safety: hide after max 60s to avoid blocking UX (30s minimum + 30s buffer)
        const maxHideTimeout = setTimeout(() => {
          console.log('Wallet: Auto-hiding popup after max 60 seconds');
          setShowLoadingPopup(false);
        }, 60000);
        
        // Refresh in background (will use cache if valid, otherwise fetch fresh)
        // CRITICAL: Use ref to avoid dependency on refresh function
        refreshRef.current().finally(() => {
          // CRITICAL: Only hide popup after minimum display time (30 seconds)
          // This ensures user has time to read the message and understand assets are loading
          const elapsedTime = Date.now() - popupShowTime.current;
          const remainingTime = Math.max(0, MIN_POPUP_DISPLAY_TIME - elapsedTime);
          
          if (remainingTime > 0) {
            console.log(`Wallet: Waiting ${remainingTime}ms more before hiding popup (min 30s display)`);
            setTimeout(() => {
              clearTimeout(maxHideTimeout);
              setShowLoadingPopup(false);
              console.log('Wallet: First load complete - hiding popup after minimum 30-second display time');
            }, remainingTime);
          } else {
            clearTimeout(maxHideTimeout);
            // Only hide popup if we have balances OR if loading completed
            if (currentBalancesLength > 0 || !loading) {
              console.log('Wallet: First load complete - hiding popup');
              setShowLoadingPopup(false);
            }
          }
          isFirstLoad.current = false;
        });
        
        // Cleanup function
        return () => {
          clearTimeout(maxHideTimeout);
        };
      } else {
        // Subsequent loads: Use cache for instant display, refresh in background if cache is stale
        // CRITICAL: Check cache age - if cache is fresh (< 5 min), use it immediately
        // Only refresh if cache is stale or missing
        const checkCacheAndRefresh = async () => {
          try {
            const { address } = useWalletStore.getState();
            if (address) {
              const cacheKey = `crypto_pal_assets_cache:${address}`;
              const cached = await AsyncStorage.getItem(cacheKey);
              if (cached) {
                const parsed = JSON.parse(cached);
                const cacheAge = Date.now() - (parsed.ts || 0);
                const CACHE_MAX_AGE = 300_000; // 5 minutes (matches useAssetsSimplified)
                
                if (cacheAge < CACHE_MAX_AGE && parsed.balances && parsed.balances.length > 0) {
                  console.log(`Wallet: ✅ Using cached balances (age: ${Math.round(cacheAge / 1000)}s) - instant display`);
                  // Cache is fresh - useAssets hook will load from cache automatically
                  // Don't trigger refresh - let cache serve
                  return;
                } else {
                  console.log(`Wallet: Cache stale (age: ${Math.round(cacheAge / 1000)}s) - refreshing in background`);
                }
              }
            }
            
            // Cache missing or stale - refresh in background
            if (!loading) {
              console.log('Wallet: Refreshing silently in background');
              // CRITICAL: Use ref to avoid dependency on refresh function
              refreshRef.current();
            } else {
              console.log('Wallet: Skipping refresh - already loading');
            }
          } catch (e) {
            console.error('Wallet: Error checking cache:', e);
            // On error, refresh to ensure data is available
            if (!loading) {
              // CRITICAL: Use ref to avoid dependency on refresh function
              refreshRef.current();
            }
          }
        };
        
        checkCacheAndRefresh();
      }
    }, []) // CRITICAL: Empty dependency array - use ref for refresh to prevent infinite loops
  );

  // CRITICAL: Remove this effect entirely - popup hiding is already handled in useFocusEffect
  // The refresh().finally() callback in useFocusEffect already handles hiding the popup
  // This effect was causing infinite loops by competing with the focus effect

  // filter and sort alphabetically
  const filteredBalances: BalanceItem[] = balances.filter(
    (item: BalanceItem) => {
      // CRITICAL: Handle non-EVM tokens (chainId 0, or other non-EVM chainIds) correctly
      // These tokens use different decimals and might not have standard EVM balance format
      let hasBalance = false;
      try {
        // For non-EVM tokens with chainId 0 or custom chainIds, check balance differently
        if (item.chainId !== undefined && (item.chainId === 0 || (item.chainId >= 999990 && item.chainId <= 999999))) {
          // Non-EVM token (Bitcoin, XRP, etc.) - balance might be in human-readable format already
          // Or in smallest unit - try both
          const balanceStr = item.balance?.toString() || '0';
          const balanceNum = parseFloat(balanceStr);
          // For BTC (chainId 0), check if balance is in satoshis or BTC
          // If balance > 1 million, it's likely in smallest unit (satoshis), divide by 10^8
          // Otherwise assume it's already in human-readable format
          if (item.chainId === 0 && balanceNum > 1000000) {
            // Likely in satoshis (1 BTC = 100,000,000 satoshis)
            hasBalance = (balanceNum / 100000000) > 0;
          } else if (item.chainId === 999998 && balanceNum > 1000000) {
            // XRP in drops (1 XRP = 1,000,000 drops)
            hasBalance = (balanceNum / 1000000) > 0;
          } else {
            // Already in human-readable format or small number
            hasBalance = balanceNum > 0;
          }
        } else {
          // EVM token - use standard formatUnits
          hasBalance = Number(ethers.utils.formatUnits(item.balance, item.contract_decimals ?? 18)) > 0;
        }
      } catch (e) {
        // Fallback: try to parse balance directly
        const balanceNum = parseFloat(item.balance?.toString() || '0');
        hasBalance = balanceNum > 0;
      }
      
      // CRITICAL: Check if this is a BUY transaction token (has orderId OR buyTimestamp)
      // BUY transactions represent user purchases that should be visible even if balance hasn't updated yet
      // Check for both orderId (preferred) and buyTimestamp (fallback for transactions without orderId)
      const isBuyTransaction = (item as any).orderId !== undefined || (item as any).buyTimestamp !== undefined;
      
      // Debug logging for BUY transactions (only log once per symbol to avoid spam)
      if (isBuyTransaction && !loggedBuyTransactions.current.has(item.contract_ticker_symbol)) {
        console.log(`Wallet: 🎯 Found BUY transaction token: ${item.contract_ticker_symbol} (orderId: ${(item as any).orderId}, balance: ${item.balance}, hasBalance: ${hasBalance})`);
        loggedBuyTransactions.current.add(item.contract_ticker_symbol);
      }
      
      const matchesSearch = (item.contract_ticker_symbol || "").toLowerCase().includes(searchQuery.toLowerCase());
      // CRITICAL: When activeChainId === 0 (All Networks), show tokens with balance > 0 OR BUY transactions
      // For non-EVM tokens (chainId 0, 999998, etc.), chainId matching should work correctly
      const matchesChain = activeChainId === 0 || item.chainId === activeChainId;
      
      const shouldShow = (hasBalance || isBuyTransaction) && matchesSearch && matchesChain;
      
      if (activeChainId === 0) {
        // All Networks: Show tokens with balance > 0 OR BUY transactions (balance can be 0 for purchases)
        // CRITICAL: BUY transactions should always be visible even if balance is 0
        return shouldShow;
      } else {
        // Specific chain: Show tokens with balance > 0 OR BUY transactions
        return shouldShow;
      }
    }
  );

  // Sort alphabetically by token symbol
  const sortedBalances = filteredBalances.sort((a, b) => {
    const symbolA = (a.contract_ticker_symbol || "").toUpperCase();
    const symbolB = (b.contract_ticker_symbol || "").toUpperCase();
    return symbolA.localeCompare(symbolB);
  });
  
  // Removed verbose filtered balances logging - only log if debugging needed

  const filteredNfts = nfts.filter(
    (item: any) =>
      (item.contract_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item as any).token_id?.includes?.(searchQuery)
  );

  const resolveName = (symbol: string, raw?: string) => {
    if (raw && raw.trim().length) return titleCase(raw.trim());
    if (symbol?.toUpperCase() === "ETH") return "Ethereum";
    return symbol;
  };

  const renderBalanceItem = ({ item }: { item: BalanceItem }) => {
    const dec = item.contract_decimals ?? 18;

    // amount (ETH row keeps local delta)
    const symU = (item.contract_ticker_symbol || "").toUpperCase();
    let displayQty =
      symU === "ETH"
        ? Number(ethers.utils.formatUnits(item.balance, 18)) + localBalanceDelta
        : Number(ethers.utils.formatUnits(item.balance, dec));

    const balanceLine = `${displayQty.toFixed(8)} ${item.contract_ticker_symbol}`;

    const symbol = item.contract_ticker_symbol || "—";
    const name = resolveName(symbol, item.contract_name);
    const title = `${symbol}  |  ${name}`;

    const logo = item.logo_url || "";

    // 24h % - Simplified lookup
    const symKey = (symbol || "").toLowerCase();
    let cg = cgMap[symKey];
    
    // CRITICAL: Special handling for MATIC - try multiple keys and force fetch if missing
    if (!cg && symbol?.toUpperCase() === 'MATIC') {
      cg = cgMap['matic'] || cgMap['polygon'] || cgMap['MATIC'] || cgMap['POLYGON'] || cgMap['polygon-ecosystem-token'];
      if (!cg) {
        // CRITICAL: Force fetch MATIC data immediately - don't wait for background
        console.log('Wallet: MATIC data missing, fetching immediately...');
        ensurePctFor('MATIC', item.contract_name || 'Polygon');
        // Also try 'polygon-ecosystem-token' as it's the correct CoinGecko ID for MATIC
        if (!cgMap['polygon-ecosystem-token']) {
          ensurePctFor('MATIC', 'Polygon Ecosystem Token');
        }
      }
    }
    
    // MATIC percentage: Use actual value from API (even if 0) - no random generation
    // If MATIC shows 0.00%, that's the actual API value - display it accurately
    // CryptoCompare provides percentage changes if CoinGecko doesn't
    
    // Don't call ensurePctFor for MATIC here - already handled above
    if (!cg && symbol?.toUpperCase() !== 'MATIC') {
      ensurePctFor(symbol, item.contract_name);
    }
    const pct24 =
      cg?.price_change_percentage_24h_in_currency ??
      cg?.price_change_percentage_24h ??
      null;
    
    // Removed verbose percentage logging for performance
    const pctStyle = pct24 == null ? styles.pctNeutral : pct24 >= 0 ? styles.up : styles.down;

    // fiat with real-time prices only
    // CRITICAL: Check priceCache with uppercase symbol key
    const priceData = priceCache[symU];
    const realTimeUsd = (priceData?.usd || 0) * displayQty;
    const realTimeLoc = (priceData?.local || 0) * displayQty;
    
    // Debug logging for missing prices (only once per symbol per session)
    if (!priceData && displayQty > 0 && !loggedMissingPrices.current.has(symU)) {
      console.warn(`Wallet: ⚠️ No price data in cache for ${symU}, priceCache has keys:`, Object.keys(priceCache));
      loggedMissingPrices.current.add(symU);
    }
    
    let fiatText = "—";
    if (currency === "USD") {
      const val = item.quoteUsd && item.quoteUsd > 0 ? item.quoteUsd : realTimeUsd;
      fiatText = Number.isFinite(val) && val > 0 ? `$${val.toFixed(2)}` : "—";
    } else {
      const val = item.quoteLocal && item.quoteLocal > 0 ? item.quoteLocal : realTimeLoc;
      fiatText = Number.isFinite(val) && val > 0 ? `${val.toFixed(2)} ${currency}` : `— ${currency}`;
    }

    return (
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImgReal} resizeMode="contain" />
          ) : (
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>{(symbol || "?").slice(0, 1)}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardLeft}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>{balanceLine}</Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.cardPriceRight} numberOfLines={1}>{fiatText}</Text>
          <Text style={[styles.cardPctRight, pctStyle]} numberOfLines={1}>
            {pct24 == null || Number.isNaN(pct24)
              ? "—"
              : `${pct24 >= 0 ? "+" : ""}${pct24.toFixed(2)}%`}
          </Text>
        </View>
      </View>
    );
  };

  const renderNFTItem = ({ item }: { item: any }) => {
    const logo = item.logo_url || null;
    const title = `${resolveName("NFT", item.contract_name)}  |  Token`;
    return (
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImgReal} resizeMode="contain" />
          ) : (
            <View style={styles.logoBox}>
              <Text style={styles.logoLetter}>N</Text>
            </View>
          )}
        </View>

        <View style={styles.cardLeft}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>Token ID: {item.token_id}</Text>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.cardPriceRight}>—</Text>
          <Text style={[styles.cardPctRight, styles.pctNeutral]}>—</Text>
        </View>
      </View>
    );
  };

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity onPress={loadAddress}><Text style={styles.retry}>Retry</Text></TouchableOpacity>
      </View>
    );
  }

  const networkLabel = activeChainId === 0 ? "All Networks" : (chain?.shortName || chain?.name || String(activeChainId));
  const currencyLabel = currency;

  return (
    <View style={styles.container}>
      {/* Loading Popup */}
      {showLoadingPopup && (
        <Modal
          visible={showLoadingPopup}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.popupOverlay}>
            <View style={styles.popupContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.popupTitle}>Locating Your Assets</Text>
              <Text style={styles.popupMessage}>
                We are locating your assets across multiple networks, please wait a moment...
              </Text>
              <TouchableOpacity
                style={styles.popupButton}
                onPress={() => {
                  console.log('Wallet: Popup button clicked - closing popup');
                  setShowLoadingPopup(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.popupButtonText}>Ok, I understand</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <Text style={styles.heading}>Wallet Home</Text>
      
      <Text style={styles.totalLabel}>Total Balance:</Text>
      <Text style={styles.totalValue}>${totalValue} {currency}</Text>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your assets."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.segWrap}>
        <View style={styles.segRow}>
          <TouchableOpacity
            style={viewMode === "crypto" ? styles.segChipActive : styles.segChip}
            onPress={() => setViewMode("crypto")}
          >
            <Text style={viewMode === "crypto" ? styles.segChipTxtActive : styles.segChipTxt}>CRYPTOS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={viewMode === "nfts" ? styles.segChipActive : styles.segChip}
            onPress={() => setViewMode("nfts")}
          >
            <Text style={viewMode === "nfts" ? styles.segChipTxtActive : styles.segChipTxt}>NFTs</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.pickerRow}>
        <View style={styles.pickerCol}>
          <Text style={styles.pickerLabel}>Network</Text>
          <View style={styles.pickerBox}>
            <View style={styles.pickerDisplayRow}>
              <Text style={styles.pickerValue} numberOfLines={1}>{networkLabel}</Text>
              <Ionicons name="chevron-down" size={16} color="#0A84FF" />
            </View>
            <Picker
              selectedValue={activeChainId}
              onValueChange={(val) => {
                if (isInitialized) {
                  console.log('Wallet: User selected chain:', val);
                  setActiveChainId(Number(val));
                } else {
                  console.log('Wallet: Ignoring initial Picker value change:', val);
                }
              }}
              style={styles.pickerOverlay}
              mode="dropdown"
            >
              <Picker.Item key="all" label="All Networks" value={0} />
              {chains.map((c: any) => (
                <Picker.Item key={c.chainId} label={c.shortName || c.name} value={c.chainId} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.pickerCol}>
          <Text style={styles.pickerLabel}>Currency</Text>
          <View style={styles.pickerBox}>
            <View style={styles.pickerDisplayRow}>
              <Text style={styles.pickerValue} numberOfLines={1}>{currencyLabel}</Text>
              <Ionicons name="chevron-down" size={16} color="#0A84FF" />
            </View>
            <Picker
              selectedValue={currency}
              onValueChange={(val) => setCurrency(String(val))}
              style={styles.pickerOverlay}
              mode="dropdown"
            >
              {currencyOptions.map((opt: string) => (
                <Picker.Item key={opt} label={opt} value={opt} />
              ))}
            </Picker>
          </View>
        </View>
      </View>

      {error && (
        <Text style={styles.errorText}>
          {error}{" "}
          <TouchableOpacity onPress={onRefresh}><Text style={styles.retry}>Retry</Text></TouchableOpacity>
        </Text>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#0A84FF" style={styles.center} />
      ) : (
        <>
          {viewMode === "crypto" ? (
            <FlatList<BalanceItem>
              style={styles.assetList}
              data={sortedBalances}
              renderItem={renderBalanceItem}
              keyExtractor={(it: BalanceItem, idx: number) =>
                `${it.contract_address || "native"}:${it.contract_ticker_symbol}:${idx}`
              }
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.empty}>No tokens to display yet</Text>
                  <TouchableOpacity onPress={onRefresh}>
                    <Ionicons name="refresh-circle" size={50} color="#0A84FF" />
                  </TouchableOpacity>
                </View>
              }
              contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            />
          ) : (
            <FlatList<any>
              style={styles.assetList}
              data={filteredNfts}
              renderItem={renderNFTItem}
              keyExtractor={(it: any, idx: number) => `${it.contract_address || "nft"}:${it.token_id || idx}`}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={<Text style={styles.empty}>No NFTs yet</Text>}
              contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            />
          )}
        </>
      )}

      <View style={styles.logoutContainer}>
        <TouchableOpacity style={styles.btnLogout} onPress={handleLogout} activeOpacity={0.9}>
          <Text style={styles.btnLogoutTxt}>LOGOUT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  heading: { fontSize: 36, fontWeight: "bold", color: "#0A84FF", textAlign: "center", marginTop: 20 },
  totalLabel: { fontSize: 20, color: "#000", textAlign: "center", marginBottom: 5 },
  totalValue: { fontSize: 27, fontWeight: "bold", color: "#0A84FF", textAlign: "center", marginBottom: 5 },

  searchContainer: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#ddd", borderRadius: 20,
    paddingHorizontal: 8, marginHorizontal: 12, marginBottom: 8, backgroundColor: "#fff"
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 8 },

  segWrap: { paddingHorizontal: 12, marginBottom: 8 },
  segRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  segChip: {
    paddingVertical: 10, paddingHorizontal: 20, marginHorizontal: 6,
    borderRadius: 999, minWidth: 110, alignItems: "center", backgroundColor: "#e6ecff"
  },
  segChipActive: {
    paddingVertical: 10, paddingHorizontal: 20, marginHorizontal: 6,
    borderRadius: 999, minWidth: 110, alignItems: "center", backgroundColor: "#0A84FF"
  },
  segChipTxt: { color: "#0A84FF", fontWeight: "800", fontSize: 15 },
  segChipTxtActive: { color: "#fff", fontWeight: "900", fontSize: 15 },

  pickerRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, marginBottom: 8, gap: 12 },
  pickerCol: { flex: 1 },
  pickerLabel: { fontSize: 12, fontWeight: "700", color: "#333", marginBottom: 6 },
  pickerBox: { borderWidth: 1, borderColor: "#cfe0ff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#f7faff" },
  pickerDisplayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerValue: { color: "#0A84FF", fontWeight: "800" },
  pickerOverlay: { position: "absolute", opacity: 0, top: 0, right: 0, left: 0, bottom: 0 },

  assetList: { flex: 1 },

  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F5F9FF",
    borderRadius: 12, padding: 12, marginHorizontal: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#E6F0FF",
  },
  logoWrap: { width: 46, height: 46, borderRadius: 10, overflow: "hidden", marginRight: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  logoImgReal: { width: 44, height: 44 },
  logoBox: { width: 46, height: 46, borderRadius: 10, backgroundColor: "#E6EAF2", alignItems: "center", justifyContent: "center" },
  logoLetter: { fontSize: 16, fontWeight: "900", color: "#4B5B76" },

  cardLeft: { flex: 1, paddingRight: 10 },
  cardTitle: { fontWeight: "800", color: "#000" },
  cardSub: { color: "#333", marginTop: 3 },

  cardRight: { alignItems: "flex-end" },
  cardPriceRight: { fontWeight: "800", color: "#0A84FF" },
  cardPctRight: { fontWeight: "900", marginTop: 3 },
  up: { color: "#16A34A" }, down: { color: "#DC2626" }, pctNeutral: { color: "#6B7280" },

  empty: { color: "#888" },

  errorText: { color: "#B91C1C", textAlign: "center", marginVertical: 8 },
  retry: { color: "#0A84FF", fontWeight: "800" },

  logoutContainer: { padding: 16, alignItems: "center" },
  btnLogout: { backgroundColor: "#0A84FF", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 },
  btnLogoutTxt: { color: "#fff", fontSize: 16, fontWeight: "900" },

  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  popupMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  popupButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  popupButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Wallet;
