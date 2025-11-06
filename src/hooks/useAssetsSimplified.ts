// src/hooks/useAssetsSimplified.ts
import React from "react";
import { useState, useRef, useCallback } from "react";
import * as ethers from "ethers";
import * as Localization from "expo-localization";
import { useWalletStore } from "../store/useWalletStore";
import { useTransactionStore } from "../store/useTransactionStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useChain } from "../hooks/useChain";
import { covalentGet } from "../lib/covalent";
import { CHAINS } from "../config/chainRegistry";
import { priceService } from "../services/PriceService";
import { NonEvmBalanceService } from "../services/NonEvmBalanceService";

// ---------- Types ----------
interface CovalentItem {
  contract_ticker_symbol?: string;
  balance: string;
  logo_url?: string | null;
  type: string;
  nft_data?: any[];
  contract_name?: string;
  contract_decimals?: number;
  contract_address?: string;
  quote?: number;
}

export type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;
  quoteLocal: number;
  quoteUsd: number;
  logo_url: string;
  contract_address?: string;
  contract_decimals?: number;
  contract_name?: string;
  chainId?: number;
};

export type NFTItem = {
  token_id: string;
  token_url?: string;
  external_data?: any;
};

// ---------- Constants ----------
const SYMBOL_LOGO: Record<string, string> = {
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  MATIC: "https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/large/Tether-logo.png",
  DAI: "https://assets.coingecko.com/coins/images/9956/large/4943.png",
  ETC: "https://assets.coingecko.com/coins/images/453/large/ethereum-classic-logo.png",
  FTM: "https://assets.coingecko.com/coins/images/4001/large/Fantom_round.png",
  ARB: "https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg",
  OP: "https://assets.coingecko.com/coins/images/25244/large/Optimism.png",
  AVAX: "https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  BASE: "https://assets.coingecko.com/coins/images/27500/large/lusd.png",
  // Additional common tokens
  BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  XRP: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  ADA: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
  DOT: "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
  LINK: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  ATOM: "https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png",
  TRX: "https://assets.coingecko.com/coins/images/1094/large/tron-logo.png",
  XLM: "https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png",
  BCH: "https://assets.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
  LTC: "https://assets.coingecko.com/coins/images/2/large/litecoin.png",
  DOGE: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
};

const ASSET_CACHE_KEY = 'crypto_pal_assets_cache';
// CRITICAL: Increased cache duration for rapid Wallet tab display
// Cache for 5 minutes (300s) - balances don't change that frequently
// This ensures Wallet tab loads instantly on return visits
const ASSET_CACHE_DURATION = 300_000; // 5 minutes (was 60s)

type AssetsCacheEnvelope = {
  address: string;
  localCurrency: string;
  ts: number;
  balances: BalanceItem[];
  nfts: NFTItem[];
};

// ---------- Main Hook ----------
export const useAssets = () => {
  const { address } = useWalletStore();
  const { chains } = useChain();
  const localCurrency = Localization.getLocales()[0]?.currencyCode || 'USD';
  
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isMounted = useRef(true);
  const lastFetchTime = useRef(0);
  const lastWalletAddress = useRef<string | null>(null);
  const isFetching = useRef(false);
  const isInitialMount = useRef(true); // Track if this is the first mount
  
  // CRITICAL: Ensure isMounted is set to true on mount
  React.useEffect(() => {
    isMounted.current = true;
    console.log('useAssets: ✅ Component mounted, isMounted set to true');
    return () => {
      isMounted.current = false;
      console.log('useAssets: ⚠️ Component unmounted, isMounted set to false');
    };
  }, []);

  const fetchAllChainBalances = useCallback(async () => {
    console.log(`useAssets: 🚀 fetchAllChainBalances called for address: ${address}`);
    
    if (!isMounted.current || !address) {
      console.log(`useAssets: ⏭️ Skipping - isMounted: ${isMounted.current}, address: ${address}`);
      return;
    }

    const now = Date.now();
    const isSameWallet = lastWalletAddress.current === address;
    const isCacheValid = now - lastFetchTime.current < ASSET_CACHE_DURATION;
    
    console.log(`useAssets: Cache check - isSameWallet: ${isSameWallet}, isCacheValid: ${isCacheValid}, lastFetchTime: ${lastFetchTime.current}`);
    
    // Prevent multiple simultaneous calls (unless this is a force refresh)
    // Force refresh sets lastFetchTime to 0, which bypasses all guards
    // BUT: On initial mount (lastWalletAddress is null), we should use cache if available, not force refresh
    const isFirstLoad = lastWalletAddress.current === null;
    const isForceRefreshRequest = lastFetchTime.current === 0 && !isFirstLoad;
    if (isFetching.current && !isForceRefreshRequest) {
      console.log(`useAssets: ⏭️ Skipping - already fetching (isFetching: ${isFetching.current}, isForceRefresh: ${isForceRefreshRequest})`);
      return;
    }
    
    // CRITICAL: Always process BUY transactions - never skip them!
    // Even if cache is valid, we need to check for new BUY transactions
    let useCacheOnly = false;
    let cachedBalances: BalanceItem[] = [];
    
    if (isSameWallet && isCacheValid && !isForceRefreshRequest) {
      // Cache valid - load from cache but STILL process BUY transactions
      useCacheOnly = true;
      console.log('useAssets: Using cached balances, but will still check BUY transactions');
      
      // Load from cache first
      try {
        const cacheKey = `${ASSET_CACHE_KEY}:${address}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed: AssetsCacheEnvelope = JSON.parse(cached);
          if (parsed.address === address && parsed.balances && parsed.balances.length > 0) {
            console.log(`useAssets: ✅ Loaded ${parsed.balances.length} cached balances`);
            // Store cached balances to merge with BUY transactions
            cachedBalances = parsed.balances;
            // Set balances from cache immediately for fast UI
            setBalances(parsed.balances);
            setNfts(parsed.nfts || []);
            setLoading(false);
            
            // Continue to BUY transaction processing below (don't return!)
          }
        }
      } catch (e) {
        console.error('useAssets: Error loading cache:', e);
      }
    }
    
    // CRITICAL: Set fetching flag to prevent duplicate calls
    if (!useCacheOnly) {
      isFetching.current = true;
      setLoading(true);
    }
    
    // Removed verbose force refresh logging
    
    if (!isSameWallet) {
      // Wallet changed or first load - update reference
      // On first load (null -> address), don't treat as force refresh - let cache serve first
      if (isFirstLoad) {
        // First load: let cache serve, then refresh in background
        // Don't set lastFetchTime to 0 here - let it be served from cache first
      }
      lastWalletAddress.current = address;
      isInitialMount.current = false;
    }

    // CRITICAL: Only set loading if we don't have balances displayed (cache might have been served)
    // Check both balances state and if this is a background refresh
    const hasDisplayedBalances = balances.length > 0;
    const isBackgroundRefresh = hasDisplayedBalances && isSameWallet && isCacheValid;
    
    // Only show loading spinner if we have no balances to display
    if (!hasDisplayedBalances && !isBackgroundRefresh) {
      setLoading(true);
    }
    isFetching.current = true;
    setError(null);
    lastFetchTime.current = now;

    try {
      // CRITICAL: Initialize from cached balances if using cache-only mode
      // This ensures BUY transactions can merge with existing cached balances
      const allBalances: BalanceItem[] = useCacheOnly && cachedBalances.length > 0 
        ? [...cachedBalances] 
        : [];
      const allNfts: NFTItem[] = [];
      const allSymbols = new Set<string>();
      
      // Initialize allSymbols from cached balances
      if (useCacheOnly && cachedBalances.length > 0) {
        cachedBalances.forEach(b => {
          if (b.contract_ticker_symbol) {
            allSymbols.add(b.contract_ticker_symbol.toUpperCase());
          }
        });
        console.log(`useAssets: Initialized with ${allBalances.length} cached balances, ${allSymbols.size} symbols`);
      }

      // CRITICAL: Only process chains if NOT using cache-only mode
      // In cache-only mode, we skip chain processing but still process BUY transactions
      if (!useCacheOnly) {
      
      // CRITICAL: Process ALL chains to ensure purchased tokens appear
      // Previously only essential chains were processed first, which could miss purchases on other networks
      // Now process all chains to catch purchases on ANY network (BSC, Polygon mainnet, etc.)
      const essentialChainIds = [1, 11155111, 80002, 137, 56]; // Include mainnets too (users buy on mainnet!)
      const essentialChains = chains.filter(chain => essentialChainIds.includes(chain.chainId));
      const remainingChains = chains.filter(chain => !essentialChainIds.includes(chain.chainId));

      // CRITICAL: Process essential chains FIRST with timeout to prevent blocking
      // If cache is already displayed, process in background without blocking UI
      const hasCachedData = cachedBalances.length > 0;
      const processInBackground = hasCachedData && useCacheOnly;
      
      // Process essential chains FIRST (non-blocking if cache already displayed)
      for (const currentChain of essentialChains) {
        try {
          // Reduced logging for performance

          // Test RPC connectivity with ultra-fast timeout
          let provider: ethers.providers.Provider | null = null;
          let workingRpc = '';

          for (const rpc of currentChain.rpcUrls || []) {
            try {
              const testProvider = new ethers.providers.StaticJsonRpcProvider(rpc);
              
              // Test basic connectivity with timeout - reduced for faster loading
              const testBlock = await Promise.race([
                testProvider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 2000)) // Reduced to 2s for faster loading
              ]);
              
              if (Number(testBlock) > 0) {
                provider = testProvider;
                workingRpc = rpc;
                break;
              }
            } catch (e: any) {
              continue;
            }
          }

          if (!provider) {
            continue;
          }

          // Fetch native token balance - try multiple RPC endpoints AND Etherscan API for accuracy
          // Use MOST RECENT balance (from Etherscan API preferred), not highest, as users may sell tokens
          const symbol = currentChain.nativeSymbol || 'ETH';
          let wei: ethers.BigNumber = ethers.BigNumber.from(0);
          let lastSuccessfulBalance: ethers.BigNumber | null = null;
          let attempts = 0;
          const maxAttempts = Math.min(3, (currentChain.rpcUrls || []).length);
          let etherscanBalance: ethers.BigNumber | null = null;
          
          // For Sepolia and Ethereum mainnet, check Etherscan API as authoritative source (most recent/accurate)
          if (currentChain.chainId === 11155111 || currentChain.chainId === 1) {
            try {
              const apiKey = '3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M';
              const chainId = currentChain.chainId;
              // Use V2 API for both mainnet and Sepolia
              const etherscanUrl = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
              
              const etherscanResponse = await Promise.race([
                fetch(etherscanUrl).then(res => {
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  return res;
                }),
                new Promise<Response>((_, reject) => 
                  setTimeout(() => reject(new Error('Timeout')), 5000)
                )
              ]);
              
              const etherscanData = await etherscanResponse.json();
              if (etherscanData.status === '1' && etherscanData.result) {
                etherscanBalance = ethers.BigNumber.from(etherscanData.result);
                attempts++;
                wei = etherscanBalance;
              }
            } catch (e: any) {
              // Silent fallback to RPC
            }
          }
          
          // If Etherscan didn't provide balance or returned 0, try RPC endpoints
          // Always try RPC even if Etherscan provided a balance, to get the most recent value
          // Use whichever is higher/more recent (after a purchase, balance should increase)
          // Note: For sales, we want the most recent value (which Etherscan should provide)
          for (let rpcIndex = 0; rpcIndex < maxAttempts; rpcIndex++) {
            const rpcUrl = (currentChain.rpcUrls || [])[rpcIndex];
            if (!rpcUrl) continue;
            
            try {
              const testProvider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);
              const balance = await Promise.race([
                testProvider.getBalance(address, 'latest'), // Use 'latest' block for freshest data
                new Promise<ethers.BigNumber>((_, reject) => 
                  setTimeout(() => reject(new Error('Balance fetch timeout')), 3000)
                )
              ]);
              
              attempts++;
              lastSuccessfulBalance = balance;
              
              // Use the higher value (most recent transaction)
              if (etherscanBalance) {
                if (balance.gt(etherscanBalance)) {
                  wei = balance;
                }
              } else {
                wei = balance;
              }
            } catch (e: any) {
              continue;
            }
          }
          
          // Final fallback
          if (wei.eq(0)) {
            if (etherscanBalance && !etherscanBalance.eq(0)) {
              wei = etherscanBalance;
            } else if (lastSuccessfulBalance) {
              wei = lastSuccessfulBalance;
            }
          }
          
          if (attempts === 0) {
            wei = ethers.BigNumber.from(0);
          }

          const units = Number(ethers.utils.formatUnits(wei, 18));

          // CRITICAL: Include native tokens if balance > 0
          // BUT: Also include if balance is 0 but we have a BUY transaction for this token (will be handled by BUY transaction processing)
          // For now, only add if balance > 0 - BUY transactions will add placeholders separately
          if (units > 0) {
            allSymbols.add(symbol);
            allBalances.push({
              contract_ticker_symbol: symbol,
              balance: wei.toString(),
              quoteUsd: 0,
              quoteLocal: 0,
              logo_url: SYMBOL_LOGO[symbol] || SYMBOL_LOGO.ETH,
              contract_decimals: 18,
              contract_address: undefined,
              contract_name: `${symbol} (${currentChain.chainId === 1 ? 'Ethereum' : currentChain.chainId === 11155111 ? 'Sepolia' : currentChain.chainId === 137 ? 'Polygon' : currentChain.chainId === 80002 ? 'Polygon Amoy' : `Chain ${currentChain.chainId}`})`,
              chainId: currentChain.chainId,
            });
            console.log(`useAssets: ✅ Added chain balance for ${symbol}: ${units} (chainId: ${currentChain.chainId})`);
          } else {
            console.log(`useAssets: ⚠️ Chain balance for ${symbol} is 0 (chainId: ${currentChain.chainId}) - BUY transactions may still add placeholder`);
          }

          // Fetch ERC-20 tokens if Covalent is supported
          if (currentChain.covalentSupported && currentChain.covalentChainId) {
            try {
              const base = "https://api.covalenthq.com/v1";
              const url = `${base}/${encodeURIComponent(currentChain.covalentChainId as any)}/address/${address}/balances_v2/?quote-currency=USD&format=JSON&nft=true&no-nft-fetch=false&no-spam=true`;

              const covalentPromise = covalentGet(url);
              const covalentTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Covalent timeout')), 3000) // Increased timeout for reliability
              );

              const json = await Promise.race([covalentPromise, covalentTimeout]);
              const items: CovalentItem[] = (json as any).data?.items || [];
              const tokenItems = items.filter((i) => i.type !== "nft");

              // Add ERC-20 tokens (exclude native tokens since we already handle them)
              tokenItems.forEach((item) => {
                const symbol = (item.contract_ticker_symbol || "").toUpperCase();
                const nativeSymbol = (currentChain.nativeSymbol || "ETH").toUpperCase();
                const isNativeToken = symbol === nativeSymbol;
                
                if (symbol && Number(item.balance) > 0 && !isNativeToken) {
                  allSymbols.add(symbol);
                  allBalances.push({
                    contract_ticker_symbol: symbol,
                    balance: item.balance,
                    quoteUsd: item.quote || 0,
                    quoteLocal: 0,
                    logo_url: item.logo_url || SYMBOL_LOGO[symbol] || SYMBOL_LOGO.ETH,
                    contract_decimals: item.contract_decimals || 18,
                    contract_address: item.contract_address,
                    contract_name: item.contract_name || symbol,
                    chainId: currentChain.chainId,
                  });
                  // Removed verbose token logging
                } else if (isNativeToken) {
                  // Skip native token - already handled
                }
              });

              // Add NFTs
              const nftItems = items
                .filter((i) => i.type === "nft" && (i.nft_data?.length ?? 0) > 0)
                .flatMap((i) =>
                  (i.nft_data || []).map((nft: any) => ({
                    token_id: nft.token_id || '',
                    token_url: nft.token_url,
                    external_data: nft.external_data
                  }))
                );

              allNfts.push(...nftItems);
            } catch (e: any) {
              // Silent failure
            }
          }
        } catch (chainError: any) {
          // Silent failure
        }
      }
      
      // After essential chains, update UI immediately (before processing remaining chains)
      if (allBalances.length > 0) {
        // Quick deduplication for essential chains only
        const essentialDeduplicated = allBalances.reduce((acc, current) => {
          const currentKey = current.contract_address 
            ? `${current.contract_ticker_symbol}|${current.contract_address.toLowerCase()}|chain:${current.chainId}`
            : `${current.contract_ticker_symbol}|native|chain:${current.chainId}`;
          if (!acc.find(b => {
            const bKey = b.contract_address 
              ? `${b.contract_ticker_symbol}|${b.contract_address.toLowerCase()}|chain:${b.chainId}`
              : `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
            return bKey === currentKey;
          })) {
            acc.push(current);
          }
          return acc;
        }, [] as BalanceItem[]);
        
        setBalances(essentialDeduplicated);
        setLoading(false);
      }

      // CRITICAL: Fetch NON-EVM balances (e.g., BTC, SOL, XRP) and merge
      // This only runs when NOT in cache-only mode
      // This must happen BEFORE final deduplication to ensure purchased tokens appear
      try {
        console.log('useAssets: Fetching non-EVM balances (BTC, SOL, XRP)...');
        const nonEvmBalances = await NonEvmBalanceService.fetchAllNonEvmBalances();
        console.log(`useAssets: Found ${nonEvmBalances.length} non-EVM balances`);
        
        for (const neb of nonEvmBalances) {
          // Only include positive balances
          if (neb && parseFloat(neb.balance) > 0) {
            const asItem = NonEvmBalanceService.convertToBalanceItem(neb);
            allSymbols.add(neb.symbol.toUpperCase());
            allBalances.push(asItem);
            console.log(`useAssets: Added non-EVM balance: ${neb.symbol} ${neb.balance} (chainId: ${asItem.chainId})`);
          }
        }
      } catch (error) {
        console.error('useAssets: Error fetching non-EVM balances:', error);
        // Non-EVM fetch is best-effort, but log errors for debugging
      }
      } // Close "if (!useCacheOnly)" block - chain processing only happens when not cache-only
      
      // CRITICAL: Check BUY transactions to add purchased tokens even if balance is 0
      // MUST run in BOTH cache-only AND full fetch modes!
      // This ensures tokens purchased through Transak appear in Wallet immediately
      // CRITICAL: Use TransactionStore as single source of truth (reactive, auto-updates)
      console.log(`useAssets: 🔍 Checking BUY transactions for address: ${address} (useCacheOnly: ${useCacheOnly})`);
      try {
        const transactionStore = useTransactionStore.getState();
        
        // CRITICAL: Ensure transactions are loaded from storage before querying
        // loadTransactions is idempotent (only loads once per wallet)
        // CRITICAL: Normalize address to lowercase for consistent storage keys
        const normalizedAddress = address.toLowerCase();
        await transactionStore.loadTransactions(normalizedAddress);
        
        // CRITICAL: TransactionStore automatically retries incomplete transactions
        // No manual retry needed - store handles it
        // CRITICAL: Use normalized address for consistent lookup
        const allTransactions = transactionStore.getTransactions(normalizedAddress) || [];
        
        console.log(`useAssets: 📊 Retrieved ${allTransactions.length} total transactions from TransactionStore for ${normalizedAddress}`);
        const allBuyTxsRaw = allTransactions.filter((tx: any) => tx && tx.type === 'BUY');
        
        console.log(`useAssets: 📊 Total BUY transactions from TransactionStore: ${allBuyTxsRaw.length}`);
        
        // CRITICAL: Include ALL BUY transactions - use tokenSymbol, tokenName, or fallback to 'UNKNOWN'
        // Don't filter out transactions - display them even if incomplete (they'll be updated later)
        // CRITICAL: Ensure ALL BUY transactions are included, even if tokenSymbol is empty
        const allBuyTxs = allBuyTxsRaw.map((tx: any) => {
          // Ensure we have at least something to display
          // CRITICAL: If tokenSymbol is empty but we have orderId, use 'UNKNOWN' as placeholder
          // This ensures the transaction appears in Wallet tab and will be corrected when API succeeds
          if (!tx.tokenSymbol && !tx.tokenName) {
            console.warn(`useAssets: ⚠️ BUY transaction ${tx.id} missing both tokenSymbol and tokenName - will use 'UNKNOWN'`);
            return { ...tx, tokenSymbol: 'UNKNOWN', tokenName: 'UNKNOWN' };
          }
          // CRITICAL: If tokenSymbol is empty string (not undefined), convert to 'UNKNOWN' so it displays
          if (tx.tokenSymbol === '' || tx.tokenSymbol === null) {
            console.warn(`useAssets: ⚠️ BUY transaction ${tx.id} has empty tokenSymbol - will use 'UNKNOWN'`);
            return { ...tx, tokenSymbol: 'UNKNOWN', tokenName: tx.tokenName || 'UNKNOWN' };
          }
          return tx;
        });
        
        console.log(`useAssets: Found ${allBuyTxs.length} BUY transactions with tokenSymbol (TransactionStore handles retry automatically)`);
        
        // CRITICAL: Include ALL BUY transactions with tokenSymbol, regardless of age
        // DO NOT limit to 20 - show ALL previous BUY transactions
        // Ensure allBuyTxs is an array before using
        const allBuyTxsArray = Array.isArray(allBuyTxs) ? allBuyTxs : [];
        // CRITICAL: Include ALL BUY transactions, not just 20 most recent
        // CRITICAL FIX: Sort by timestamp to ensure proper order
        let recentBuys = allBuyTxsArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Show ALL BUY transactions
        
        console.log(`useAssets: Including ALL ${recentBuys.length} BUY transactions (no limit, no age restriction)`);
        
        // Debug: Check if we have yesterday's transactions
        const yesterday = Date.now() - (24 * 60 * 60 * 1000);
        const yesterdaysTxs = recentBuys.filter(tx => tx.timestamp && tx.timestamp < yesterday);
        console.log(`useAssets: Found ${yesterdaysTxs.length} BUY transactions from before yesterday`);
        
        // CRITICAL: First pass - merge orderIds onto existing balances that match BUY transactions
        // This ensures tokens with real balances get orderId from BUY transactions for display
        for (const buyTx of recentBuys) {
          if (!buyTx.orderId) continue; // Skip if no orderId
          
          let symbol = (buyTx.tokenSymbol || buyTx.tokenName || 'UNKNOWN').toUpperCase().trim();
          if (!symbol || symbol === '' || symbol === 'MISSING') {
            symbol = 'UNKNOWN';
          }
          
          // Find existing balance with same symbol and chain
          const existingBalance = allBalances.find(b => {
            const bSymbol = b.contract_ticker_symbol?.toUpperCase().trim();
            const sameSymbol = bSymbol === symbol;
            const sameChain = (b.chainId === buyTx.chainId) || 
                            (!b.chainId && !buyTx.chainId) || 
                            (b.chainId === 0 && buyTx.chainId === 0);
            return sameSymbol && sameChain && !(b as any).orderId;
          });
          
          if (existingBalance) {
            // Merge orderId onto existing balance
            (existingBalance as any).orderId = buyTx.orderId;
            const balanceValue = Number(ethers.utils.formatUnits(existingBalance.balance, existingBalance.contract_decimals || 18));
            const isTargetOrderId = buyTx.orderId === 'ac1e2dbf-4d08-4255-a9a2-9decada08fe6';
            if (isTargetOrderId) {
              console.log(`useAssets: 🎯 TARGET ORDER ID: ✅ FIRST PASS merged orderId ${buyTx.orderId} onto existing ${symbol} balance (${balanceValue}, chainId: ${buyTx.chainId})`);
            } else {
              console.log(`useAssets: ✅ Merged orderId ${buyTx.orderId} onto existing ${symbol} balance (${balanceValue}, chainId: ${buyTx.chainId})`);
            }
          } else {
            const isTargetOrderId = buyTx.orderId === 'ac1e2dbf-4d08-4255-a9a2-9decada08fe6';
            if (isTargetOrderId) {
              console.log(`useAssets: 🎯 TARGET ORDER ID: ⚠️ FIRST PASS did not find existing balance for ${symbol} (chainId: ${buyTx.chainId}) - will add as placeholder in second pass`);
            }
          }
        }
        
        // Second pass - add BUY transaction placeholders for tokens that don't exist yet
        for (const buyTx of recentBuys) {
          // CRITICAL: Use tokenSymbol FIRST, then tokenName, then 'UNKNOWN' as fallback
          // This ensures ALL BUY transactions display in Wallet tab, even if incomplete
          let symbol = (buyTx.tokenSymbol || buyTx.tokenName || 'UNKNOWN').toUpperCase().trim();
          if (!symbol || symbol === '' || symbol === 'MISSING') {
            symbol = 'UNKNOWN';
            console.warn(`useAssets: ⚠️ BUY transaction ${buyTx.id} has empty symbol, using 'UNKNOWN' (will be updated by retry mechanism)`);
          }
          
          // CRITICAL: Check if token already exists in balances
          // CRITICAL: For BUY transactions, we want to ensure they display even if a token with same symbol exists
          // This is because BUY transactions represent user purchases that should be visible
          // Even if the token already exists from chain balance, we should ensure BUY transaction tokens are visible
          const alreadyExists = allBalances.some(b => {
            const bSymbol = b.contract_ticker_symbol?.toUpperCase().trim();
            const sameSymbol = bSymbol === symbol;
            const sameChain = (b.chainId === buyTx.chainId) || 
                            (!b.chainId && !buyTx.chainId) || 
                            (b.chainId === 0 && buyTx.chainId === 0);
            
            // CRITICAL: If token exists but has no orderId (from chain balance), and BUY has orderId
            // Merge orderId immediately onto existing balance (fallback if first pass didn't catch it)
            if (sameSymbol && sameChain) {
              const existingHasOrderId = (b as any).orderId;
              const buyHasOrderId = buyTx.orderId;
              const existingBalance = Number(ethers.utils.formatUnits(b.balance, b.contract_decimals || 18));
              
              // If existing has a real balance (> 0) and no orderId, merge orderId immediately
              if (existingBalance > 0 && !existingHasOrderId && buyHasOrderId) {
                // Merge orderId onto existing balance immediately (fallback if first pass missed it)
                (b as any).orderId = buyHasOrderId;
                console.log(`useAssets: ✅ Merged orderId ${buyHasOrderId} onto existing ${symbol} balance (${existingBalance}) in alreadyExists check`);
                return true; // Skip adding BUY placeholder - orderId already merged
              }
              
              // If existing doesn't have orderId but BUY does, AND existing balance is 0, allow BUY to be added
              if (!existingHasOrderId && buyHasOrderId && existingBalance === 0) {
                return false; // Allow BUY transaction to be added
              }
              
              // If both have orderIds and they're different, allow both (will be deduplicated later)
              if (existingHasOrderId && buyHasOrderId && existingHasOrderId !== buyHasOrderId) {
                return false; // Different purchases, allow both
              }
              
              // If existing already has the same orderId, skip
              if (existingHasOrderId && buyHasOrderId && existingHasOrderId === buyHasOrderId) {
                return true; // Same orderId, skip duplicate
              }
            }
            
            // CRITICAL: For "UNKNOWN" tokens, allow multiple instances if they have different timestamps
            // This ensures all purchases display even if they haven't been enriched with tokenSymbol yet
            if (symbol === 'UNKNOWN') {
              // Check if there's already an "UNKNOWN" with the same orderId or timestamp
              const existingUnknown = allBalances.find(
                bal => bal.contract_ticker_symbol?.toUpperCase().trim() === 'UNKNOWN' && 
                       bal.chainId === buyTx.chainId
              );
              
              // If orderId exists, check by orderId (same purchase = duplicate)
              if (buyTx.orderId && existingUnknown) {
                const existingOrderId = (existingUnknown as any).orderId;
                if (existingOrderId === buyTx.orderId) {
                  return true; // Same orderId = duplicate
                }
              }
              
              // If no orderId, check by timestamp (different timestamp = different purchase)
              if (!buyTx.orderId && existingUnknown) {
                // Check if this is the same purchase by comparing timestamps (within 5 seconds = likely same purchase)
                const existingTimestamp = (existingUnknown as any).timestamp;
                if (existingTimestamp && Math.abs(existingTimestamp - buyTx.timestamp) < 5000) {
                  return true; // Same timestamp = likely duplicate
                }
              }
              
              // Different purchase (different orderId or different timestamp), allow it
              return false; // Not a duplicate
            }
            
            return sameSymbol && sameChain;
          });
          
          // CRITICAL: Enhanced logging for specific orderId lookup (user requested)
          // Must be AFTER alreadyExists is calculated
          const isTargetOrderId = buyTx.orderId === 'ac1e2dbf-4d08-4255-a9a2-9decada08fe6';
          if (isTargetOrderId) {
            console.log(`useAssets: 🎯 TARGET ORDER ID FOUND: Processing transaction for orderId ac1e2dbf-4d08-4255-a9a2-9decada08fe6`, {
              transactionId: buyTx.id,
              tokenSymbol: buyTx.tokenSymbol || '(empty)',
              tokenName: buyTx.tokenName || '(empty)',
              finalSymbol: symbol,
              chainId: buyTx.chainId,
              networkName: (buyTx as any).networkName || '(empty)',
              orderId: buyTx.orderId,
              tokenAmount: buyTx.tokenAmount || '(empty)',
              currencyAmount: buyTx.currencyAmount || '(empty)',
              willDisplayInWallet: !alreadyExists,
              status: alreadyExists ? 'Already exists in balances' : 'Will add to Wallet tab'
            });
          }
          
          // CRITICAL: Log what we're using for debugging
          console.log(`useAssets: Processing BUY transaction ${buyTx.id}:`, {
            tokenSymbol: buyTx.tokenSymbol || '(empty)',
            tokenName: buyTx.tokenName || '(empty)',
            finalSymbol: symbol,
            chainId: buyTx.chainId,
            orderId: buyTx.orderId || '(no orderId)'
          });
          
          if (!alreadyExists) {
            // Add placeholder entry for purchased token (even if balance is 0)
            allSymbols.add(symbol);
            const balanceItem: BalanceItem & { orderId?: string } = {
              contract_ticker_symbol: symbol,
              balance: '0',
              quoteUsd: 0,
              quoteLocal: 0,
              logo_url: SYMBOL_LOGO[symbol] || '',
              contract_decimals: symbol === 'BTC' ? 8 : symbol === 'XRP' ? 6 : symbol === 'SOL' ? 9 : 18,
              contract_address: undefined,
              contract_name: symbol,
              chainId: buyTx.chainId || 0,
            };
            
            // CRITICAL: Store orderId AND timestamp for ALL BUY transactions
            // This allows the Wallet tab filter to identify BUY transactions and show them even with 0 balance
            // Also store timestamp so we can identify unique purchases even without orderId
            if (buyTx.orderId) {
              (balanceItem as any).orderId = buyTx.orderId;
              console.log(`useAssets: ✅ Set orderId on balance item for ${symbol}: ${buyTx.orderId}`);
            }
            // CRITICAL: Store timestamp for ALL BUY transactions (even without orderId)
            // This allows Wallet tab to display all purchases, not just those with orderId
            (balanceItem as any).buyTimestamp = buyTx.timestamp;
            (balanceItem as any).buyTransactionId = buyTx.id;
            if (!buyTx.orderId) {
              console.log(`useAssets: ⚠️ No orderId for BUY transaction ${buyTx.id}, but will display in Wallet tab using timestamp`);
            }
            
            allBalances.push(balanceItem);
            const logMsg = `useAssets: ✅ Added placeholder for purchased token: ${symbol} (chainId: ${buyTx.chainId || 0}, orderId: ${buyTx.orderId || 'none'}, from BUY transaction ${buyTx.id})`;
            if (isTargetOrderId) {
              console.log(`useAssets: 🎯 TARGET ORDER ID: ${logMsg}`);
              console.log(`useAssets: 🎯 TARGET ORDER ID: ✅ Transaction will display in Wallet tab as "${symbol}"`);
              console.log(`useAssets: 🎯 TARGET ORDER ID: Balance item has orderId: ${!!(balanceItem as any).orderId}`);
            } else {
              console.log(logMsg);
            }
          } else {
            const logMsg = `useAssets: Skipped ${symbol} - already exists in balances (chainId: ${buyTx.chainId || 0}, orderId: ${buyTx.orderId || 'none'})`;
            if (isTargetOrderId) {
              console.log(`useAssets: 🎯 TARGET ORDER ID: ${logMsg}`);
              console.log(`useAssets: 🎯 TARGET ORDER ID: ℹ️ Token "${symbol}" already in Wallet tab, no duplicate needed`);
            } else {
              console.log(logMsg);
            }
          }
        }
      } catch (e) {
        console.error('useAssets: ❌ Error processing BUY transactions:', e);
      }

      // COMPREHENSIVE DEDUPLICATION: Handle all token types properly
      const deduplicatedBalances = allBalances.reduce((acc, current) => {
        // Create a unique key for each token type
        let currentKey: string;

        if (current.contract_address) {
          // ERC-20 tokens: use contract address + chain as unique identifier
          currentKey = `${current.contract_ticker_symbol}|${(current.contract_address || '').toLowerCase()}|chain:${current.chainId}`;
        } else {
          // Native tokens: use symbol + chain as unique identifier
          currentKey = `${current.contract_ticker_symbol}|native|chain:${current.chainId}`;
        }

        const existing = acc.find(b => {
          let existingKey: string;
          if (b.contract_address) {
            existingKey = `${b.contract_ticker_symbol}|${(b.contract_address || '').toLowerCase()}|chain:${b.chainId}`;
          } else {
            existingKey = `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
          }
          return existingKey === currentKey;
        });
        
        if (existing) {
          // Token already exists, decide which one to keep
          const currentBalance = Number(ethers.utils.formatUnits(current.balance, current.contract_decimals || 18));
          const existingBalance = Number(ethers.utils.formatUnits(existing.balance, existing.contract_decimals || 18));
          
          // CRITICAL: Check if either has orderId (from BUY transaction)
          const currentHasOrderId = (current as any).orderId;
          const existingHasOrderId = (existing as any).orderId;
          
          // Find the index of the existing item in acc
          const existingIndex = acc.findIndex(b => {
            let bKey: string;
            if (b.contract_address) {
              bKey = `${b.contract_ticker_symbol}|${(b.contract_address || '').toLowerCase()}|chain:${b.chainId}`;
            } else {
              bKey = `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
            }
            return bKey === currentKey;
          });
          
          // For native tokens, prefer real balances over BUY transactions with 0 balance
          if (!current.contract_address && !existing.contract_address) {
            // CRITICAL: If one has a real balance (> 0) and the other is a BUY transaction with 0 balance, prefer the real balance
            if (currentBalance > 0 && existingBalance === 0 && existingHasOrderId && !currentHasOrderId) {
              // Current has real balance, existing is BUY with 0 - replace with current (real balance) but preserve orderId
              if (existingIndex >= 0) {
                acc[existingIndex] = current;
                // Preserve orderId from BUY transaction for display
                if (existingHasOrderId) {
                  (acc[existingIndex] as any).orderId = existingHasOrderId;
                  console.log(`useAssets: ✅ Preserved orderId ${existingHasOrderId} when replacing BUY placeholder with real balance for ${current.contract_ticker_symbol}`);
                }
              }
            } else if (existingBalance > 0 && currentBalance === 0 && currentHasOrderId && !existingHasOrderId) {
              // Existing has real balance, current is BUY with 0 - keep existing (real balance) but add orderId from BUY
              if (existingIndex >= 0) {
                // Keep existing but add orderId from BUY transaction
                (acc[existingIndex] as any).orderId = currentHasOrderId;
                console.log(`useAssets: ✅ Merged orderId ${currentHasOrderId} onto existing ${existing.contract_ticker_symbol} balance (${existingBalance})`);
              }
            }
            // If current is a BUY transaction and existing is not, AND both have 0 balance, prefer current (BUY)
            else if (currentHasOrderId && !existingHasOrderId && currentBalance === 0 && existingBalance === 0) {
              const index = acc.findIndex(b => {
                let bKey: string;
                if (b.contract_address) {
                  bKey = `${b.contract_ticker_symbol}|${(b.contract_address || '').toLowerCase()}|chain:${b.chainId}`;
                } else {
                  bKey = `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
                }
                return bKey === currentKey;
              });
              if (index >= 0) acc[index] = current;
            }
            // If existing is a BUY transaction and current is not, AND both have 0 balance, keep existing
            else if (!currentHasOrderId && existingHasOrderId && currentBalance === 0 && existingBalance === 0) {
              // Keep existing (don't replace)
            }
            // If both are BUY transactions or both are not, prefer higher balance
            else if (currentBalance > existingBalance) {
              const index = acc.findIndex(b => {
                let bKey: string;
                if (b.contract_address) {
                  bKey = `${b.contract_ticker_symbol}|${(b.contract_address || '').toLowerCase()}|chain:${b.chainId}`;
                } else {
                  bKey = `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
                }
                return bKey === currentKey;
              });
              if (index >= 0) {
                acc[index] = current;
                // Preserve orderId from whichever had it
                if (existingHasOrderId && !currentHasOrderId) {
                  (acc[index] as any).orderId = existingHasOrderId;
                }
              }
            } else if (existingBalance > currentBalance) {
              // Existing has higher balance, but preserve orderId if current has it
              if (currentHasOrderId && !existingHasOrderId) {
                const index = acc.findIndex(b => {
                  let bKey: string;
                  if (b.contract_address) {
                    bKey = `${b.contract_ticker_symbol}|${(b.contract_address || '').toLowerCase()}|chain:${b.chainId}`;
                  } else {
                    bKey = `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
                  }
                  return bKey === currentKey;
                });
                if (index >= 0) {
                  (acc[index] as any).orderId = currentHasOrderId;
                }
              }
            }
          }
        } else {
          // New token, add it
          acc.push(current);
        }
        
        return acc;
      }, [] as BalanceItem[]);

      // Deduplication complete
      
      // Debug: Log BUY transactions before second deduplication (check for both orderId and buyTimestamp)
      const buyTxBeforeSecond = deduplicatedBalances.filter(b => (b as any).orderId || (b as any).buyTimestamp);
      console.log(`useAssets: 📊 Before second deduplication: ${deduplicatedBalances.length} total, ${buyTxBeforeSecond.length} BUY transactions`);

      // CRITICAL: Additional check to ensure no duplicates remain
      // BUT: Must preserve BUY transactions (with orderId OR buyTimestamp) even if they have same symbol
      // This second pass uses a simpler key but should NOT remove BUY transactions
      const finalBalances = deduplicatedBalances.filter((balance, index, arr) => {
        // CRITICAL: If this is a BUY transaction (has orderId OR buyTimestamp), ALWAYS KEEP IT
        // BUY transactions represent user purchases and must be displayed even if they match existing balances
        const hasOrderId = (balance as any).orderId;
        const hasBuyTimestamp = (balance as any).buyTimestamp;
        if (hasOrderId || hasBuyTimestamp) {
          // This is a BUY transaction - ALWAYS keep it
          // Only check for exact duplicates (same orderId AND same timestamp)
          const exactDuplicate = arr.find((b, i) => 
            i !== index && 
            ((b as any).orderId || (b as any).buyTimestamp) && 
            b.contract_ticker_symbol === balance.contract_ticker_symbol &&
            b.chainId === balance.chainId &&
            // Same orderId = same purchase
            ((hasOrderId && (b as any).orderId === (balance as any).orderId) ||
             // Same timestamp (within 1 second) = same purchase
             (hasBuyTimestamp && (b as any).buyTimestamp && Math.abs((b as any).buyTimestamp - (balance as any).buyTimestamp) < 1000))
          );
          
          // If no exact duplicate, keep this BUY transaction
          if (!exactDuplicate) {
            return true;
          }
          
          // If there's an exact duplicate, keep the first one
          const firstIndex = arr.findIndex(b => {
            const sameOrderId = hasOrderId && (b as any).orderId === (balance as any).orderId;
            const sameBuyTimestamp = hasBuyTimestamp && (b as any).buyTimestamp && Math.abs((b as any).buyTimestamp - (balance as any).buyTimestamp) < 1000;
            return (sameOrderId || sameBuyTimestamp) &&
                   b.contract_ticker_symbol === balance.contract_ticker_symbol &&
                   b.chainId === balance.chainId;
          });
          return firstIndex === index;
        }
        
        // For non-BUY transactions, use the original deduplication logic
        // CRITICAL: Non-BUY transactions should NOT remove BUY transactions
        let currentKey: string;
        if (balance.contract_address) {
          currentKey = `${balance.contract_ticker_symbol}_${balance.contract_address.toLowerCase()}`;
        } else {
          currentKey = balance.contract_ticker_symbol;
        }
        
        const isDuplicate = arr.findIndex(b => {
          // CRITICAL: Don't consider BUY transactions as duplicates of non-BUY transactions
          const bHasOrderId = (b as any).orderId;
          const bHasBuyTimestamp = (b as any).buyTimestamp;
          if ((bHasOrderId || bHasBuyTimestamp) && !hasOrderId && !hasBuyTimestamp) return false;
          if (!bHasOrderId && !bHasBuyTimestamp && (hasOrderId || hasBuyTimestamp)) return false;
          
          let bKey: string;
          if (b.contract_address) {
            bKey = `${b.contract_ticker_symbol}_${b.contract_address.toLowerCase()}`;
          } else {
            bKey = b.contract_ticker_symbol;
          }
          return bKey === currentKey;
        }) !== index;
        
        return !isDuplicate;
      });
      
      // Debug: Log BUY transactions in final balances (check for both orderId and buyTimestamp)
      const buyTxInFinal = finalBalances.filter(b => (b as any).orderId || (b as any).buyTimestamp);
      const nonBuyTxInFinal = finalBalances.filter(b => !(b as any).orderId && !(b as any).buyTimestamp);
      console.log(`useAssets: 📊 After second deduplication: ${finalBalances.length} total balances (${buyTxInFinal.length} BUY transactions, ${nonBuyTxInFinal.length} non-BUY)`);
      if (buyTxInFinal.length > 0) {
        console.log(`useAssets: ✅ Final balances contain ${buyTxInFinal.length} BUY transactions:`, buyTxInFinal.map(b => `${b.contract_ticker_symbol} (orderId: ${(b as any).orderId || 'none'}, buyTimestamp: ${(b as any).buyTimestamp || 'none'}, chainId: ${b.chainId})`));
      } else {
        console.warn(`useAssets: ⚠️ WARNING: No BUY transactions in final balances! This means they were removed during deduplication.`);
      }
      
      // Removed verbose deduplication logging

      // REMOVED: Fallback logic was causing ETH duplication
      // Essential chains already handle Sepolia and Polygon Amoy properly

      // Get prices for all symbols using centralized service
      // CRITICAL: Ensure ALL tokens (including non-EVM) get prices for $value display
      if (allSymbols.size > 0) {
        try {
          const symbolsArray = Array.from(allSymbols);
          const priceMap = await priceService.getPrices(symbolsArray, localCurrency);
          
          // Apply prices to balances
          // CRITICAL: Handle both EVM (wei format) and non-EVM (human-readable format) balances
          console.log(`useAssets: Applying prices to ${finalBalances.length} balances, priceMap has keys:`, Object.keys(priceMap));
          finalBalances.forEach(balance => {
            const symbol = (balance.contract_ticker_symbol || 'UNKNOWN').toUpperCase();
            const priceData = priceMap[symbol];
            if (priceData) {
              console.log(`useAssets: ✅ Price found for ${symbol}: $${priceData.usd.toFixed(2)}`);
              // For non-EVM tokens, balance might already be in human-readable format
              // Check if balanceHuman exists (from NonEvmBalanceService)
              let balanceValue: number;
              if ((balance as any).balanceHuman !== undefined) {
                // Non-EVM token - use human-readable balance
                balanceValue = parseFloat((balance as any).balanceHuman);
              } else {
                // EVM token - convert from wei format
                balanceValue = Number(ethers.utils.formatUnits(balance.balance, balance.contract_decimals || 18));
              }
              
              // CRITICAL: Always set prices, even if balance is 0 (for display purposes)
              balance.quoteUsd = priceData.usd * balanceValue;
              balance.quoteLocal = priceData.local * balanceValue;
            } else {
              // If price fetch failed for this symbol, ensure we still set 0 (will show dash in UI)
              balance.quoteUsd = 0;
              balance.quoteLocal = 0;
            }
          });
        } catch (priceError) {
          // Silent price fetch failure - prices are nice to have but not critical
          // Set 0 for all balances so UI shows dash
          finalBalances.forEach(balance => {
            balance.quoteUsd = 0;
            balance.quoteLocal = 0;
          });
        }
      }

      // CRITICAL: If using cache-only mode, merge BUY transactions with cached balances
      if (useCacheOnly && cachedBalances.length > 0) {
        // In cache-only mode, allBalances already contains cached balances
        // BUY transactions have been merged above
        // Now we need to deduplicate and apply prices
        
        const buyTxCount = allBalances.length - cachedBalances.length;
        console.log(`useAssets: Cache-only mode - processing ${allBalances.length} balances (${cachedBalances.length} cached + ${buyTxCount} from BUY)`);
        
        // CRITICAL: Apply deduplication BEFORE setting balances to prevent flashing
        // Use the same deduplication logic as full fetch mode for consistency
        const deduplicatedBalances = allBalances.reduce((acc, current) => {
          // Create a unique key for each token type
          let currentKey: string;
          if (current.contract_address) {
            // ERC-20 tokens: use contract address + chain as unique identifier
            currentKey = `${current.contract_ticker_symbol}|${(current.contract_address || '').toLowerCase()}|chain:${current.chainId}`;
          } else {
            // Native tokens: use symbol + chain as unique identifier
            currentKey = `${current.contract_ticker_symbol}|native|chain:${current.chainId}`;
          }

          const existing = acc.find(b => {
            let existingKey: string;
            if (b.contract_address) {
              existingKey = `${b.contract_ticker_symbol}|${(b.contract_address || '').toLowerCase()}|chain:${b.chainId}`;
            } else {
              existingKey = `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
            }
            return existingKey === currentKey;
          });
          
          if (existing) {
            // Token already exists, decide which one to keep
            const currentBalance = Number(ethers.utils.formatUnits(current.balance, current.contract_decimals || 18));
            const existingBalance = Number(ethers.utils.formatUnits(existing.balance, existing.contract_decimals || 18));
            
            // For native tokens, prefer the one with higher balance OR if BUY transaction has orderId, prefer it
            if (!current.contract_address && !existing.contract_address) {
              // If current has orderId (from BUY), prefer it even if balance is 0
              const currentHasOrderId = (current as any).orderId;
              const existingHasOrderId = (existing as any).orderId;
              
              if (currentHasOrderId && !existingHasOrderId) {
                // BUY transaction takes precedence
                const index = acc.findIndex(b => {
                  let bKey: string;
                  if (b.contract_address) {
                    bKey = `${b.contract_ticker_symbol}|${(b.contract_address || '').toLowerCase()}|chain:${b.chainId}`;
                  } else {
                    bKey = `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
                  }
                  return bKey === currentKey;
                });
                if (index >= 0) acc[index] = current;
              } else if (currentBalance > existingBalance) {
                // Higher balance takes precedence
                const index = acc.findIndex(b => {
                  let bKey: string;
                  if (b.contract_address) {
                    bKey = `${b.contract_ticker_symbol}|${(b.contract_address || '').toLowerCase()}|chain:${b.chainId}`;
                  } else {
                    bKey = `${b.contract_ticker_symbol}|native|chain:${b.chainId}`;
                  }
                  return bKey === currentKey;
                });
                if (index >= 0) acc[index] = current;
              }
            }
          } else {
            // New token, add it
            acc.push(current);
          }
          
          return acc;
        }, [] as BalanceItem[]);
        
        // Apply prices
        if (allSymbols.size > 0) {
          try {
            const symbolsArray = Array.from(allSymbols);
            const priceMap = await priceService.getPrices(symbolsArray, localCurrency);
            
            deduplicatedBalances.forEach(balance => {
              const symbol = (balance.contract_ticker_symbol || 'UNKNOWN').toUpperCase();
              const priceData = priceMap[symbol];
              if (priceData) {
                let balanceValue: number;
                if ((balance as any).balanceHuman !== undefined) {
                  balanceValue = parseFloat((balance as any).balanceHuman);
                } else {
                  balanceValue = Number(ethers.utils.formatUnits(balance.balance, balance.contract_decimals || 18));
                }
                balance.quoteUsd = priceData.usd * balanceValue;
                balance.quoteLocal = priceData.local * balanceValue;
              } else {
                // Ensure 0 values for missing prices
                balance.quoteUsd = 0;
                balance.quoteLocal = 0;
              }
            });
          } catch (e) {
            console.error('useAssets: Error applying prices in cache-only mode:', e);
            // Set 0 values on error
            deduplicatedBalances.forEach(balance => {
              balance.quoteUsd = 0;
              balance.quoteLocal = 0;
            });
          }
        }
        
        console.log(`useAssets: ✅ Cache-only mode - final balances: ${deduplicatedBalances.length}`);
        // CRITICAL: Only update balances if they actually changed to prevent infinite loops
        // Check if balances are different before setting
        const balancesChanged = JSON.stringify(balances.map(b => ({symbol: b.contract_ticker_symbol, chainId: b.chainId, balance: b.balance}))) !== 
                               JSON.stringify(deduplicatedBalances.map(b => ({symbol: b.contract_ticker_symbol, chainId: b.chainId, balance: b.balance})));
        
        if (balancesChanged || balances.length === 0) {
          setBalances(deduplicatedBalances);
        }
        setNfts(allNfts);
        
        // CRITICAL FIX: Always save fresh cache even in cache-only mode
        // This ensures cache is refreshed on every return visit and doesn't get stale
        try {
          const payload: AssetsCacheEnvelope = {
            address,
            localCurrency,
            ts: Date.now(),
            balances: deduplicatedBalances, // Use deduplicated balances for cache
            nfts: allNfts,
          };
          const cacheKey = `${ASSET_CACHE_KEY}:${address}`;
          await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
          
          // Verify cache was saved
          const verifyCache = await AsyncStorage.getItem(cacheKey);
          if (verifyCache) {
            const parsed = JSON.parse(verifyCache);
            if (parsed.balances && parsed.balances.length === deduplicatedBalances.length) {
              console.log(`useAssets: ✅ Cache refreshed and verified (${deduplicatedBalances.length} balances)`);
            }
          }
        } catch (e: any) {
          console.error('useAssets: Error refreshing cache in cache-only mode:', e);
        }
        
        isFetching.current = false;
        return; // Early return for cache-only mode
      }

      // Final update with all chains processed (this will update essential chains already shown)
      console.log(`useAssets: 🎯 Setting final balances: ${finalBalances.length} total`);
      const buyTxBeingSet = finalBalances.filter(b => (b as any).orderId || (b as any).buyTimestamp);
      if (buyTxBeingSet.length > 0) {
        console.log(`useAssets: 🎯 Setting ${buyTxBeingSet.length} BUY transactions to Wallet:`, buyTxBeingSet.map(b => `${b.contract_ticker_symbol} (orderId: ${(b as any).orderId || 'none'}, buyTimestamp: ${(b as any).buyTimestamp || 'none'})`));
      }
      setBalances(finalBalances);
      setNfts(allNfts);
      // Persist to cache for instant next load
      // CRITICAL: Always save cache with verification to ensure persistence
      let cacheSaved = false;
      let retries = 0;
      while (!cacheSaved && retries < 3) {
        try {
          const payload: AssetsCacheEnvelope = {
            address,
            localCurrency,
            ts: Date.now(),
            balances: finalBalances,
            nfts: allNfts,
          };
          const cacheKey = `${ASSET_CACHE_KEY}:${address}`;
          await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
          
          // Verify cache was saved
          const verifyCache = await AsyncStorage.getItem(cacheKey);
          if (verifyCache) {
            const parsed = JSON.parse(verifyCache);
            if (parsed.balances && parsed.balances.length === finalBalances.length) {
              cacheSaved = true;
              console.log(`useAssets: ✅ Cache saved and verified (${finalBalances.length} balances)`);
            } else {
              retries++;
              console.warn(`useAssets: ⚠️ Cache verification failed (balance count mismatch), retry ${retries}/3`);
            }
          } else {
            retries++;
            console.warn(`useAssets: ⚠️ Cache save verification failed (null), retry ${retries}/3`);
          }
        } catch (e: any) {
          retries++;
          console.error(`useAssets: Error saving cache (retry ${retries}/3):`, e);
          if (retries < 3) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
          }
        }
      }
      
      if (!cacheSaved) {
        console.error('useAssets: ❌ CRITICAL: Failed to save cache after 3 retries - cache may be lost');
      }
      
      setError(null);
    } catch (error: any) {
      console.error('useAssets: Error in fetchAllChainBalances:', error);
      setError(error.message);
      setBalances([]);
      setNfts([]);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [address, chains, localCurrency]);

  const refresh = useCallback(async () => {
    // Check cache first on refresh (for subsequent tab visits)
    // This ensures cache is used on 2nd, 3rd, 4th visits too
    if (address) {
      try {
        const cacheKey = `${ASSET_CACHE_KEY}:${address}`;
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const parsed: AssetsCacheEnvelope = JSON.parse(raw);
          const ageMs = Date.now() - parsed.ts;
          const valid = parsed.address?.toLowerCase() === address.toLowerCase() && ageMs < ASSET_CACHE_DURATION;
          if (valid) {
            // Cache is still valid - serve it immediately
            setBalances(parsed.balances || []);
            setNfts(parsed.nfts || []);
            lastFetchTime.current = parsed.ts;
            lastWalletAddress.current = address;
            setLoading(false);
            
            // Refresh in background silently
            setTimeout(() => {
              if (isMounted.current) {
                fetchAllChainBalances();
              }
            }, 500);
            return;
          }
        }
      } catch (e: any) {
        // Cache read failed - proceed to fetch
      }
    }
    
    // No valid cache - fetch fresh
    return fetchAllChainBalances();
  }, [address, fetchAllChainBalances]);

  const clearCache = useCallback(() => {
    console.log('useAssets: Cache cleared for wallet change');
    lastFetchTime.current = 0;
    lastWalletAddress.current = null;
    setBalances([]);
    setNfts([]);
  }, []);

  const forceRefresh = useCallback(async () => {
    console.log('useAssets: Force refreshing - clearing cache and fetching fresh data');
    
    // CRITICAL: Bypass the isFetching guard for force refresh
    isFetching.current = false;
    
    // Clear cache
    if (address) {
      try {
        const cacheKey = `${ASSET_CACHE_KEY}:${address}`;
        await AsyncStorage.removeItem(cacheKey);
        console.log('useAssets: Cleared cache for force refresh');
      } catch (e) {
        console.error('useAssets: Error clearing cache:', e);
      }
    }
    
    // Reset timers to force fresh fetch (set to 0 so cache check fails)
    lastFetchTime.current = 0;
    
    // Trigger fresh fetch (this will bypass cache since lastFetchTime is 0)
    await fetchAllChainBalances();
  }, [address, fetchAllChainBalances]);

  // Initial load: serve cache immediately (if fresh), then refresh in background
  React.useEffect(() => {
    let cancelled = false;
    let hasCache = false;
    (async () => {
      try {
        if (!address) return;
        const cacheKey = `${ASSET_CACHE_KEY}:${address}`;
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const parsed: AssetsCacheEnvelope = JSON.parse(raw);
          const ageMs = Date.now() - parsed.ts;
          const valid = parsed.address?.toLowerCase() === address.toLowerCase() && ageMs < ASSET_CACHE_DURATION;
          if (valid && !cancelled) {
            // CRITICAL: Set balances and NFTs BEFORE setting loading to false
            setBalances(parsed.balances || []);
            setNfts(parsed.nfts || []);
            lastFetchTime.current = parsed.ts;
            lastWalletAddress.current = address;
            hasCache = true;
            // CRITICAL: Keep loading=true on initial mount even with cache
            // This ensures Wallet tab popup shows until fresh data loads
            // The popup will hide when balances arrive from background refresh
          }
        }
      } catch (e: any) {
        // Cache read failed silently
      } finally {
        // Only trigger background refresh if we don't have valid cache
        // If we have cache, refresh in background but keep loading state for popup
        if (!hasCache) {
          // No cache - fetch immediately (this will show loading)
          fetchAllChainBalances();
        } else {
          // Have cache - refresh in background but keep loading=true briefly for popup
          // Set loading to false only after a short delay OR when fresh data arrives
          setTimeout(() => {
            if (!cancelled) {
              fetchAllChainBalances();
            }
          }, 500); // Delay to ensure UI renders with cache first
        }
      }
    })();
    return () => { cancelled = true; };
  }, [address, fetchAllChainBalances]);

  // Cleanup - moved to initialization effect above

  return {
    balances,
    nfts,
    loading,
    error,
    refresh,
    forceRefresh,
    clearCache,
  };
};