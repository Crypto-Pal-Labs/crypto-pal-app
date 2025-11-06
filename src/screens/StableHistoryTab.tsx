// src/screens/StableHistoryTab.tsx
// SIMPLIFIED, STABLE TRANSACTION HISTORY IMPLEMENTATION
// Based on proven patterns from successful crypto wallets

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View, Text, ActivityIndicator, FlatList, StyleSheet, Linking,
  TouchableOpacity, RefreshControl, Platform, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect } from "@react-navigation/native";
import * as Localization from "expo-localization";
import Constants from "expo-constants";

import { useWalletStore } from "../store/useWalletStore";
import { CHAINS } from "../config/chainRegistry";
import { covalentGet } from "../lib/covalent";
import { TransactionRecord } from "../services/TransactionStorageService";
import { useTransactions, useTransactionStore } from "../store/useTransactionStore";
import { useAssets } from "../hooks/useAssets";

// ===== TYPES =====
interface TransactionItem {
  id: string;
  type: 'BUY' | 'SELL' | 'SEND' | 'RECEIVE';
  timestamp: number;
  date: string;
  time: string;
  tokenName: string;
  tokenAmount: string;
  currencyAmount: string;
  currencySymbol: string;
  transactionHash: string;
  chainId: number;
  networkName: string;
  fromAddress?: string;
  toAddress?: string;
  fee?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  orderId?: string; // For BUY/SELL transactions
  tokenSymbol?: string; // For BUY/SELL transactions
  usdAmount?: string; // For SEND transactions (stored separately)
}

// ===== UTILITY FUNCTIONS =====
const shortenAddress = (address: string) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const getTransactionIcon = (type: string) => {
  switch (type) {
    case 'SEND': return 'arrow-up-circle';
    case 'RECEIVE': return 'arrow-down-circle';
    case 'BUY': return 'add-circle';
    case 'SELL': return 'remove-circle';
    default: return 'help-circle';
  }
};

const getExplorerUrl = (hash: string, chainId: number) => {
  const chain = CHAINS.find(c => c.chainId === chainId);
  if (!chain) return `https://etherscan.io/tx/${hash}`;
  return `${chain.explorerBase}/tx/${hash}`;
};

const formatAmount = (amount: string, displayUnit: string, currencySymbol: string, tokenName: string, priceMap?: any, storedCurrencyAmount?: string | { currencyAmount: string; usdAmount?: string; currencySymbol?: string }, storedCurrencySymbol?: string) => {
  // CRITICAL: For empty amounts, show "Pending..." instead of "0"
  if (!amount || amount.trim() === '' || amount === 'NaN' || isNaN(parseFloat(amount))) {
    return 'Pending...'; // Show "Pending..." instead of "0" for empty/invalid amounts
  }
  
  if (displayUnit === 'TOKEN') {
    // Limit decimal places for TOKEN display to prevent wrapping
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) return `0 ${tokenName}`;
    const formattedAmount = numericAmount.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
    return `${formattedAmount} ${tokenName}`;
  }
  
  // CRITICAL: For USD and LOCAL display units, prefer stored currencyAmount (recorded at time of transaction)
  // This ensures SEND transactions show the correct currency amount at time of transaction
  // CRITICAL: For SEND/RECEIVE transactions, use stored currency amounts
  // For BUY/SELL transactions, calculate from token amount * price
  if (displayUnit === 'USD') {
    // CRITICAL FIX: For SEND/RECEIVE transactions, currencyAmount IS the USD amount (stored at time of transaction)
    // SendTab stores currencyAmount as the USD value (from usdAmount variable)
    // Check storedCurrencyAmount first - it's already the USD amount for SEND transactions
    // NOTE: For SEND transactions, currencySymbol might be local currency code, but currencyAmount is USD
    if (storedCurrencyAmount && typeof storedCurrencyAmount === 'string' && storedCurrencyAmount !== '0' && storedCurrencyAmount.trim() !== '') {
      const storedAmount = parseFloat(storedCurrencyAmount);
      if (!isNaN(storedAmount) && storedAmount > 0) {
        // CRITICAL: For SEND transactions, currencyAmount IS the USD amount (stored from SendTab)
        // Even though currencySymbol might be local currency (e.g., 'GBP'), currencyAmount is USD
        // For BUY/SELL, currencyAmount matches currencySymbol (both are fiat currency)
        // So if currencySymbol is NOT USD, it's likely a SEND transaction where currencyAmount is USD
        // For BUY/SELL, currencySymbol should be the same as currencyAmount currency
        if (storedCurrencySymbol && (storedCurrencySymbol === 'USD' || storedCurrencySymbol === '$')) {
          // BUY/SELL with USD - use directly
          return `$${storedAmount.toFixed(2)}`;
        } else if (storedCurrencySymbol && storedCurrencySymbol !== 'USD' && storedCurrencySymbol !== '$') {
          // SEND transaction - currencyAmount is USD (stored from SendTab), currencySymbol is local currency
          // Use currencyAmount as USD for USD toggle
          return `$${storedAmount.toFixed(2)}`;
        }
      }
    }
    
    // CRITICAL: Also check for object format (future-proofing)
    if (storedCurrencyAmount && typeof storedCurrencyAmount === 'object' && 'usdAmount' in storedCurrencyAmount) {
      const txUsdAmount = storedCurrencyAmount.usdAmount;
      if (txUsdAmount && txUsdAmount !== '0' && typeof txUsdAmount === 'string' && txUsdAmount.trim() !== '') {
        const storedUsd = parseFloat(txUsdAmount);
        if (!isNaN(storedUsd) && storedUsd > 0) {
          return `$${storedUsd.toFixed(2)}`;
        }
      }
    }
    
    // Calculate USD value from token amount * price (for all transaction types if stored amount not available)
    const numericAmount = parseFloat(amount);
    if (!isNaN(numericAmount) && numericAmount > 0) {
      // CRITICAL: Always calculate from priceMap if available (most accurate)
      if (priceMap && priceMap[tokenName]) {
        const usdPrice = priceMap[tokenName].usd || 0;
        if (usdPrice > 0) {
          const usdValue = numericAmount * usdPrice;
          return `$${usdValue.toFixed(2)}`;
        }
      }
    }
    return `$0.00`;
  }
  
  if (displayUnit === 'LOCAL') {
    // CRITICAL FIX: For SEND/RECEIVE transactions, use stored local currency amount if available
    // This ensures the currency amount recorded at transaction time is displayed
    if (storedCurrencyAmount) {
      let localAmount: string | undefined;
      let localSymbol: string | undefined = storedCurrencySymbol;
      
      if (typeof storedCurrencyAmount === 'object' && 'currencyAmount' in storedCurrencyAmount) {
        // Object format: use currencyAmount (local currency) and currencySymbol
        localAmount = storedCurrencyAmount.currencyAmount;
        localSymbol = storedCurrencyAmount.currencySymbol || storedCurrencySymbol;
      } else if (typeof storedCurrencyAmount === 'string') {
        // String format: use directly
        localAmount = storedCurrencyAmount;
      }
      
      if (localAmount && localAmount !== '0' && localAmount.trim() !== '' && localSymbol) {
        // Check if storedCurrencySymbol is NOT USD (indicates local currency was stored)
        if (localSymbol !== 'USD' && localSymbol !== '$') {
          const numericAmount = parseFloat(localAmount);
          if (!isNaN(numericAmount) && numericAmount > 0) {
            return `${localSymbol}${numericAmount.toFixed(2)}`;
          }
        }
      }
    }
    
    // Otherwise, calculate from token amount * price (for BUY/SELL or if stored amount not available)
    const numericAmount = parseFloat(amount);
    if (!isNaN(numericAmount) && numericAmount > 0) {
      if (priceMap && priceMap[tokenName]) {
        const localPrice = priceMap[tokenName].local || 0;
        if (localPrice > 0) {
          const localValue = numericAmount * localPrice;
          return `${currencySymbol}${localValue.toFixed(2)}`;
        }
      }
    }
    return `${currencySymbol}0.00`;
  }
  
  // ONLY use real-time prices - NO fallback rates
  if (!priceMap || !priceMap[tokenName]) {
    // If amount is valid, show it even without price data
    const numericAmount = parseFloat(amount);
    if (!isNaN(numericAmount)) {
      return `${numericAmount.toFixed(6)} ${tokenName}`;
    }
    return `0 ${tokenName}`;
  }
  
  const usdPrice = priceMap[tokenName].usd || 0;
  const localPrice = priceMap[tokenName].local || 0;
  
  if (usdPrice === 0 && localPrice === 0) {
    // If amount is valid, show it even without price data
    const numericAmount = parseFloat(amount);
    if (!isNaN(numericAmount)) {
      return `${numericAmount.toFixed(6)} ${tokenName}`;
    }
    return `0 ${tokenName}`;
  }
  
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount)) {
    return '—';
  }
  
  if (displayUnit === 'USD') {
    const usdValue = numericAmount * usdPrice;
    return `$${usdValue.toFixed(2)}`;
  } else if (displayUnit === 'LOCAL') {
    const localValue = numericAmount * localPrice;
    return `${currencySymbol}$${localValue.toFixed(2)}`;
  }
  
  return `${numericAmount.toFixed(6)} ${tokenName}`;
};

// ===== MAIN COMPONENT =====
export default function StableHistoryTab() {
  const { address } = useWalletStore();
  const locale = Localization.getLocales()[0] || { currencyCode: "USD" };
  const localCurrency = (locale.currencyCode || "USD").toUpperCase();
  
  // Real-time price state
  const [priceMap, setPriceMap] = useState<Record<string, { usd: number; local: number }>>({});
  
  // Load real-time prices - CRITICAL: Load prices for ALL tokens that appear in transactions
  useEffect(() => {
    const loadPrices = async () => {
      try {
        const { loadCgPrices } = await import('../hooks/useAssets');
        // CRITICAL: Load prices for common tokens PLUS any tokens found in transactions
        const baseSymbols = ['ETH', 'MATIC', 'BNB', 'USDC', 'USDT', 'DAI', 'BTC', 'SOL', 'XRP', 'ADA', 'TRX', 'XLM', 'DOGE', 'LTC', 'BCH', 'ATOM', 'DOT'];
        
        // Get unique tokens from stored transactions
        const transactionStore = useTransactionStore.getState();
        const normalizedAddress = address?.toLowerCase() || '';
        await transactionStore.loadTransactions(normalizedAddress);
        const allTransactions = transactionStore.getTransactions(normalizedAddress) || [];
        
        // Extract unique token symbols from transactions
        const transactionTokens = new Set<string>();
        allTransactions.forEach(tx => {
          const tokenSymbol = (tx as any).tokenSymbol || tx.tokenName || '';
          if (tokenSymbol && tokenSymbol !== 'UNKNOWN' && tokenSymbol !== 'Unknown Token') {
            // Clean token name (remove " on Polygon · Amoy" etc.)
            const cleanSymbol = tokenSymbol.replace(/\s+on\s+.*$/i, '').toUpperCase().trim();
            if (cleanSymbol) {
              transactionTokens.add(cleanSymbol);
            }
          }
        });
        
        // Combine base symbols with transaction tokens
        const allSymbols = Array.from(new Set([...baseSymbols, ...Array.from(transactionTokens)]));
        const prices = await loadCgPrices(allSymbols, localCurrency);
        setPriceMap(prices);
        console.log('StableHistoryTab: Real-time price data loaded for', allSymbols.length, 'tokens:', Object.keys(prices));
      } catch (error) {
        console.error('StableHistoryTab: Error loading prices:', error);
        setPriceMap({});
      }
    };
    
    loadPrices();
  }, [localCurrency, address]);
  
  // State
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [displayUnit, setDisplayUnit] = useState<"TOKEN" | "USD" | "LOCAL">("TOKEN");
  const [filterType, setFilterType] = useState<"ALL" | "BUY" | "SELL" | "SEND" | "RECEIVE" | "RECENT">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localCurrencyRef = useRef(localCurrency);
  const isFetchingRef = useRef(false);
  const hasInitialFetch = useRef(false);
  const fetchTransactionsRef = useRef<((showLoading?: boolean) => Promise<void>) | null>(null);
  const processedTransactionIdsRef = useRef<{ idString: string }>({ idString: '' });

  useEffect(() => {
    localCurrencyRef.current = localCurrency;
  }, [localCurrency]);
  
  // CRITICAL: Use TransactionStore as single source of truth (reactive, auto-updates)
  // Note: 'RECENT' filter is handled locally, not passed to store filter
  const storeFilter = filterType !== 'ALL' && filterType !== 'RECENT' ? { type: filterType as 'BUY' | 'SELL' | 'SEND' | 'RECEIVE' } : undefined;
  
  // CRITICAL: Stabilize filter object to prevent unnecessary re-renders
  const stableFilter = React.useMemo(() => storeFilter, [storeFilter?.type]);
  
  // CRITICAL: Use direct store access with memoization to prevent getSnapshot loops
  // Instead of reactive hook, use direct access with manual subscription
  const [storedTransactionsState, setStoredTransactionsState] = React.useState<TransactionRecord[]>([]);
  
  // CRITICAL: Load transactions once and update manually (non-reactive)
  React.useEffect(() => {
    if (!address) {
      setStoredTransactionsState([]);
      return;
    }
    
    const transactionStore = useTransactionStore.getState();
    const normalizedAddress = address.toLowerCase();
    
    // CRITICAL: Load transactions from storage - show ALL transactions, not filtered
    // Filtering will be done in the display logic, but we need all stored transactions here
    transactionStore.loadTransactions(normalizedAddress).then(() => {
      // CRITICAL: Get ALL transactions first (no filter) to ensure we have them
      const allTxs = transactionStore.getTransactions(normalizedAddress) || [];
      console.log(`StableHistoryTab: useEffect loaded ${allTxs.length} total stored transactions (no filter)`);
      
      // Then apply filter if needed
      const txs = stableFilter ? allTxs.filter(tx => tx.type === stableFilter.type) : allTxs;
      console.log(`StableHistoryTab: After filter (${stableFilter?.type || 'none'}): ${txs.length} transactions`);
      setStoredTransactionsState(txs);
    }).catch(err => {
      console.error('StableHistoryTab: Error loading transactions:', err);
      setStoredTransactionsState([]);
    });
    
    // Subscribe to updates via manual listener (not Zustand's reactive subscribe)
    // CRITICAL: Use TransactionStore's manual subscription to prevent getSnapshot loops
    const unsubscribe = transactionStore.subscribe((walletAddress: string) => {
      // Only update if this subscription is for our address
      if (walletAddress.toLowerCase() === normalizedAddress) {
        // CRITICAL FIX: Always reload ALL transactions from store instead of merging
        // This ensures we never lose old transactions and always have the complete set
        // The store is the single source of truth - reload it completely
        transactionStore.loadTransactions(normalizedAddress).then(() => {
          const allTxs = transactionStore.getTransactions(normalizedAddress) || [];
          console.log(`StableHistoryTab: Subscription update - reloaded ${allTxs.length} total transactions from store`);
          
          // Apply filter if needed
          const txs = stableFilter ? allTxs.filter(tx => tx.type === stableFilter.type) : allTxs;
          console.log(`StableHistoryTab: After filter (${stableFilter?.type || 'none'}): ${txs.length} transactions`);
          setStoredTransactionsState(txs);
        }).catch(err => {
          console.error('StableHistoryTab: Error reloading transactions on subscription:', err);
        });
      }
    });
    
    return unsubscribe;
  }, [address, stableFilter?.type]);
  
  const storedTransactions = storedTransactionsState;
  
  // CRITICAL: Process transactions from store into display format
  // This converts TransactionRecord[] from TransactionStore into TransactionItem[] for display
  const processStoredTransactions = useCallback((rawTransactions: TransactionRecord[]) => {
    try {
      // TransactionStore already handles retry for incomplete transactions
      // No need to manually retry here - store does it automatically
      
      console.log('StableHistoryTab: Processing', rawTransactions.length, 'transactions from TransactionStore');
      
      // CRITICAL: Show stored transactions immediately to prevent spinner lock
      if (rawTransactions.length > 0) {
        // Convert TransactionRecord to TransactionItem format for display with proper validation
        const transactionItems: TransactionItem[] = rawTransactions.map(tx => {
          let actualChainId = tx.chainId;
          let networkName = tx.networkName;
          
          // CRITICAL FIX: Do NOT default to Sepolia - this causes incorrect network display
          // If chainId is 0, it might be a non-EVM chain (Bitcoin, XRP, etc.)
          // Only try to resolve if we have a networkName hint
          if (tx.chainId === 0 && tx.networkName && tx.networkName.trim() !== '' && tx.networkName !== 'Unknown Network') {
            const chain = CHAINS.find(c => c.name === tx.networkName || c.shortName === tx.networkName);
            if (chain) {
              actualChainId = chain.chainId;
              networkName = chain.name;
            } else {
              // Non-EVM chain - keep chainId as 0 and use networkName as-is
              actualChainId = 0;
              networkName = tx.networkName;
            }
          } else if (tx.chainId === 0 && (!tx.networkName || tx.networkName.trim() === '' || tx.networkName === 'Unknown Network')) {
            // CRITICAL: Do NOT default to Sepolia - keep as 0 and "Unknown Network"
            // This allows API retry to fix it with correct network
            actualChainId = 0;
            networkName = tx.networkName || 'Unknown Network';
          }
          
          // CRITICAL: If networkName is "Sepolia" but this is a non-EVM token, try to fix it
          if (networkName === 'Sepolia' && tx.chainId === 0) {
            // This is likely a non-EVM token misidentified as Sepolia
            // Check tokenSymbol to infer correct network
            const tokenSymbol = ((tx as any).tokenSymbol || tx.tokenName || '').toUpperCase();
            if (tokenSymbol === 'BTC') {
              networkName = 'Bitcoin';
              actualChainId = 0;
            } else if (tokenSymbol === 'XRP') {
              networkName = 'Ripple';
              actualChainId = 0;
            } else if (tokenSymbol === 'SOL') {
              networkName = 'Solana';
              actualChainId = 0;
            } else if (tokenSymbol === 'ADA') {
              networkName = 'Cardano';
              actualChainId = 0;
            }
            // Add more non-EVM tokens as needed
          }
          
          // CRITICAL: For BUY/SELL transactions, preserve empty tokenAmount - it will be updated via API
          // Only validate for non-BUY/SELL transactions
          let tokenAmount = tx.tokenAmount || '';
          if (tx.type !== 'BUY' && tx.type !== 'SELL') {
            if (!tokenAmount || tokenAmount.trim() === '' || tokenAmount === 'NaN' || isNaN(parseFloat(tokenAmount))) {
              tokenAmount = '0';
            }
          } else {
            // For BUY/SELL, only validate if it's clearly invalid (not just empty)
            if (tokenAmount === 'NaN' || (tokenAmount && isNaN(parseFloat(tokenAmount)))) {
              tokenAmount = '';
            }
          }
          
          // CRITICAL: For BUY/SELL transactions, ensure we have proper token name
          let displayTokenName = tx.tokenName || '';
          if ((tx.type === 'BUY' || tx.type === 'SELL')) {
            // Try to infer from tokenSymbol if tokenName is missing
            if (!displayTokenName || displayTokenName === 'Unknown') {
              displayTokenName = (tx as any).tokenSymbol || 'Unknown Token';
            }
            // If we still don't have a name but have a symbol, use it
            if ((!displayTokenName || displayTokenName === 'Unknown Token') && (tx as any).tokenSymbol) {
              displayTokenName = (tx as any).tokenSymbol;
            }
          }
          
          // CRITICAL: For BUY/SELL, preserve currencyAmount even if empty initially
          // It may be populated later via Transak API update
          const finalCurrencyAmount = (tx.type === 'BUY' || tx.type === 'SELL') 
            ? (tx.currencyAmount || '') 
            : (tx.currencyAmount || '0');
          
          return {
            id: tx.id || `stored_${tx.transactionHash}`,
            type: tx.type,
            timestamp: tx.timestamp,
            date: tx.date,
            time: tx.time,
            tokenName: displayTokenName,
            tokenAmount: tokenAmount,
            currencyAmount: finalCurrencyAmount,
            // CRITICAL: Preserve original currencySymbol, don't default to USD for BUY/SELL
            currencySymbol: tx.currencySymbol || (tx.type === 'BUY' || tx.type === 'SELL' ? 'GBP' : 'USD'),
            // Store tokenSymbol for BUY/SELL transactions (needed for display)
            ...((tx.type === 'BUY' || tx.type === 'SELL') && (tx as any).tokenSymbol ? { tokenSymbol: (tx as any).tokenSymbol } : {}),
            transactionHash: tx.transactionHash || '',
            chainId: actualChainId,
            networkName: networkName || 'Unknown Network',
            fromAddress: tx.fromAddress,
            toAddress: tx.toAddress,
            fee: tx.fee,
            status: tx.status || 'COMPLETED',
          };
        });
        
        // Show stored transactions immediately (will be updated with API data in background)
        setTransactions(transactionItems);
        setIsLoading(false);
      }
      
    } catch (error) {
      console.error('StableHistoryTab: Error processing stored transactions:', error);
    }
  }, []);
  
  // CRITICAL: Fetch blockchain transactions and combine with stored transactions
  const fetchTransactions = useCallback(async (showLoading = true) => {
    if (!address) {
      setError("No wallet address found");
      setIsLoading(false);
      return;
    }

    if (isFetchingRef.current) {
      console.log('StableHistoryTab: ⏭️ Skipping fetch - already in progress');
      return;
    }
    isFetchingRef.current = true;

    if (showLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      console.log('StableHistoryTab: Fetching blockchain transactions (SEND/RECEIVE) for address:', address);
      
      // Fetch from APIs in parallel (background)
      // CRITICAL: Check ALL chains - users may have purchased tokens on any chain
      // Only skip Polygon Amoy (80002) as it's testnet and has unreliable APIs
      // All other chains are checked to ensure purchased tokens appear
      const currentLocalCurrency = localCurrencyRef.current;

      const apiPromises = CHAINS.filter(chain => chain.chainId !== 80002).map(async (chain) => {
        try {
          if (chain.covalentSupported) {
            // Use Covalent API for supported chains
            // CRITICAL: Increase page size to fetch more transactions (was 50, now 100)
            // This ensures all previous transactions are captured
            const url = `https://api.covalenthq.com/v1/${chain.covalentChainId}/address/${address.toLowerCase()}/transactions_v3/?no-logs=true&page-size=100`;
            console.log(`StableHistoryTab: Fetching from Covalent URL: ${url}`);
            const response = await covalentGet(url);
            console.log(`StableHistoryTab: Covalent response for ${chain.name}:`, response);
            
            if (response.data?.items && Array.isArray(response.data.items)) {
              console.log(`StableHistoryTab: Covalent found ${response.data.items.length} transactions for ${chain.name}`);
              
              const chainTransactions = response.data.items.map((tx: any) => {
                const isFromAddress = tx.from_address?.toLowerCase() === address.toLowerCase();
                const isToAddress = tx.to_address?.toLowerCase() === address.toLowerCase();
                
                // Debug: Log chain information
                console.log(`StableHistoryTab: Chain debug - name: "${chain.name}", chainId: ${chain.chainId}`);
                console.log(`StableHistoryTab: Transaction debug - block_signed_at: "${tx.block_signed_at}", tx_hash: ${tx.tx_hash}`);
                
                // Enhanced transaction type detection with detailed logging
                let txType: 'SEND' | 'RECEIVE' | 'BUY' | 'SELL' = 'SEND';
                if (isToAddress && !isFromAddress) {
                  // Someone sent TO your address = you RECEIVED
                  txType = 'RECEIVE';
                  console.log(`StableHistoryTab: ✅ RECEIVE transaction detected: ${tx.tx_hash}`, {
                    from: tx.from_address,
                    to: tx.to_address,
                    userAddress: address,
                    isFromAddress,
                    isToAddress
                  });
                } else if (isFromAddress && !isToAddress) {
                  // You sent FROM your address = you SENT
                  txType = 'SEND';
                  console.log(`StableHistoryTab: ✅ SEND transaction detected: ${tx.tx_hash}`);
                } else if (isFromAddress && isToAddress) {
                  // Self-transaction - treat as RECEIVE (you received from yourself)
                  txType = 'RECEIVE';
                  console.log(`StableHistoryTab: ✅ SELF-RECEIVE transaction detected: ${tx.tx_hash}`);
                } else {
                  console.log(`StableHistoryTab: ⚠️ UNKNOWN transaction type: ${tx.tx_hash}`, {
                    from: tx.from_address,
                    to: tx.to_address,
                    userAddress: address,
                    isFromAddress,
                    isToAddress
                  });
                }

                return {
                  id: `covalent_${tx.tx_hash}`,
                  type: txType,
                  timestamp: new Date(tx.block_signed_at).getTime(),
                  date: new Date(tx.block_signed_at).toLocaleDateString(),
                  time: new Date(tx.block_signed_at).toLocaleTimeString(),
                  tokenName: chain.nativeSymbol || 'ETH',
                  tokenAmount: tx.value ? (parseFloat(tx.value) / Math.pow(10, 18)).toFixed(6) : '0',
                  currencyAmount: '0',
                  currencySymbol: currentLocalCurrency,
                  transactionHash: tx.tx_hash,
                  chainId: chain.chainId,
                  networkName: chain.name || chain.shortName || `Chain ${chain.chainId}` || 'Unknown Network',
                  fromAddress: tx.from_address,
                  toAddress: tx.to_address,
                  fee: tx.gas_spent ? (parseFloat(tx.gas_spent) / Math.pow(10, 18)).toFixed(6) : '0',
                  status: tx.successful ? 'COMPLETED' : 'FAILED',
                };
              });
              
              return chainTransactions;
            }
          } else {
            // Use Explorer API for unsupported chains (skip Polygon Amoy - handled separately if needed)
            if (chain.chainId === 80002) {
              // Skip Polygon Amoy - too slow/unreliable
              return [];
            }
            console.log(`StableHistoryTab: Using Explorer API for ${chain.name} (chainId: ${chain.chainId})`);
            const explorerTransactions = await Promise.race([
              fetchExplorerTransactions(chain, address),
              new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 3000))
            ]);
            console.log(`StableHistoryTab: Explorer found ${explorerTransactions.length} transactions for ${chain.name}`);
            return explorerTransactions;
          }
        } catch (error) {
          console.log(`StableHistoryTab: Error fetching transactions for ${chain.name}:`, error);
          return [];
        }
        
        return [];
      });

      const apiResults = await Promise.allSettled(apiPromises);
      const apiTransactions = apiResults
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => (result as PromiseFulfilledResult<TransactionItem[]>).value);

      // 3. Combine stored (BUY/SELL) with blockchain (SEND/RECEIVE) transactions
      // CRITICAL: Get stored transactions from TransactionStore FIRST - even if API fails
      // This ensures stored BUY/SELL transactions are ALWAYS displayed
      const transactionStore = useTransactionStore.getState();
      // CRITICAL: Normalize address and load transactions from storage first
      const normalizedAddress = address.toLowerCase();
      
      // CRITICAL: Load stored transactions BEFORE processing API results
      // This ensures we always have transactions to display even if APIs fail
      console.log(`StableHistoryTab: 🔄 Loading stored transactions from TransactionStore for ${normalizedAddress}...`);
      await transactionStore.loadTransactions(normalizedAddress);
      // CRITICAL: Load ALL transactions first (no filter) to ensure we get everything
      // Then apply filter later if needed
      const allStoredTxs = transactionStore.getTransactions(normalizedAddress) || [];
      console.log(`StableHistoryTab: ✅ Loaded ${allStoredTxs.length} total stored transactions (no filter) from TransactionStore`);
      
      // Apply filter if needed (but ensure we have all transactions first)
      const storedTxs = stableFilter && stableFilter.type 
        ? allStoredTxs.filter((tx: TransactionRecord) => {
            const filterType = stableFilter.type;
            if (filterType === 'BUY' && tx.type !== 'BUY') return false;
            if (filterType === 'SELL' && tx.type !== 'SELL') return false;
            if (filterType === 'SEND' && tx.type !== 'SEND') return false;
            if (filterType === 'RECEIVE' && tx.type !== 'RECEIVE') return false;
            return true;
          })
        : allStoredTxs;
      
      console.log(`StableHistoryTab: After filter (${stableFilter || 'none'}): ${storedTxs.length} transactions`);
      
      console.log(`StableHistoryTab: ✅ Loaded ${storedTxs.length} stored transactions from TransactionStore for ${normalizedAddress}`);
      
      // CRITICAL: Log transaction breakdown for debugging
      if (storedTxs.length > 0) {
        const buyCount = storedTxs.filter(tx => tx.type === 'BUY').length;
        const sellCount = storedTxs.filter(tx => tx.type === 'SELL').length;
        const sendCount = storedTxs.filter(tx => tx.type === 'SEND').length;
        const receiveCount = storedTxs.filter(tx => tx.type === 'RECEIVE').length;
        console.log(`StableHistoryTab: Stored transaction breakdown: BUY=${buyCount}, SELL=${sellCount}, SEND=${sendCount}, RECEIVE=${receiveCount}`);
      } else {
        console.warn(`StableHistoryTab: ⚠️ No stored transactions found in TransactionStore for ${normalizedAddress}`);
        console.log(`StableHistoryTab: Checking TransactionStore state...`);
        // Try without filter to see all transactions
        const allStored = transactionStore.getTransactions(normalizedAddress);
        console.log(`StableHistoryTab: getTransactions (no filter) returned:`, allStored?.length || 0, 'transactions');
        if (allStored && allStored.length > 0) {
          console.log(`StableHistoryTab: ⚠️ Filter may be removing transactions. Filter:`, stableFilter);
        }
      }
      
      // Convert stored TransactionRecord to TransactionItem format for combining
      const storedTransactionItems: TransactionItem[] = storedTxs.map((tx: TransactionRecord) => {
        let actualChainId = tx.chainId;
        let networkName = tx.networkName;
        
        if (tx.chainId === 0 && (!tx.networkName || tx.networkName.trim() === '')) {
          actualChainId = 11155111;
          networkName = 'Sepolia';
        } else if (tx.chainId === 0 && tx.networkName && tx.networkName.trim() !== '') {
          const chain = CHAINS.find(c => c.name === tx.networkName || c.shortName === tx.networkName);
          if (chain) {
            actualChainId = chain.chainId;
            networkName = chain.name;
          }
        }
        
        let displayTokenName = tx.tokenName || '';
        if ((tx.type === 'BUY' || tx.type === 'SELL')) {
          if (!displayTokenName || displayTokenName === 'Unknown') {
            displayTokenName = (tx as any).tokenSymbol || 'Unknown Token';
          }
          if ((!displayTokenName || displayTokenName === 'Unknown Token') && (tx as any).tokenSymbol) {
            displayTokenName = (tx as any).tokenSymbol;
          }
        }
        
        // CRITICAL: Preserve orderId for BUY/SELL transactions - needed for deduplication
        const transactionItem: TransactionItem & { orderId?: string; tokenSymbol?: string } = {
          id: tx.id || `stored_${tx.transactionHash}`,
          type: tx.type,
          timestamp: tx.timestamp,
          date: tx.date,
          time: tx.time,
          tokenName: displayTokenName,
          tokenAmount: tx.tokenAmount || '',
          currencyAmount: (tx.type === 'BUY' || tx.type === 'SELL') ? (tx.currencyAmount || '') : (tx.currencyAmount || '0'),
          currencySymbol: tx.currencySymbol || (tx.type === 'BUY' || tx.type === 'SELL' ? 'GBP' : 'USD'),
          transactionHash: tx.transactionHash || '',
          chainId: actualChainId,
          networkName: networkName || 'Unknown Network',
          fromAddress: tx.fromAddress,
          toAddress: tx.toAddress,
          fee: tx.fee,
          status: tx.status || 'COMPLETED',
        };
        
        // CRITICAL: Preserve orderId and tokenSymbol for BUY/SELL transactions
        if ((tx.type === 'BUY' || tx.type === 'SELL')) {
          const orderId = (tx as any).orderId;
          const tokenSymbol = (tx as any).tokenSymbol;
          if (orderId) {
            transactionItem.orderId = orderId;
          }
          if (tokenSymbol) {
            transactionItem.tokenSymbol = tokenSymbol;
          }
        }
        
        return transactionItem;
      });
      
      // CRITICAL: Save RECEIVE transactions from blockchain API to TransactionStore
      // This ensures RECEIVE transactions appear on receiver's device
      const receiveTransactions = apiTransactions.filter(tx => tx.type === 'RECEIVE');
      if (receiveTransactions.length > 0) {
        console.log(`StableHistoryTab: Saving ${receiveTransactions.length} RECEIVE transactions to TransactionStore`);
        // CRITICAL: Use Promise.all to ensure all transactions are saved before continuing
        // forEach with async doesn't wait - this fixes the issue where RECEIVE transactions weren't being saved
        await Promise.all(receiveTransactions.map(async (tx) => {
          try {
            // Check if transaction already exists in store (prevent duplicates)
            const existingTxs = transactionStore.getTransactions(address) || [];
            const exists = existingTxs.some(existing => 
              existing.transactionHash?.toLowerCase() === tx.transactionHash?.toLowerCase()
            );
            
            if (!exists) {
              // CRITICAL: Normalize address to ensure consistent storage key
              const normalizedAddress = address.toLowerCase();
              
              const receiveTransactionData = {
                type: 'RECEIVE' as const,
                timestamp: tx.timestamp,
                date: tx.date,
                time: tx.time,
                tokenSymbol: tx.tokenName || 'Unknown',
                tokenName: tx.tokenName || 'Unknown',
                tokenAmount: tx.tokenAmount || '0',
                tokenDecimals: 18,
                currencySymbol: tx.currencySymbol || 'USD',
                currencyAmount: tx.currencyAmount || '0',
                fromAddress: tx.fromAddress || '',
                toAddress: tx.toAddress || normalizedAddress,
                transactionHash: tx.transactionHash || '',
                chainId: tx.chainId || 0,
                networkName: tx.networkName || 'Unknown',
                gasFee: tx.fee || '0',
                totalCost: tx.fee || '0',
                status: tx.status || 'COMPLETED' as const,
                reference: tx.transactionHash?.substring(0, 16) || '',
                source: 'P2P' as const,
                explorerUrl: tx.transactionHash ? `${CHAINS.find(c => c.chainId === tx.chainId)?.explorerBase || ''}/tx/${tx.transactionHash}` : '',
                walletAddress: normalizedAddress,
              };
              
              // CRITICAL: Use normalized address for storage
              await transactionStore.addTransaction(receiveTransactionData, normalizedAddress);
              console.log(`StableHistoryTab: ✅ Saved RECEIVE transaction ${tx.transactionHash} to TransactionStore for ${normalizedAddress}`);
            } else {
              console.log(`StableHistoryTab: ⏭️ RECEIVE transaction ${tx.transactionHash} already exists in TransactionStore`);
            }
          } catch (error) {
            console.error(`StableHistoryTab: Error saving RECEIVE transaction ${tx.transactionHash}:`, error);
          }
        }));
      }
      
      const allRawTransactions = [...storedTransactionItems, ...apiTransactions];
      let uniqueTransactions = allRawTransactions.reduce((acc, tx) => {
        // CRITICAL: BUY and SELL transactions may have empty transactionHash
        // Use orderId as PRIMARY deduplication key for BUY/SELL transactions
        // This ensures only ONE transaction card per purchase, even if multiple transactions share the same orderId
        const isBuyOrSell = tx.type === 'BUY' || tx.type === 'SELL';
        const txOrderId = (tx as any).orderId;
        
        // CRITICAL: For BUY/SELL transactions, check by orderId FIRST (most reliable)
        // Multiple transactions with same orderId should only show ONE card
        // CRITICAL: Same orderId should NEVER have different tokenSymbols - if it does, merge them and prefer the non-unknown one
        if (isBuyOrSell && txOrderId) {
          const existingByOrderId = acc.find(t => 
            (t.type === tx.type) && 
            ((t as any).orderId === txOrderId)
          );
          if (existingByOrderId) {
            // Transaction with same orderId already exists - merge data instead of adding duplicate
            const index = acc.findIndex(t => 
              (t.type === tx.type) && 
              ((t as any).orderId === txOrderId)
            );
            if (index !== -1) {
              // Merge: prefer transaction with more complete data
              const existing = acc[index];
              const txTokenSymbol = ((tx as any).tokenSymbol || tx.tokenName || '').toUpperCase();
              const existingTokenSymbol = ((existing as any).tokenSymbol || existing.tokenName || '').toUpperCase();
              
              // CRITICAL: If both have tokenSymbols but they're different, prefer the non-unknown/non-empty one
              // NO TOKEN PREFERENCES - all tokens are equal (USDT, BTC, ETH, etc.)
              // The Transak API is the source of truth - if API says USDT, it's USDT; if API says BTC, it's BTC
              const txIsUnknown = !txTokenSymbol || txTokenSymbol === 'UNKNOWN' || txTokenSymbol === 'UNKNOWN TOKEN';
              const existingIsUnknown = !existingTokenSymbol || existingTokenSymbol === 'UNKNOWN' || existingTokenSymbol === 'UNKNOWN TOKEN';
              
              // If tokenSymbols differ and one is unknown, prefer the known one
              // If both are known but different, prefer the one with MORE COMPLETE DATA (not token type)
              // CRITICAL: If same orderId has different tokenSymbols, prefer the one with more complete data (amount, hash, etc.)
              const hasMoreCompleteData = 
                (!txIsUnknown && existingIsUnknown) || // New has known token, existing is unknown
                (txIsUnknown && !existingIsUnknown && // New is unknown, existing is known - prefer existing
                 (tx.tokenAmount && tx.tokenAmount !== '0' && (!existing.tokenAmount || existing.tokenAmount === '0')) ||
                 (tx.transactionHash && !existing.transactionHash)) ||
                (!txIsUnknown && !existingIsUnknown && txTokenSymbol === existingTokenSymbol && // Same token, check other fields
                 ((tx.tokenAmount && tx.tokenAmount !== '0' && (!existing.tokenAmount || existing.tokenAmount === '0')) ||
                  (tx.transactionHash && !existing.transactionHash))) ||
                (!txIsUnknown && !existingIsUnknown && txTokenSymbol !== existingTokenSymbol && // Different tokens - prefer more complete data
                 ((tx.tokenAmount && tx.tokenAmount !== '0' && (!existing.tokenAmount || existing.tokenAmount === '0')) ||
                  (tx.transactionHash && !existing.transactionHash))) ||
                (txIsUnknown && existingIsUnknown && // Both unknown, prefer more complete data
                 ((tx.tokenAmount && tx.tokenAmount !== '0' && (!existing.tokenAmount || existing.tokenAmount === '0')) ||
                  (tx.transactionHash && !existing.transactionHash)));
              
              if (hasMoreCompleteData) {
                // Merge: preserve existing tokenSymbol if it's known and new one is unknown
                // CRITICAL: Always preserve orderId from existing (it should be the same, but ensure it's not lost)
                const merged: TransactionItem & { orderId?: string; tokenSymbol?: string } = { ...existing, ...tx };
                // Preserve orderId from existing (should be same, but ensure it's not overwritten)
                if ((existing as any).orderId) {
                  merged.orderId = (existing as any).orderId;
                }
                if (!txIsUnknown && existingIsUnknown) {
                  // New has known token, preserve it
                  merged.tokenName = txTokenSymbol;
                  merged.tokenSymbol = txTokenSymbol;
                } else if (txIsUnknown && !existingIsUnknown) {
                  // Existing has known token, preserve it
                  merged.tokenName = existingTokenSymbol;
                  merged.tokenSymbol = existingTokenSymbol;
                }
                acc[index] = merged;
                console.log(`StableHistoryTab: ✅ Merged duplicate transaction with orderId ${txOrderId} (existing: ${existingTokenSymbol}, new: ${txTokenSymbol}) - keeping most complete data`);
              } else {
                // CRITICAL: If tokenSymbols differ for same orderId, prefer the one with more complete data
              // If both are known tokens but different, prefer the one with transactionHash or amount
              // This handles cases where transaction was corrected (e.g., BTC -> USDT) by API
              if (txTokenSymbol !== existingTokenSymbol && !txIsUnknown && !existingIsUnknown) {
                // Both are known tokens - prefer the one with more complete data
                const txHasData = (tx.tokenAmount && tx.tokenAmount !== '0') || (tx.transactionHash && tx.transactionHash.trim() !== '');
                const existingHasData = (existing.tokenAmount && existing.tokenAmount !== '0') || (existing.transactionHash && existing.transactionHash.trim() !== '');
                
                if (txHasData && !existingHasData) {
                  // New transaction has data, existing doesn't - replace with new
                  const replaced: TransactionItem & { orderId?: string; tokenSymbol?: string } = { ...existing, ...tx };
                  if ((existing as any).orderId) {
                    replaced.orderId = (existing as any).orderId;
                  }
                  replaced.tokenName = txTokenSymbol;
                  replaced.tokenSymbol = txTokenSymbol;
                  acc[index] = replaced;
                  console.log(`StableHistoryTab: ✅ Replaced transaction with orderId ${txOrderId} (${existingTokenSymbol} -> ${txTokenSymbol}) - new has more complete data`);
                } else {
                  console.warn(`StableHistoryTab: ⚠️ Same orderId ${txOrderId} has different tokenSymbols (${existingTokenSymbol} vs ${txTokenSymbol}) - keeping existing. This indicates a TransactionStore bug.`);
                }
              } else {
                console.log(`StableHistoryTab: ⚠️ Duplicate transaction with orderId ${txOrderId} - keeping existing (more complete)`);
              }
              }
            }
            return acc; // Skip adding duplicate - CRITICAL: always skip to prevent duplicate cards
          }
        }
        
        // CRITICAL: For BUY/SELL transactions WITHOUT orderId, deduplicate by timestamp + tokenSymbol + network
        // This prevents multiple cards for the same purchase when orderId is missing
        // CRITICAL: Use wider time window (30 seconds) to catch duplicates that were created during navigation
        if (isBuyOrSell && !txOrderId) {
          const txTokenSymbol = ((tx as any).tokenSymbol || tx.tokenName || 'UNKNOWN').toUpperCase();
          const txNetworkName = tx.networkName || 'Unknown';
          // Check if there's already a transaction with same type, timestamp (within 30 seconds), tokenSymbol, and network
          // Also check if tokenSymbol is 'UNKNOWN' - merge all UNKNOWN transactions within time window
          const existingByTimestamp = acc.find(t => {
            if (t.type !== tx.type) return false;
            const timeDiff = Math.abs(t.timestamp - tx.timestamp);
            const tTokenSymbol = ((t as any).tokenSymbol || t.tokenName || 'UNKNOWN').toUpperCase();
            const tNetworkName = t.networkName || 'Unknown';
            // Same transaction if within 30 seconds (increased from 5), same token, same network
            // OR if both are UNKNOWN and within time window (likely same purchase)
            const isSameToken = tTokenSymbol === txTokenSymbol || 
                               (tTokenSymbol === 'UNKNOWN' && txTokenSymbol === 'UNKNOWN');
            return timeDiff < 30000 && isSameToken && tNetworkName === txNetworkName;
          });
          
          if (existingByTimestamp) {
            // Merge: prefer transaction with more complete data
            const index = acc.findIndex(t => {
              if (t.type !== tx.type) return false;
              const timeDiff = Math.abs(t.timestamp - tx.timestamp);
              const tTokenSymbol = ((t as any).tokenSymbol || t.tokenName || 'UNKNOWN').toUpperCase();
              const tNetworkName = t.networkName || 'Unknown';
              // Same transaction if within 30 seconds, same token, same network
              // OR if both are UNKNOWN and within time window (likely same purchase)
              const isSameToken = tTokenSymbol === txTokenSymbol || 
                                 (tTokenSymbol === 'UNKNOWN' && txTokenSymbol === 'UNKNOWN');
              return timeDiff < 30000 && isSameToken && tNetworkName === txNetworkName;
            });
            
            if (index !== -1) {
              const existing = acc[index];
              const hasMoreCompleteData = 
                (txTokenSymbol !== 'UNKNOWN' && ((existing as any).tokenSymbol || existing.tokenName || 'UNKNOWN').toUpperCase() === 'UNKNOWN') ||
                (tx.tokenAmount && tx.tokenAmount !== '0' && (!existing.tokenAmount || existing.tokenAmount === '0')) ||
                (tx.transactionHash && !existing.transactionHash) ||
                (txOrderId && !(existing as any).orderId);
              
              if (hasMoreCompleteData) {
                acc[index] = { ...existing, ...tx };
                console.log(`StableHistoryTab: ✅ Merged duplicate BUY transaction without orderId (timestamp: ${tx.timestamp}, token: ${txTokenSymbol}) - keeping most complete data`);
              } else {
                console.log(`StableHistoryTab: ⚠️ Duplicate BUY transaction without orderId (timestamp: ${tx.timestamp}, token: ${txTokenSymbol}) - keeping existing (more complete)`);
              }
            }
            return acc; // Skip adding duplicate
          }
        }
        
        const hashKey = tx.transactionHash && tx.transactionHash.trim() !== '' 
          ? tx.transactionHash.toLowerCase() 
          : null;
        const uniqueKey = hashKey 
          ? hashKey 
          : `${tx.type}_${tx.timestamp}_${tx.tokenAmount}_${tx.id || ''}`;
        
        // Find existing by hash (if available) OR by unique key for non-BUY/SELL transactions
        const existing = hashKey 
          ? acc.find(t => t.transactionHash && t.transactionHash.toLowerCase() === hashKey)
          : acc.find(t => 
              (t.type === tx.type && t.timestamp === tx.timestamp && 
               (t.tokenAmount === tx.tokenAmount || (!t.tokenAmount && !tx.tokenAmount)) &&
               (t.id === tx.id || (!t.id && !tx.id)))
            );
        
        if (!existing) {
          acc.push(tx);
        } else {
          // For BUY/SELL transactions, NEVER replace them - they are authoritative
          if (isBuyOrSell) {
            // Preserve BUY/SELL transaction, but merge complete data if available
            const index = acc.findIndex(t => 
              (hashKey && t.transactionHash && t.transactionHash.toLowerCase() === hashKey) ||
              (!hashKey && t.type === tx.type && t.timestamp === tx.timestamp && t.id === tx.id)
            );
            if (index !== -1) {
              // Only update if new data has more complete information (non-empty hash, amounts, etc.)
              const existingTx = acc[index];
              if (!existingTx.transactionHash && tx.transactionHash && tx.transactionHash.trim() !== '') {
                acc[index] = { ...existingTx, transactionHash: tx.transactionHash };
              }
              if ((!existingTx.tokenAmount || existingTx.tokenAmount === '0') && 
                  tx.tokenAmount && tx.tokenAmount !== '0') {
                acc[index] = { ...acc[index], tokenAmount: tx.tokenAmount };
              }
            }
          } else {
            // For SEND/RECEIVE, prefer the one with complete data (from/to fields)
            const hasCompleteData = tx.fromAddress && tx.fromAddress.trim() !== '' && tx.toAddress && tx.toAddress.trim() !== '';
            const existingHasCompleteData = existing.fromAddress && existing.fromAddress.trim() !== '' && existing.toAddress && existing.toAddress.trim() !== '';
            
            if (hasCompleteData && !existingHasCompleteData) {
              const index = acc.findIndex(t => 
                (hashKey && t.transactionHash && t.transactionHash.toLowerCase() === hashKey) ||
                (!hashKey && t.type === tx.type && t.timestamp === tx.timestamp)
              );
              if (index !== -1) {
                acc[index] = tx;
                console.log(`StableHistoryTab: Replacing incomplete stored transaction with complete API data for ${tx.transactionHash || tx.id}`);
              }
            }
          }
        }
        return acc;
      }, [] as TransactionItem[]);

      // 4. Sort by timestamp (most recent first)
      uniqueTransactions.sort((a, b) => b.timestamp - a.timestamp);
      
      // CRITICAL FIX: Aggressive deduplication to prevent 3-4x display
      // Step 1: Deduplicate by orderId FIRST (most reliable for BUY/SELL)
      const orderIdDeduplicationMap = new Map<string, TransactionItem>();
      const idDeduplicationMap = new Map<string, TransactionItem>(); // Track by transaction ID
      const timestampTokenMap = new Map<string, TransactionItem>(); // Track by timestamp+token for no-orderId
      
      // FIRST PASS: Deduplicate by orderId (highest priority - same orderId = same transaction)
      uniqueTransactions.forEach(tx => {
        const txOrderId = (tx as any).orderId;
        const isBuyOrSell = tx.type === 'BUY' || tx.type === 'SELL';
        
        if (isBuyOrSell && txOrderId && txOrderId.trim() !== '') {
          const existing = orderIdDeduplicationMap.get(txOrderId);
          if (existing) {
            // DUPLICATE ORDERID - merge and keep most complete
            const merged: TransactionItem & { orderId?: string; tokenSymbol?: string } = { ...existing };
            // Preserve orderId
            merged.orderId = txOrderId;
            
            // Prefer non-unknown tokenSymbol
            const txTokenSymbol = ((tx as any).tokenSymbol || tx.tokenName || '').toUpperCase();
            const existingTokenSymbol = ((existing as any).tokenSymbol || existing.tokenName || '').toUpperCase();
            
            if (txTokenSymbol && txTokenSymbol !== 'UNKNOWN' && txTokenSymbol !== 'UNKNOWN TOKEN' && txTokenSymbol !== '') {
              merged.tokenSymbol = txTokenSymbol;
              merged.tokenName = txTokenSymbol;
            } else if (existingTokenSymbol && existingTokenSymbol !== 'UNKNOWN' && existingTokenSymbol !== 'UNKNOWN TOKEN' && existingTokenSymbol !== '') {
              merged.tokenSymbol = existingTokenSymbol;
              merged.tokenName = existingTokenSymbol;
            }
            
            // Prefer non-empty amounts and hash
            if (!merged.tokenAmount || merged.tokenAmount === '0' || merged.tokenAmount.trim() === '') {
              merged.tokenAmount = tx.tokenAmount || existing.tokenAmount || '';
            }
            if (!merged.transactionHash || merged.transactionHash.trim() === '') {
              merged.transactionHash = tx.transactionHash || existing.transactionHash || '';
            }
            if (!merged.currencyAmount || merged.currencyAmount === '0' || merged.currencyAmount.trim() === '') {
              merged.currencyAmount = tx.currencyAmount || existing.currencyAmount || '';
            }
            if (!merged.networkName || merged.networkName === 'Unknown' || merged.networkName === 'Sepolia') {
              merged.networkName = tx.networkName || existing.networkName || 'Unknown';
            }
            if (!merged.chainId || merged.chainId === 11155111) {
              merged.chainId = tx.chainId || existing.chainId || 0;
            }
            
            orderIdDeduplicationMap.set(txOrderId, merged);
            console.log(`StableHistoryTab: ✅ OrderId dedup: Merged duplicate orderId ${txOrderId}`);
          } else {
            orderIdDeduplicationMap.set(txOrderId, tx);
          }
        }
      });
      
      // SECOND PASS: Process non-orderId transactions and check for duplicates by ID
      const processedOrderIds = new Set(orderIdDeduplicationMap.keys());
      uniqueTransactions.forEach(tx => {
        const txOrderId = (tx as any).orderId;
        const isBuyOrSell = tx.type === 'BUY' || tx.type === 'SELL';
        
        // Skip if already processed by orderId dedup
        if (isBuyOrSell && txOrderId && processedOrderIds.has(txOrderId)) {
          return;
        }
        
        // Check by transaction ID (most reliable)
        if (idDeduplicationMap.has(tx.id)) {
          const existing = idDeduplicationMap.get(tx.id)!;
          // Merge if new one has more complete data
          const merged = { ...existing, ...tx };
          if (txOrderId && !(existing as any).orderId) {
            merged.orderId = txOrderId;
          }
          idDeduplicationMap.set(tx.id, merged);
          console.log(`StableHistoryTab: ✅ ID dedup: Merged duplicate ID ${tx.id}`);
          return;
        }
        
        // Check by timestamp + token (for transactions without orderId)
        if (!isBuyOrSell || !txOrderId) {
          const timestampKey = `${tx.timestamp}_${((tx as any).tokenSymbol || tx.tokenName || '').toUpperCase()}_${tx.type}`;
          const existingByTimestamp = timestampTokenMap.get(timestampKey);
          
          if (existingByTimestamp) {
            // DUPLICATE BY TIMESTAMP - merge and keep most complete
            const merged: TransactionItem = { ...existingByTimestamp };
            if (!merged.tokenAmount || merged.tokenAmount === '0') {
              merged.tokenAmount = tx.tokenAmount || existingByTimestamp.tokenAmount || '';
            }
            if (!merged.transactionHash || merged.transactionHash === '') {
              merged.transactionHash = tx.transactionHash || existingByTimestamp.transactionHash || '';
            }
            timestampTokenMap.set(timestampKey, merged);
            console.log(`StableHistoryTab: ✅ Timestamp dedup: Merged duplicate timestamp ${tx.timestamp}`);
            return;
          } else {
            timestampTokenMap.set(timestampKey, tx);
          }
        }
        
        // Add to ID map
        idDeduplicationMap.set(tx.id, tx);
      });
      
      // Combine all deduplicated transactions
      const finalDeduplicated = [
        ...Array.from(orderIdDeduplicationMap.values()),
        ...Array.from(idDeduplicationMap.values()).filter(tx => {
          // Exclude transactions that were already in orderIdDeduplicationMap
          const txOrderId = (tx as any).orderId;
          return !(tx.type === 'BUY' || tx.type === 'SELL') || !txOrderId || !processedOrderIds.has(txOrderId);
        }),
        ...Array.from(timestampTokenMap.values()).filter(tx => {
          // Exclude transactions that were already in orderIdDeduplicationMap or idDeduplicationMap
          const txOrderId = (tx as any).orderId;
          const isBuyOrSell = tx.type === 'BUY' || tx.type === 'SELL';
          if (isBuyOrSell && txOrderId && processedOrderIds.has(txOrderId)) return false;
          if (idDeduplicationMap.has(tx.id)) return false;
          return true;
        })
      ];
      
      // FINAL PASS: Remove any remaining duplicates by ID (safety net)
      const finalMap = new Map<string, TransactionItem>();
      finalDeduplicated.forEach(tx => {
        if (!finalMap.has(tx.id)) {
          finalMap.set(tx.id, tx);
        } else {
          // Merge if new one has more complete data
          const existing = finalMap.get(tx.id)!;
          const merged = { ...existing, ...tx };
          if (tx.tokenAmount && (!existing.tokenAmount || existing.tokenAmount === '0')) {
            merged.tokenAmount = tx.tokenAmount;
          }
          if (tx.transactionHash && !existing.transactionHash) {
            merged.transactionHash = tx.transactionHash;
          }
          if ((tx as any).orderId && !(existing as any).orderId) {
            merged.orderId = (tx as any).orderId;
          }
          finalMap.set(tx.id, merged);
        }
      });
      
      // CRITICAL FIX: More aggressive final deduplication to prevent 4x display
      // Also check for duplicate orderIds one more time (final safety check)
      const finalOrderIdMap = new Map<string, TransactionItem>();
      const finalIdMap = new Map<string, TransactionItem>(); // Track by transaction ID
      const finalWithoutOrderId: TransactionItem[] = [];
      
      Array.from(finalMap.values()).forEach(tx => {
        const txOrderId = (tx as any).orderId;
        const isBuyOrSell = tx.type === 'BUY' || tx.type === 'SELL';
        
        // CRITICAL: Check by ID first (most reliable)
        if (finalIdMap.has(tx.id)) {
          // Duplicate ID - merge with existing
          const existing = finalIdMap.get(tx.id)!;
          const merged = { ...existing, ...tx };
          // Prefer non-unknown values
          if ((tx as any).tokenSymbol && (tx as any).tokenSymbol !== 'UNKNOWN' && (tx as any).tokenSymbol !== 'Unknown Token') {
            merged.tokenSymbol = (tx as any).tokenSymbol;
            merged.tokenName = (tx as any).tokenSymbol;
          }
          if (tx.networkName && tx.networkName !== 'Unknown Network' && tx.networkName !== 'Sepolia') {
            merged.networkName = tx.networkName;
            merged.chainId = tx.chainId;
          }
          finalIdMap.set(tx.id, merged);
          console.warn(`StableHistoryTab: ⚠️ Final check: Duplicate ID ${tx.id} - merged`);
          return; // Skip adding to orderId map
        }
        
        // Add to ID map
        finalIdMap.set(tx.id, tx);
        
        if (isBuyOrSell && txOrderId && txOrderId.trim() !== '') {
          if (finalOrderIdMap.has(txOrderId)) {
            // Should not happen, but merge if it does
            const existing = finalOrderIdMap.get(txOrderId)!;
            const merged = { ...existing, ...tx };
            // Prefer non-unknown values
            if ((tx as any).tokenSymbol && (tx as any).tokenSymbol !== 'UNKNOWN' && (tx as any).tokenSymbol !== 'Unknown Token') {
              merged.tokenSymbol = (tx as any).tokenSymbol;
              merged.tokenName = (tx as any).tokenSymbol;
            }
            if (tx.networkName && tx.networkName !== 'Unknown Network' && tx.networkName !== 'Sepolia') {
              merged.networkName = tx.networkName;
              merged.chainId = tx.chainId;
            }
            finalOrderIdMap.set(txOrderId, merged);
            console.warn(`StableHistoryTab: ⚠️ Final check: Duplicate orderId ${txOrderId} - merged`);
          } else {
            finalOrderIdMap.set(txOrderId, tx);
          }
        } else {
          finalWithoutOrderId.push(tx);
        }
      });
      
      // CRITICAL: Combine deduplicated transactions, ensuring no duplicates
      // Only include transactions that are in finalIdMap
      const orderIdTransactions = Array.from(finalOrderIdMap.values()).filter(tx => finalIdMap.has(tx.id));
      const withoutOrderIdTransactions = finalWithoutOrderId.filter(tx => finalIdMap.has(tx.id));
      
      const finalDeduplicatedComplete = [
        ...orderIdTransactions,
        ...withoutOrderIdTransactions
      ];
      
      // ONE MORE FINAL CHECK: Remove any remaining duplicates by ID
      const ultimateFinalMap = new Map<string, TransactionItem>();
      finalDeduplicatedComplete.forEach(tx => {
        if (!ultimateFinalMap.has(tx.id)) {
          ultimateFinalMap.set(tx.id, tx);
        } else {
          // Merge if duplicate found
          const existing = ultimateFinalMap.get(tx.id)!;
          const merged = { ...existing, ...tx };
          if ((tx as any).tokenSymbol && (tx as any).tokenSymbol !== 'UNKNOWN') {
            merged.tokenSymbol = (tx as any).tokenSymbol;
          }
          if (tx.networkName && tx.networkName !== 'Unknown Network') {
            merged.networkName = tx.networkName;
          }
          ultimateFinalMap.set(tx.id, merged);
          console.warn(`StableHistoryTab: ⚠️ Ultimate final check: Duplicate ID ${tx.id} - merged`);
        }
      });
      
      const finalDeduplicatedCompleteUltimate = Array.from(ultimateFinalMap.values());
      
      // 6. Show ALL transactions (remove date filtering for now)
      // TODO: Add proper date range filtering in UI instead of hardcoded cutoff
      const finalTransactions = finalDeduplicatedCompleteUltimate;
      
      console.log('StableHistoryTab: Total unique transactions (before final dedup):', uniqueTransactions.length);
      console.log('StableHistoryTab: Total unique transactions (after final dedup):', finalDeduplicatedComplete.length);
      console.log('StableHistoryTab: Showing all transactions:', finalTransactions.length);
      
      // CRITICAL: Log duplicate orderIds for debugging
      const orderIdMap = new Map<string, TransactionItem[]>();
      finalTransactions.forEach(tx => {
        const orderId = (tx as any).orderId;
        if (orderId && (tx.type === 'BUY' || tx.type === 'SELL')) {
          if (!orderIdMap.has(orderId)) {
            orderIdMap.set(orderId, []);
          }
          orderIdMap.get(orderId)!.push(tx);
        }
      });
      orderIdMap.forEach((txs, orderId) => {
        if (txs.length > 1) {
          console.error(`StableHistoryTab: ❌ DUPLICATE ORDERID DETECTED: ${orderId} appears ${txs.length} times:`, txs.map(tx => ({
            id: tx.id,
            tokenSymbol: (tx as any).tokenSymbol || tx.tokenName,
            amount: tx.tokenAmount,
            hash: tx.transactionHash
          })));
        }
      });
      
      // Log all transactions for debugging
      if (finalTransactions.length > 0) {
        console.log('StableHistoryTab: All transaction details:', finalTransactions.map(tx => ({
          id: tx.id,
          type: tx.type,
          timestamp: tx.timestamp,
          date: new Date(tx.timestamp).toISOString(),
          hash: tx.transactionHash,
          amount: tx.tokenAmount,
          tokenName: tx.tokenName,
          orderId: (tx as any).orderId || '(none)',
          tokenSymbol: (tx as any).tokenSymbol || '(none)'
        })));
      }
      
      console.log('StableHistoryTab: Transaction breakdown:', {
        total: finalTransactions.length,
        buy: finalTransactions.filter(tx => tx.type === 'BUY').length,
        sell: finalTransactions.filter(tx => tx.type === 'SELL').length,
        send: finalTransactions.filter(tx => tx.type === 'SEND').length,
        receive: finalTransactions.filter(tx => tx.type === 'RECEIVE').length,
        sampleTransactions: finalTransactions.slice(0, 3).map(tx => ({
          id: tx.id,
          type: tx.type,
          hash: tx.transactionHash,
          from: tx.fromAddress,
          to: tx.toAddress,
          timestamp: tx.timestamp
        }))
      });
      
      // CRITICAL: Always show stored transactions if they exist, even if deduplication removed them
      // This ensures BUY/SELL transactions are always displayed even if blockchain APIs fail
      if (finalTransactions.length === 0) {
        if (storedTransactionItems.length > 0) {
          console.log(`StableHistoryTab: ⚠️ Deduplication resulted in 0 transactions, but ${storedTransactionItems.length} stored transactions exist - showing stored transactions only`);
          setTransactions(storedTransactionItems.sort((a, b) => b.timestamp - a.timestamp));
        } else if (apiTransactions.length > 0) {
          console.log(`StableHistoryTab: ⚠️ Deduplication removed all transactions, but ${apiTransactions.length} API transactions exist - showing API transactions`);
          setTransactions(apiTransactions.sort((a, b) => b.timestamp - a.timestamp));
        } else {
          console.log(`StableHistoryTab: ⚠️ No transactions found after deduplication - showing empty list`);
          setTransactions([]);
        }
      } else {
        // CRITICAL: Ensure stored transactions are included even if deduplication thinks they're duplicates
        // Check if any stored transactions are missing from finalTransactions
        const storedIds = new Set(storedTransactionItems.map(tx => tx.id));
        const finalIds = new Set(finalTransactions.map(tx => tx.id));
        const missingStored = storedTransactionItems.filter(tx => !finalIds.has(tx.id));
        
        if (missingStored.length > 0) {
          console.log(`StableHistoryTab: ⚠️ ${missingStored.length} stored transactions were removed by deduplication - adding them back`);
          // Add missing stored transactions back (they're important even if deduplication thinks they're duplicates)
          const combined = [...finalTransactions, ...missingStored];
          setTransactions(combined.sort((a, b) => b.timestamp - a.timestamp));
        } else {
          setTransactions(finalTransactions);
        }
      }

    } catch (error) {
      console.error('StableHistoryTab: Error fetching transactions:', error);
      
      // CRITICAL: On error, still try to show stored transactions if available
      const transactionStore = useTransactionStore.getState();
      const normalizedAddress = address?.toLowerCase() || '';
      if (normalizedAddress) {
        await transactionStore.loadTransactions(normalizedAddress);
        const fallbackTxs = transactionStore.getTransactions(normalizedAddress) || [];
        if (fallbackTxs.length > 0) {
          console.log(`StableHistoryTab: ⚠️ Error occurred, but found ${fallbackTxs.length} stored transactions - showing them as fallback`);
          // Convert to TransactionItem format
          const fallbackItems: TransactionItem[] = fallbackTxs.map((tx: TransactionRecord) => {
            let actualChainId = tx.chainId;
            let networkName = tx.networkName;
            
            if (tx.chainId === 0 && (!tx.networkName || tx.networkName.trim() === '')) {
              actualChainId = 11155111;
              networkName = 'Sepolia';
            } else if (tx.chainId === 0 && tx.networkName && tx.networkName.trim() !== '') {
              const chain = CHAINS.find(c => c.name === tx.networkName || c.shortName === tx.networkName);
              if (chain) {
                actualChainId = chain.chainId;
                networkName = chain.name;
              }
            }
            
            return {
              id: tx.id || `stored_${tx.transactionHash}`,
              type: tx.type,
              timestamp: tx.timestamp,
              date: tx.date,
              time: tx.time,
              tokenName: tx.tokenName || (tx as any).tokenSymbol || 'Unknown',
              tokenAmount: tx.tokenAmount || '',
              currencyAmount: tx.currencyAmount || '0',
              currencySymbol: tx.currencySymbol || 'USD',
              transactionHash: tx.transactionHash || '',
              chainId: actualChainId,
              networkName: networkName || 'Unknown Network',
              fromAddress: tx.fromAddress,
              toAddress: tx.toAddress,
              fee: tx.fee,
              status: tx.status || 'COMPLETED',
              ...((tx.type === 'BUY' || tx.type === 'SELL') && (tx as any).orderId ? { orderId: (tx as any).orderId } : {}),
              ...((tx.type === 'BUY' || tx.type === 'SELL') && (tx as any).tokenSymbol ? { tokenSymbol: (tx as any).tokenSymbol } : {}),
            };
          });
          setTransactions(fallbackItems.sort((a, b) => b.timestamp - a.timestamp));
        }
      }
      
      setError('Failed to load transaction history');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [address]);

  useEffect(() => {
    fetchTransactionsRef.current = fetchTransactions;
  }, [fetchTransactions]);

  // ===== EXPLORER API FETCHING =====
  const fetchExplorerTransactions = async (chain: any, address: string): Promise<TransactionItem[]> => {
    const extra = Constants.expoConfig?.extra || {};
    let baseUrl = '';
    let apiKey = '';
    const currentLocalCurrency = localCurrencyRef.current;

    // Configure explorer API based on chain
    if (chain.chainId === 80002) { // Polygon Amoy - Try multiple endpoints
      // Try different API endpoints for Polygon Amoy
      const polygonAmoyEndpoints = [
        "https://api-amoy.polygonscan.com/api",
        "https://amoy.polygonscan.com/api",
        "https://api.polygonscan.com/api" // Mainnet API as fallback
      ];
      
      for (const endpoint of polygonAmoyEndpoints) {
        try {
          baseUrl = endpoint;
          apiKey = extra.EXPO_PUBLIC_POLYGONSCAN_API_KEY || extra.POLYGONSCAN_API_KEY || "3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M";
          console.log(`StableHistoryTab: Trying Polygon Amoy endpoint: ${endpoint}`);
          
          const url = `${baseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${apiKey}`;
          const response = await fetch(url);
          const data = await response.json();
          
          console.log(`StableHistoryTab: API response from ${endpoint}:`, {
            status: data.status,
            message: data.message,
            resultCount: data.result?.length || 0,
            hasData: !!(data.result && Array.isArray(data.result) && data.result.length > 0),
            sampleTransaction: data.result?.[0] ? {
              hash: data.result[0].hash,
              from: data.result[0].from,
              to: data.result[0].to,
              value: data.result[0].value,
              timeStamp: data.result[0].timeStamp
            } : null,
            rawSample: data.result?.[0] || null,
            firstFewResults: data.result?.slice(0, 3) || null
          });
          
          // Process data even if status is "0" (some APIs return data with status 0)
          // Check if we have valid transaction data
          if (data.result && Array.isArray(data.result) && data.result.length > 0) {
            console.log(`StableHistoryTab: ✅ Found ${data.result.length} transactions using ${endpoint}`);
            
            // Filter out invalid transactions (some APIs return empty objects)
            const validTransactions = data.result.filter((tx: any) => 
              tx && tx.hash && tx.from && tx.to && tx.timeStamp
            );
            
            console.log(`StableHistoryTab: Valid transactions after filtering: ${validTransactions.length} out of ${data.result.length}`);
            
            if (validTransactions.length > 0) {
              return validTransactions.map((tx: any) => {
              const isFromAddress = tx.from && tx.from.toLowerCase() === address.toLowerCase();
              const isToAddress = tx.to && tx.to.toLowerCase() === address.toLowerCase();
              
              let txType: 'SEND' | 'RECEIVE' = 'SEND';
              if (isToAddress && !isFromAddress) {
                txType = 'RECEIVE';
              } else if (isFromAddress && !isToAddress) {
                txType = 'SEND';
              } else if (isFromAddress && isToAddress) {
                txType = 'RECEIVE'; // Self-transaction - treat as RECEIVE
              } else {
                // Fallback: if neither from nor to matches, check if it's a contract interaction
                // For now, default to SEND, but this might need adjustment based on the specific transaction
                txType = 'SEND';
                console.log(`StableHistoryTab: ⚠️ Unusual transaction - neither from nor to matches user address:`, {
                  hash: tx.hash,
                  from: tx.from,
                  to: tx.to,
                  userAddress: address
                });
              }

              console.log(`StableHistoryTab: Processing ${txType} transaction:`, {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value,
                isFromAddress,
                isToAddress,
                userAddress: address,
                fromMatch: tx.from?.toLowerCase(),
                toMatch: tx.to?.toLowerCase(),
                addressMatch: address.toLowerCase(),
              });

              return {
                id: `explorer_${tx.hash}`,
                type: txType,
                timestamp: parseInt(tx.timeStamp) * 1000,
                date: new Date(parseInt(tx.timeStamp) * 1000).toLocaleDateString(),
                time: new Date(parseInt(tx.timeStamp) * 1000).toLocaleTimeString(),
                tokenName: chain.nativeSymbol || 'ETH',
                tokenAmount: tx.value ? (parseFloat(tx.value) / Math.pow(10, 18)).toFixed(6) : '0',
                currencyAmount: '0',
                currencySymbol: currentLocalCurrency,
                transactionHash: tx.hash,
                chainId: chain.chainId,
                networkName: chain.name || chain.shortName || `Chain ${chain.chainId}` || 'Unknown Network',
                fromAddress: tx.from || '',
                toAddress: tx.to || '',
                fee: tx.gasUsed ? (parseFloat(tx.gasUsed) / Math.pow(10, 18)).toFixed(6) : '0',
                status: tx.isError === '0' ? 'COMPLETED' : 'FAILED',
              };
            });
            } else {
              console.log(`StableHistoryTab: ⚠️ No valid transactions found using ${endpoint}`);
            }
          } else {
            console.log(`StableHistoryTab: ⚠️ No transactions found using ${endpoint}`);
          }
        } catch (error) {
          console.log(`StableHistoryTab: ❌ Endpoint ${endpoint} failed:`, error);
          continue;
        }
      }
      
      console.log(`StableHistoryTab: ❌ All Polygon Amoy endpoints failed`);
      return [];
    } else if (chain.chainId === 11155111) { // Ethereum Sepolia
      baseUrl = "https://api-sepolia.etherscan.io/api";
      apiKey = extra.EXPO_PUBLIC_ETHERSCAN_API_KEY || extra.ETHERSCAN_API_KEY || "3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M";
    } else if (chain.chainId === 97) { // BSC Testnet
      baseUrl = "https://api-testnet.bscscan.com/api";
      apiKey = extra.EXPO_PUBLIC_BSCSCAN_API_KEY || extra.BSCSCAN_API_KEY || "3ZDGCZ3PUPRPH24CY39WBF5U2HJWJXPG6M";
    } else {
      return [];
    }

    if (!apiKey) {
      console.log(`StableHistoryTab: No API key available for ${chain.name}`);
      return [];
    }

    try {
      // Use V1 API for all chains (V2 seems broken for Polygon Amoy)
      const url = `${baseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${apiKey}`;
      
      console.log(`StableHistoryTab: Fetching from explorer: ${url}`);
      const response = await fetch(url);
      const data = await response.json();

      console.log(`StableHistoryTab: Explorer response for ${chain.name}:`, {
        status: data.status,
        message: data.message,
        resultCount: data.result?.length || data.data?.length || 0,
        fullResponse: data,
      });

      // Handle V1 API response format
      let transactions: any[] = [];
      
      if ((data.status === '1' || data.status === 1) && data.result && Array.isArray(data.result)) {
        transactions = data.result;
        console.log(`StableHistoryTab: ✅ Found ${transactions.length} transactions from ${chain.name} V1 API`);
      } else if (data.result && Array.isArray(data.result) && data.result.length > 0) {
        // Fallback: Even if status is "0", if we have data, use it
        transactions = data.result;
        console.log(`StableHistoryTab: ⚠️ Using fallback data for ${chain.name} (status: ${data.status}):`, {
          status: data.status,
          message: data.message,
          resultCount: data.result.length,
        });
      } else if (data.result && typeof data.result === 'string' && data.result.includes('deprecated')) {
        // Special case: API says deprecated but we still need to try alternative approach
        console.log(`StableHistoryTab: ⚠️ API deprecated for ${chain.name}, trying alternative approach...`);
        
        // Try a different API endpoint or method
        try {
          const altUrl = `${baseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${apiKey}`;
          console.log(`StableHistoryTab: Trying alternative URL: ${altUrl}`);
          
          const altResponse = await fetch(altUrl);
          const altData = await altResponse.json();
          
          if (altData.result && Array.isArray(altData.result) && altData.result.length > 0) {
            transactions = altData.result;
            console.log(`StableHistoryTab: ✅ Alternative approach found ${transactions.length} transactions for ${chain.name}`);
          }
        } catch (altError) {
          console.log(`StableHistoryTab: ❌ Alternative approach failed for ${chain.name}:`, altError);
        }
      }

      if (transactions.length > 0) {
        return transactions.map((tx: any) => {
          const isFromAddress = tx.from?.toLowerCase() === address.toLowerCase();
          const isToAddress = tx.to?.toLowerCase() === address.toLowerCase();
          
          // Enhanced transaction type detection with detailed logging
          let txType: 'SEND' | 'RECEIVE' = 'SEND';
          if (isToAddress && !isFromAddress) {
            // Someone sent TO your address = you RECEIVED
            txType = 'RECEIVE';
            console.log(`StableHistoryTab: ✅ EXPLORER RECEIVE transaction detected: ${tx.hash}`, {
              from: tx.from,
              to: tx.to,
              userAddress: address,
              isFromAddress,
              isToAddress
            });
          } else if (isFromAddress && !isToAddress) {
            // You sent FROM your address = you SENT
            txType = 'SEND';
            console.log(`StableHistoryTab: ✅ EXPLORER SEND transaction detected: ${tx.hash}`);
          } else if (isFromAddress && isToAddress) {
            // Self-transaction - treat as RECEIVE (you received from yourself)
            txType = 'RECEIVE';
            console.log(`StableHistoryTab: ✅ EXPLORER SELF-RECEIVE transaction detected: ${tx.hash}`);
          } else {
            console.log(`StableHistoryTab: ⚠️ EXPLORER UNKNOWN transaction type: ${tx.hash}`, {
              from: tx.from,
              to: tx.to,
              userAddress: address,
              isFromAddress,
              isToAddress
            });
          }

          console.log(`StableHistoryTab: Processing ${txType} transaction:`, {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            isFromAddress,
            isToAddress,
            userAddress: address,
            fromMatch: tx.from?.toLowerCase(),
            toMatch: tx.to?.toLowerCase(),
            addressMatch: address.toLowerCase(),
            txType,
            explanation: isToAddress && !isFromAddress ? 'RECEIVE: Someone sent TO your address' : 
                        isFromAddress && !isToAddress ? 'SEND: You sent FROM your address' :
                        isFromAddress && isToAddress ? 'SELF: You sent to yourself' : 'UNKNOWN: No match'
          });

          return {
            id: `explorer_${tx.hash}`,
            type: txType,
            timestamp: parseInt(tx.timeStamp) * 1000,
            date: new Date(parseInt(tx.timeStamp) * 1000).toLocaleDateString(),
            time: new Date(parseInt(tx.timeStamp) * 1000).toLocaleTimeString(),
            tokenName: chain.nativeSymbol || 'ETH',
            tokenAmount: tx.value ? (parseFloat(tx.value) / Math.pow(10, 18)).toFixed(6) : '0',
            currencyAmount: '0',
            currencySymbol: currentLocalCurrency,
            transactionHash: tx.hash,
            chainId: chain.chainId,
                  networkName: chain.name || chain.shortName || `Chain ${chain.chainId}` || 'Unknown Network',
            fromAddress: tx.from,
            toAddress: tx.to,
            fee: tx.gasUsed ? (parseFloat(tx.gasUsed) / Math.pow(10, 18)).toFixed(6) : '0',
            status: tx.isError === '0' ? 'COMPLETED' : 'FAILED',
          };
        });
      } else {
        console.log(`StableHistoryTab: ⚠️ Explorer API returned no transactions for ${chain.name}:`, {
          status: data.status,
          message: data.message,
        });
      }
    } catch (error) {
      console.log(`StableHistoryTab: ❌ Explorer API error for ${chain.name}:`, error);
    }

    return [];
  };

  // CRITICAL: Update transactions when store updates (reactive)
  // Use transaction IDs to detect actual changes, not array references
  const transactionIds = useMemo(() => {
    return storedTransactions.map(tx => tx.id).sort().join(',');
  }, [storedTransactions]);

  useEffect(() => {
    // CRITICAL: Only process if transaction IDs actually changed (prevent infinite loop)
    if (transactionIds === processedTransactionIdsRef.current.idString) {
      return; // No change - skip processing
    }

    if (storedTransactions && storedTransactions.length >= 0) {
      console.log('StableHistoryTab: TransactionStore updated, processing', storedTransactions.length, 'transactions');
      
      // CRITICAL: If we have stored transactions, process them immediately
      // This ensures BUY/SELL/SEND transactions show up even when blockchain API fails
      if (storedTransactions.length > 0) {
        // Update processed IDs tracker BEFORE processing (prevent race condition)
        processedTransactionIdsRef.current.idString = transactionIds;
        
        // Process stored transactions into TransactionItems
        // CRITICAL: processStoredTransactions doesn't need to be in deps - it's stable
        processStoredTransactions(storedTransactions);
      } else {
        console.log('StableHistoryTab: No stored transactions found - will rely on blockchain API');
      }
      
      setIsLoading(false);
      setIsRefreshing(false);
    }
    // CRITICAL: Only depend on transactionIds, not storedTransactions array reference
    // transactionIds already reflects all changes to storedTransactions
  }, [transactionIds]); // Removed storedTransactions from deps to prevent infinite loop

  useEffect(() => {
    if (address && !hasInitialFetch.current) {
      hasInitialFetch.current = true;
      fetchTransactions(true);
    }
  }, [address, fetchTransactions]);

  // ===== EFFECTS =====
  useFocusEffect(
    useCallback(() => {
      console.log('StableHistoryTab: Focus effect triggered');
      
      // CRITICAL: TransactionStore handles all updates automatically
      // - useTransactions hook is reactive (auto-updates when store changes)
      // - TransactionStore automatically retries incomplete transactions
      // - No polling needed - store handles retry internally
      // - No manual refresh needed - components auto-update via Zustand
      
      // Fetch blockchain transactions on focus (stored transactions come from useTransactions hook)
      if (address) {
        fetchTransactionsRef.current?.(true);
      }
    }, [address])
  );

  // ===== FILTERING =====
  const filteredTransactions = useMemo(() => {
    console.log(`StableHistoryTab: Filtering transactions - filterType: ${filterType}, total: ${transactions.length}`);
    
    // Enhanced debugging for transaction types
    const transactionBreakdown = {
      total: transactions.length,
      buy: transactions.filter(tx => tx.type === 'BUY').length,
      sell: transactions.filter(tx => tx.type === 'SELL').length,
      send: transactions.filter(tx => tx.type === 'SEND').length,
      receive: transactions.filter(tx => tx.type === 'RECEIVE').length,
    };
    console.log(`StableHistoryTab: Transaction breakdown before filtering:`, transactionBreakdown);
    
    // Log sample RECEIVE transactions for debugging
    const receiveTransactions = transactions.filter(tx => tx.type === 'RECEIVE');
    if (receiveTransactions.length > 0) {
      console.log(`StableHistoryTab: Sample RECEIVE transactions:`, receiveTransactions.slice(0, 3).map(tx => ({
        id: tx.id,
        hash: tx.transactionHash,
        from: tx.fromAddress,
        to: tx.toAddress,
        amount: tx.tokenAmount,
        tokenName: tx.tokenName,
        networkName: tx.networkName,
        chainId: tx.chainId
      })));
    } else {
      console.log(`StableHistoryTab: ⚠️ NO RECEIVE TRANSACTIONS FOUND!`);
    }
    
    if (filterType === 'ALL') {
      console.log(`StableHistoryTab: Showing all transactions: ${transactions.length}`);
      return transactions;
    }
    if (filterType === 'RECENT') {
      // Show transactions from last 30 days instead of hardcoded date
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const recent = transactions.filter(tx => tx.timestamp >= thirtyDaysAgo);
      console.log(`StableHistoryTab: Showing recent transactions (last 30 days): ${recent.length}`);
      return recent;
    }
    const filtered = transactions.filter(tx => tx.type === filterType);
    console.log(`StableHistoryTab: Filtered ${filterType} transactions: ${filtered.length}`);
    
    // Additional debugging for specific filter types
    if (filterType === 'RECEIVE') {
      console.log(`StableHistoryTab: RECEIVE filter applied - found ${filtered.length} transactions`);
      if (filtered.length === 0 && receiveTransactions.length > 0) {
        console.log(`StableHistoryTab: ⚠️ RECEIVE filter is removing all RECEIVE transactions!`);
      }
    }
    
    return filtered;
  }, [transactions, filterType]);

  // ===== HANDLERS =====
  const handleRefresh = useCallback(() => {
    fetchTransactionsRef.current?.(false);
  }, []);


  const handleTransactionPress = async (tx: TransactionItem) => {
    const url = getExplorerUrl(tx.transactionHash, tx.chainId);
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open transaction link');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open transaction link');
    }
  };

  // Handle hash link press
  const handleHashPress = async (hash: string, chainId: number) => {
    try {
      const url = getExplorerUrl(hash, chainId);
      console.log(`StableHistoryTab: Opening explorer URL: ${url}`);
      console.log(`StableHistoryTab: Hash: ${hash}, ChainId: ${chainId}`);
      
      const canOpen = await Linking.canOpenURL(url);
      console.log(`StableHistoryTab: Can open URL: ${canOpen}`);
      
      if (canOpen) {
        await Linking.openURL(url);
        console.log(`StableHistoryTab: Successfully opened URL`);
      } else {
        console.log(`StableHistoryTab: Cannot open URL, showing alert`);
        Alert.alert('Error', 'Cannot open explorer link');
      }
    } catch (error) {
      console.error('StableHistoryTab: Error opening hash link:', error);
      Alert.alert('Error', 'Failed to open transaction details');
    }
  };

  // ===== RENDER FUNCTIONS =====
  const renderTransaction = ({ item: tx }: { item: TransactionItem }) => {
    // Only log every 10th transaction to reduce spam
    if (tx.timestamp % 10 === 0) {
      console.log(`StableHistoryTab: Rendering transaction:`, {
        id: tx.id,
        type: tx.type,
        tokenName: tx.tokenName,
        amount: tx.tokenAmount,
        networkName: tx.networkName,
        hasFromAddress: !!(tx.fromAddress && tx.fromAddress.trim() !== ''),
        hasToAddress: !!(tx.toAddress && tx.toAddress.trim() !== ''),
      });
    }
    
    return (
    <TouchableOpacity
      style={styles.transactionCard}
      onPress={() => handleTransactionPress(tx)}
    >
      <View style={styles.transactionHeader}>
        <View style={styles.transactionIcon}>
          <Ionicons 
            name={getTransactionIcon(tx.type)} 
            size={24} 
            color={tx.type === 'SEND' ? '#FF6B6B' : '#4ECDC4'} 
          />
        </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionType}>{tx.type}</Text>
          <Text style={styles.transactionDate}>{tx.date} {tx.time}</Text>
        </View>
        <View style={styles.transactionAmount}>
          <Text style={styles.amountText} numberOfLines={1} ellipsizeMode="tail">
            {/* CRITICAL: For BUY/SELL, show token amount if available, otherwise show "Awaiting details..." */}
            {/* For SEND/RECEIVE, show amount without network name */}
            {(tx.type === 'BUY' || tx.type === 'SELL') && (!tx.tokenAmount || tx.tokenAmount === '' || parseFloat(tx.tokenAmount) === 0)
              ? 'Awaiting details...'
              : (tx.type === 'SEND' || tx.type === 'RECEIVE')
              ? (() => {
                  // CRITICAL: Remove network suffix from tokenName (e.g., "MATIC on Polygon · Amoy" -> "MATIC")
                  let cleanTokenName = tx.tokenName || (tx as any).tokenSymbol || 'Unknown';
                  // Remove " on " followed by network name (handles middle dots, dashes, spaces, etc.)
                  cleanTokenName = cleanTokenName.replace(/\s+on\s+.*$/i, '').trim().toUpperCase();
                  // CRITICAL: Use formatAmount to respect displayUnit toggle (TOKEN/USD/LOCAL)
                  // CRITICAL: Pass stored currencyAmount for SEND transactions (recorded at time of transaction)
                  // CRITICAL: Ensure priceMap key matches cleanTokenName (uppercase)
                  // CRITICAL: Pass usdAmount object if available (SendTab stores both USD and local)
                  const storedAmount = tx.usdAmount 
                    ? { currencyAmount: tx.currencyAmount, usdAmount: tx.usdAmount, currencySymbol: tx.currencySymbol }
                    : tx.currencyAmount;
                  return formatAmount(
                    tx.tokenAmount || '0', 
                    displayUnit, 
                    localCurrency, 
                    cleanTokenName, 
                    priceMap,
                    storedAmount, // Pass stored currencyAmount (with usdAmount if available)
                    tx.currencySymbol // Pass stored currencySymbol
                  );
                })()
              : formatAmount(
                  tx.tokenAmount || '0', 
                  displayUnit, 
                  localCurrency, 
                  tx.tokenName || (tx as any).tokenSymbol || 'Unknown', 
                  priceMap,
                  tx.currencyAmount, // Pass stored currencyAmount for BUY/SELL transactions
                  tx.currencySymbol // Pass stored currencySymbol for BUY/SELL transactions
                )
            }
          </Text>
          {displayUnit === 'TOKEN' && (
            <Text style={styles.tokenText}>
              {/* CRITICAL: For BUY/SELL, show tokenSymbol if available */}
              {(tx.type === 'BUY' || tx.type === 'SELL') && (tx as any).tokenSymbol 
                ? (tx as any).tokenSymbol 
                : tx.tokenName || 'Unknown'}
            </Text>
          )}
          {displayUnit === 'USD' && (
            <Text style={styles.tokenText}>USD</Text>
          )}
          {displayUnit === 'LOCAL' && (
            <Text style={styles.tokenText}>{localCurrency}</Text>
          )}
        </View>
      </View>
      
      <View style={styles.transactionDetails}>
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Network: </Text>
          <Text style={styles.detailValue}>
            {/* CRITICAL: Show network name if available, otherwise show "Awaiting details..." for BUY transactions */}
            {tx.networkName && tx.networkName !== 'Unknown' && tx.networkName !== ''
              ? tx.networkName
              : (tx.type === 'BUY' || tx.type === 'SELL')
                ? 'Awaiting details...'
                : 'Unknown'}
          </Text>
        </Text>
        {tx.type === 'SEND' && tx.toAddress && tx.toAddress.trim() !== '' && (
          <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>To: </Text>
            <Text style={styles.detailValue}>{shortenAddress(tx.toAddress)}</Text>
          </Text>
        )}
        {tx.type === 'RECEIVE' && tx.fromAddress && tx.fromAddress.trim() !== '' && (
          <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>From: </Text>
            <Text style={styles.detailValue}>{shortenAddress(tx.fromAddress)}</Text>
          </Text>
        )}
        {(!tx.fromAddress || tx.fromAddress.trim() === '') && (!tx.toAddress || tx.toAddress.trim() === '') && (
          <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>Address: </Text>
            <Text style={styles.detailValue}>Contract Interaction</Text>
          </Text>
        )}
        {/* CRITICAL: Show crypto amount and currency amount for BUY/SELL transactions */}
        {(tx.type === 'BUY' || tx.type === 'SELL') && (
          <>
            {/* Show crypto amount (e.g., "0.00129534 BTC") - Always show if available */}
            {(tx.tokenAmount && parseFloat(tx.tokenAmount) > 0) ? (
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Amount: </Text>
                <Text style={styles.detailValue}>
                  {tx.tokenAmount} {(tx as any).tokenSymbol || tx.tokenName || 'Unknown'}
                </Text>
              </Text>
            ) : (
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Amount: </Text>
                <Text style={[styles.detailValue, { fontStyle: 'italic', color: '#f59e0b' }]}>Awaiting details...</Text>
              </Text>
            )}
            {/* Show currency amount spent/cost (e.g., "112 GBP") */}
            <Text style={styles.detailText}>
              <Text style={styles.detailLabel}>{tx.type === 'BUY' ? 'Paid: ' : 'Received: '}</Text>
              <Text style={[styles.detailValue, (!tx.currencyAmount || parseFloat(tx.currencyAmount) === 0) && { fontStyle: 'italic', color: '#f59e0b' }]}>
                {tx.currencyAmount && parseFloat(tx.currencyAmount) > 0 
                  ? `${tx.currencySymbol || 'GBP'} ${parseFloat(tx.currencyAmount).toFixed(2)}`
                  : 'Awaiting details...'}
              </Text>
            </Text>
          </>
        )}
        {tx.fee && tx.fee !== '0' && (
          <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>Fee: </Text>
            <Text style={styles.detailValue}>{tx.fee} {tx.tokenName}</Text>
          </Text>
        )}
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Hash: </Text>
          {tx.transactionHash && tx.transactionHash.trim() !== '' ? (
            <Text 
              style={styles.hashLink} 
              onPress={() => handleHashPress(tx.transactionHash, tx.chainId)}
            >
              {shortenAddress(tx.transactionHash)}
            </Text>
          ) : (
            <Text style={[styles.detailValue, { fontStyle: 'italic', color: '#f59e0b' }]}>Awaiting details...</Text>
          )}
        </Text>
      </View>
    </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={64} color="#999" />
      <Text style={styles.emptyText}>No transactions yet</Text>
      <Text style={styles.emptySubtext}>Your transaction history will appear here</Text>
    </View>
  );

  // ===== MAIN RENDER =====
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A84FF" />
        <Text style={styles.loadingText}>Loading transaction history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Transaction History</Text>
        
        {/* Filter Picker */}
        <View style={styles.filterContainer}>
          <Picker
            selectedValue={filterType}
            onValueChange={(value) => setFilterType(value)}
            style={styles.pickerOverlay}
            mode="dropdown"
          >
            <Picker.Item label="All" value="ALL" />
            <Picker.Item label="Buy" value="BUY" />
            <Picker.Item label="Sell" value="SELL" />
            <Picker.Item label="Send" value="SEND" />
            <Picker.Item label="Receive" value="RECEIVE" />
            <Picker.Item label="Recent (30 days)" value="RECENT" />
          </Picker>
          
        </View>

        {/* Currency Toggle */}
        <View style={styles.currencyToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, displayUnit === 'TOKEN' && styles.toggleButtonActive]}
            onPress={() => setDisplayUnit('TOKEN')}
          >
            <Text style={[styles.toggleText, displayUnit === 'TOKEN' && styles.toggleTextActive]}>TOKEN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, displayUnit === 'USD' && styles.toggleButtonActive]}
            onPress={() => setDisplayUnit('USD')}
          >
            <Text style={[styles.toggleText, displayUnit === 'USD' && styles.toggleTextActive]}>USD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, displayUnit === 'LOCAL' && styles.toggleButtonActive]}
            onPress={() => setDisplayUnit('LOCAL')}
          >
            <Text style={[styles.toggleText, displayUnit === 'LOCAL' && styles.toggleTextActive]}>{localCurrency}</Text>
          </TouchableOpacity>
        </View>
        
      </View>

      {/* Transaction Count Display */}
      <View style={styles.transactionCountContainer}>
        <Text style={styles.transactionCountText}>
          Showing {filteredTransactions.length} transactions (Total: {transactions.length}, Send: {transactions.filter(tx => tx.type === 'SEND').length}, Receive: {transactions.filter(tx => tx.type === 'RECEIVE').length})
        </Text>
      </View>

      {/* Error State */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Transaction List */}
      <FlatList
        data={filteredTransactions}
        renderItem={renderTransaction}
        keyExtractor={(item, index) => {
          // CRITICAL: Use orderId as key for BUY/SELL transactions to prevent duplicates
          // Same orderId MUST map to same key to prevent React from rendering duplicates
          const orderId = (item as any).orderId;
          if ((item.type === 'BUY' || item.type === 'SELL') && orderId) {
            // CRITICAL: Use orderId as key - this ensures React won't render multiple cards for same orderId
            return `order_${orderId}_${item.type}`;
          }
          // For other transactions, use hash if available, otherwise id
          if (item.transactionHash && item.transactionHash.trim() !== '') {
            return `hash_${item.transactionHash.toLowerCase()}`;
          }
          return item.id || `tx_${index}`;
        }}
        onLayout={() => {
          // Only log on initial load
          if (filteredTransactions.length > 0) {
            console.log(`StableHistoryTab: FlatList loaded with ${filteredTransactions.length} transactions`);
          }
        }}
        onContentSizeChange={(contentWidth, contentHeight) => {
          // Only log significant changes
          if (contentHeight > 1000) {
            console.log(`StableHistoryTab: Large content loaded - height: ${contentHeight}, transactions: ${filteredTransactions.length}`);
          }
        }}
        onScrollBeginDrag={() => {
          // Reduce scroll logging
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#0A84FF']}
            tintColor="#0A84FF"
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={true}
        style={styles.flatListStyle}
        contentContainerStyle={styles.flatListContent}
      />
    </View>
  );
}

// ===== STYLES =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  headerRow: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingBottom: 4,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  pageTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#0A84FF',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  filterContainer: {
    alignSelf: 'center',
    width: '50%',
    marginBottom: 16,
  },
  pickerOverlay: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
  currencyToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  toggleButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
  },
  toggleButtonActive: {
    backgroundColor: '#0A84FF',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  transactionCountContainer: {
    backgroundColor: '#E8F4FD',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  transactionCountText: {
    fontSize: 12,
    color: '#0A84FF',
    textAlign: 'center',
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: '#FFE6E6',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    flex: 1,
  },
  retryButton: {
    backgroundColor: '#D32F2F',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  flatListStyle: {
    flex: 1,
  },
  flatListContent: {
    paddingBottom: 20,
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  transactionIcon: {
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  tokenText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  transactionDetails: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  detailText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  detailLabel: {
    fontWeight: 'bold',
    color: '#333',
  },
  detailValue: {
    fontWeight: 'normal',
    color: '#666',
  },
  hashLink: {
    fontWeight: 'normal',
    color: '#0A84FF',
    textDecorationLine: 'underline',
  },
  networkText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  networkValue: {
    fontWeight: '600',
    color: '#0A84FF',
  },
  addressText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  feeText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  hashText: {
    fontSize: 12,
    color: '#0A84FF',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});
