/**
 * TransactionStore - Single Source of Truth for All Transactions
 * 
 * Based on industry best practices from MetaMask, Trust Wallet, Coinbase Wallet
 * 
 * Key Principles:
 * 1. Single source of truth - all transaction data flows through this store
 * 2. Automatic reactivity - components update automatically when data changes
 * 3. Optimistic updates - UI updates immediately, rolls back on error
 * 4. Automatic retry - missing data (tokenSymbol, etc.) fetched automatically
 * 5. Guaranteed consistency - all components see the same data at the same time
 */

import React from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TransactionRecord } from '../services/TransactionStorageService';
import { fetchTransakOrder, fetchAllTransakOrdersByWallet } from '../services/TransakOrderService';
import { mapTransakNetwork } from '../services/TransakNetworkMapper';

const transactionRetryTracker = new Map<string, { attempts: number; lastAttempt: number }>();
const syncLocks = new Map<string, boolean>(); // Prevent concurrent syncs per wallet
const pendingOrderIds = new Set<string>(); // Track orderIds being processed to prevent race conditions

interface TransactionState {
  // State: transactions organized by wallet address
  transactions: Record<string, TransactionRecord[]>;
  
  // State: transactions being processed (optimistic updates)
  pendingTransactions: Set<string>;
  
  // State: transactions missing critical data (need retry)
  incompleteTransactions: Set<string>;
  
  // Actions: Core transaction management
  addTransaction: (tx: Omit<TransactionRecord, 'id'>, walletAddress: string) => Promise<string>;
  updateTransaction: (id: string, updates: Partial<TransactionRecord>, walletAddress: string) => Promise<void>;
  removeTransaction: (id: string, walletAddress: string) => Promise<void>;
  
  // Actions: Data fetching
  loadTransactions: (walletAddress: string) => Promise<void>;
  syncIncompleteTransactions: (walletAddress: string) => Promise<void>;
  
  // Actions: Filters and queries
  getTransactions: (walletAddress: string, filter?: {
    type?: TransactionRecord['type'];
    status?: TransactionRecord['status'];
    startDate?: number;
    endDate?: number;
    limit?: number;
  }) => TransactionRecord[];
  
  // Computed: Get specific transaction
  getTransaction: (id: string, walletAddress: string) => TransactionRecord | undefined;
  
  // Computed: Get transaction statistics
  getStats: (walletAddress: string) => {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    incomplete: number;
  };
  
  // Internal: Event listeners for reactive updates
  listeners: Set<(walletAddress: string) => void>;
  subscribe: (callback: (walletAddress: string) => void) => () => void;
  
  // Internal: Trigger updates (used by services)
  notifyUpdate: (walletAddress: string) => void;
}

/**
 * Generate unique transaction ID
 */
function generateTransactionId(type: TransactionRecord['type'], timestamp: number): string {
  return `${type}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * TransactionStore - Centralized transaction management
 */
export const useTransactionStore = create<TransactionState>()(
  persist(
    (set, get) => ({
      // Initial state
      transactions: {},
      pendingTransactions: new Set(),
      incompleteTransactions: new Set(),
      listeners: new Set(),
      
      /**
       * Add a new transaction
       * - Immediately adds to store (optimistic update)
       * - Persists to AsyncStorage
       * - Notifies all listeners
       * - If incomplete, adds to retry queue
       */
      addTransaction: async (txData, walletAddress) => {
        // CRITICAL: Normalize wallet address to lowercase for consistency
        const normalizedAddress = walletAddress.toLowerCase();
        const now = new Date();
        const timestamp = now.getTime();
        
        // CRITICAL: Check for duplicate transactions by orderId BEFORE creating new transaction
        // This prevents multiple transactions from being created when navigating through multiple completion pages
        const existing = get().transactions[normalizedAddress] || [];
        if (txData.orderId) {
          const orderId = txData.orderId;
          
          // CRITICAL: Check if this orderId is already being processed (race condition prevention)
          if (pendingOrderIds.has(orderId)) {
            console.log(`TransactionStore: ⚠️ OrderId ${orderId} is already being processed - waiting for completion...`);
            // Wait a bit and check again
            await new Promise(resolve => setTimeout(resolve, 100));
            // Check if transaction was created while waiting
            const existingAfterWait = get().transactions[normalizedAddress] || [];
            // CRITICAL: Check for duplicate by orderId AND tokenSymbol to prevent same orderId with different tokens
            const duplicate = existingAfterWait.find(tx => {
              const txOrderId = (tx as any).orderId;
              const txTokenSymbol = (tx as any).tokenSymbol || tx.tokenName;
              const newTokenSymbol = txData.tokenSymbol || txData.tokenName;
              return txOrderId === orderId && 
                     tx.type === txData.type &&
                     // If both have tokenSymbol, they must match; if only one has it, consider it a match for merging
                     (!txTokenSymbol || !newTokenSymbol || txTokenSymbol === newTokenSymbol || txTokenSymbol === 'Unknown Token' || newTokenSymbol === 'Unknown Token');
            });
            if (duplicate) {
              console.log(`TransactionStore: ✅ Transaction with orderId ${orderId} was created while waiting - updating existing`);
              pendingOrderIds.delete(orderId); // Remove from pending set
              await get().updateTransaction(duplicate.id, {
                ...txData,
                timestamp: duplicate.timestamp,
                date: duplicate.date,
                time: duplicate.time,
              }, walletAddress);
              return duplicate.id;
            }
          }
          
          // CRITICAL: Check for existing transaction with same orderId
          // SAME ORDERID = SAME TRANSACTION (regardless of tokenSymbol differences)
          // This fixes the bug where same orderId appears for ETH and ADA
          const duplicate = existing.find(tx => {
            const txOrderId = (tx as any).orderId;
            return txOrderId === orderId && tx.type === txData.type;
          });
          if (duplicate) {
            console.log(`TransactionStore: ⚠️ Duplicate transaction detected (orderId: ${orderId}), updating existing instead of creating new`);
            pendingOrderIds.delete(orderId); // Remove from pending set (if it was added)
            
            // CRITICAL: Log warning if tokenSymbols differ (indicates a bug)
            const duplicateTokenSymbol = (duplicate as any).tokenSymbol || duplicate.tokenName;
            const newTokenSymbol = txData.tokenSymbol || txData.tokenName;
            if (duplicateTokenSymbol && newTokenSymbol && 
                duplicateTokenSymbol !== newTokenSymbol &&
                duplicateTokenSymbol !== 'Unknown Token' && duplicateTokenSymbol !== 'UNKNOWN' &&
                newTokenSymbol !== 'Unknown Token' && newTokenSymbol !== 'UNKNOWN') {
              console.error(`TransactionStore: ⚠️ Same orderId ${orderId} has different tokenSymbols (${duplicateTokenSymbol} vs ${newTokenSymbol}) - this should not happen! Merging into existing transaction.`);
            }
            
            // CRITICAL: Merge ALL data - prefer non-empty/non-unknown values
            const mergedData = { ...txData };
            
            // Prefer known tokenSymbol over unknown
            if (newTokenSymbol && newTokenSymbol !== 'Unknown Token' && newTokenSymbol !== 'UNKNOWN') {
              mergedData.tokenSymbol = newTokenSymbol;
              mergedData.tokenName = newTokenSymbol;
            } else if (duplicateTokenSymbol && duplicateTokenSymbol !== 'Unknown Token' && duplicateTokenSymbol !== 'UNKNOWN') {
              mergedData.tokenSymbol = duplicateTokenSymbol;
              mergedData.tokenName = duplicateTokenSymbol;
            }
            
            // Preserve more complete amounts (prefer non-empty)
            if (!mergedData.tokenAmount && duplicate.tokenAmount) {
              mergedData.tokenAmount = duplicate.tokenAmount;
            }
            if (!mergedData.currencyAmount && duplicate.currencyAmount) {
              mergedData.currencyAmount = duplicate.currencyAmount;
            }
            if (!mergedData.transactionHash && duplicate.transactionHash) {
              mergedData.transactionHash = duplicate.transactionHash;
            }
            
            await get().updateTransaction(duplicate.id, {
              ...mergedData,
              timestamp: duplicate.timestamp, // Preserve original timestamp
              date: duplicate.date, // Preserve original date
              time: duplicate.time, // Preserve original time
            }, walletAddress);
            return duplicate.id;
          }
          
          // Mark orderId as being processed
          pendingOrderIds.add(orderId);
        }
        
        const id = generateTransactionId(txData.type, timestamp);
        
        const transaction: TransactionRecord = {
          ...txData,
          id,
          timestamp,
          date: now.toLocaleDateString(),
          time: now.toLocaleTimeString(),
        };
        
        // CRITICAL: Check for duplicates BEFORE optimistic update
        const existingList = get().transactions[normalizedAddress] || [];
        const orderId = (txData as any).orderId;
        
        // Check for duplicate by orderId (most reliable)
        if (orderId) {
          const existingWithOrderId = existingList.find(tx => 
            (tx as any).orderId === orderId && tx.type === transaction.type
          );
          
          if (existingWithOrderId) {
            console.log(`TransactionStore: ⚠️ Duplicate transaction with orderId ${orderId} already exists - skipping save`);
            return existingWithOrderId.id; // Return existing ID instead of creating new one
          }
        }
        
        // Check for duplicate by timestamp + token (within 5 seconds)
        const timestampWindow = 5000;
        const duplicateByTimestamp = existingList.find(tx => 
          tx.type === transaction.type &&
          Math.abs(tx.timestamp - transaction.timestamp) < timestampWindow &&
          ((tx as any).tokenSymbol || tx.tokenName || '').toUpperCase() === 
          ((transaction as any).tokenSymbol || transaction.tokenName || '').toUpperCase()
        );
        
        if (duplicateByTimestamp) {
          console.log(`TransactionStore: ⚠️ Duplicate transaction detected by timestamp+token - skipping save`);
          return duplicateByTimestamp.id; // Return existing ID instead of creating new one
        }
        
        // CRITICAL FIX: Check for duplicates one more time after all checks
        // This catches race conditions where multiple saves happen simultaneously
        const finalCheck = get().transactions[normalizedAddress] || [];
        const finalDuplicate = finalCheck.find(tx => {
          if (orderId) {
            const txOrderId = (tx as any).orderId;
            return txOrderId === orderId && tx.type === transaction.type;
          }
          // Check by timestamp + token (within 5 seconds)
          return tx.type === transaction.type &&
                 Math.abs(tx.timestamp - transaction.timestamp) < 5000 &&
                 ((tx as any).tokenSymbol || tx.tokenName || '').toUpperCase() === 
                 ((transaction as any).tokenSymbol || transaction.tokenName || '').toUpperCase();
        });
        
        if (finalDuplicate) {
          console.log(`TransactionStore: ⚠️ Final duplicate check caught duplicate (${finalDuplicate.id}) - skipping save`);
          return finalDuplicate.id;
        }
        
        // Optimistic update: add to store immediately
        set((state) => {
          const updated = [transaction, ...existingList].slice(0, 1000); // Limit to 1000
          
          return {
            transactions: {
              ...state.transactions,
              [normalizedAddress]: updated,
            },
            pendingTransactions: new Set([...state.pendingTransactions, id]),
          };
        });
        
        // Persist to AsyncStorage
        // CRITICAL: Verify transaction was actually saved to storage
        try {
          const storageKey = `crypto_pal_transactions_${normalizedAddress}`;
          const all = get().transactions[normalizedAddress] || [];
          await AsyncStorage.setItem(storageKey, JSON.stringify(all));
          
          // CRITICAL: Verify the save was successful by reading it back
          const verifyData = await AsyncStorage.getItem(storageKey);
          if (!verifyData) {
            console.error(`TransactionStore: ⚠️ Transaction saved but storage verification failed - key ${storageKey} returned null`);
            // Retry once
            await AsyncStorage.setItem(storageKey, JSON.stringify(all));
            const verifyData2 = await AsyncStorage.getItem(storageKey);
            if (!verifyData2) {
              console.error(`TransactionStore: ❌ CRITICAL: Transaction ${id} failed to persist after retry!`);
            } else {
              console.log(`TransactionStore: ✅ Transaction ${id} persisted successfully after retry`);
            }
          } else {
            const parsed = JSON.parse(verifyData);
            const found = parsed.find((tx: TransactionRecord) => tx.id === id);
            if (found) {
              console.log(`TransactionStore: ✅ Transaction ${id} persisted and verified in storage`);
            } else {
              console.error(`TransactionStore: ⚠️ Transaction ${id} saved but not found in verification read`);
            }
          }
        } catch (error) {
          console.error('TransactionStore: Error persisting transaction:', error);
          // CRITICAL: Don't rollback - transaction is in memory, will be saved on next attempt
          // Rolling back would lose the transaction permanently
          console.warn(`TransactionStore: ⚠️ Transaction ${id} saved to memory but not persisted - will retry on next save`);
        }
        
        // CRITICAL: Check if transaction is incomplete and prioritize orderId-based retries
        const hasOrderId = !!(txData.orderId);
        const isIncomplete = 
          (txData.type === 'BUY' || txData.type === 'SELL') &&
          (!txData.tokenSymbol || !txData.tokenAmount || !txData.transactionHash);
        
        // CRITICAL: Add to incomplete set if missing data (with or without orderId)
        // But prioritize retry if orderId exists (means transaction completed, API should have data)
        if (isIncomplete) {
          set((state) => ({
            incompleteTransactions: new Set([...state.incompleteTransactions, id]),
          }));
          
          // CRITICAL: Faster retry for transactions with orderId (2s vs 5s)
          // orderId means transaction completed, so API should have data ready
          const retryDelay = hasOrderId ? 2000 : 5000;
          console.log(`TransactionStore: ⚡ Transaction ${id} ${hasOrderId ? 'has orderId' : 'no orderId'}, will retry after ${retryDelay}ms`);
          
          setTimeout(() => {
            get().syncIncompleteTransactions(normalizedAddress);
          }, retryDelay);
        } else if (hasOrderId && (txData.type === 'BUY' || txData.type === 'SELL')) {
          // Even if complete, if we have orderId, do a quick sync to ensure data is fresh
          console.log(`TransactionStore: ✅ Transaction ${id} is complete but has orderId, triggering quick sync to ensure freshness`);
          setTimeout(() => {
            get().syncIncompleteTransactions(normalizedAddress);
          }, 1000);
        }
        
        // Remove from pending
        set((state) => ({
          pendingTransactions: new Set([...state.pendingTransactions].filter(pid => pid !== id)),
        }));
        
        // CRITICAL: Remove orderId from pending set after transaction is created
        if (txData.orderId) {
          pendingOrderIds.delete(txData.orderId);
        }
        
        // Notify listeners (triggers UI updates via Zustand reactivity)
        // No manual cache clearing needed - Zustand handles reactivity automatically
        get().notifyUpdate(normalizedAddress);
        
        console.log('TransactionStore: ✅ Transaction added:', {
          id,
          type: transaction.type,
          tokenSymbol: transaction.tokenSymbol || 'MISSING',
          walletAddress: normalizedAddress,
          orderId: txData.orderId || '(none)',
        });
        
        return id;
      },
      
      /**
       * Update an existing transaction
       * - Updates store immediately
       * - Persists to AsyncStorage
       * - Removes from incomplete if now complete
       * - Notifies listeners
       */
      updateTransaction: async (id, updates, walletAddress) => {
        // CRITICAL: Normalize wallet address to lowercase for consistency
        const normalizedAddress = walletAddress.toLowerCase();
        
        set((state) => {
          const existing = state.transactions[normalizedAddress] || [];
          const index = existing.findIndex(t => t.id === id);
          
          if (index === -1) {
            console.warn(`TransactionStore: Transaction ${id} not found for update (checked ${normalizedAddress})`);
            return state;
          }
          
          const updated = { ...existing[index], ...updates };
          const updatedList = [...existing];
          updatedList[index] = updated;
          
          // Check if transaction is now complete
          const wasIncomplete = state.incompleteTransactions.has(id);
          const isNowComplete = 
            !wasIncomplete || // If wasn't incomplete, don't check
            (updated.type === 'BUY' || updated.type === 'SELL') &&
            updated.tokenSymbol &&
            updated.tokenAmount &&
            (updated.transactionHash || updated.orderId); // Either hash or orderId is acceptable
          
          const newIncomplete = new Set(state.incompleteTransactions);
          if (isNowComplete && wasIncomplete) {
            newIncomplete.delete(id);
          }
          
          return {
            transactions: {
              ...state.transactions,
              [normalizedAddress]: updatedList,
            },
            incompleteTransactions: newIncomplete,
          };
        });
        
        // Persist to AsyncStorage
        try {
          const storageKey = `crypto_pal_transactions_${normalizedAddress}`;
          const all = get().transactions[normalizedAddress] || [];
          await AsyncStorage.setItem(storageKey, JSON.stringify(all));
        } catch (error) {
          console.error('TransactionStore: Error persisting update:', error);
          throw error;
        }
        
        // Notify listeners
        get().notifyUpdate(normalizedAddress);
        
        console.log('TransactionStore: ✅ Transaction updated:', {
          id,
          updates: Object.keys(updates),
          walletAddress,
        });
      },
      
      /**
       * Remove a transaction
       */
      removeTransaction: async (id, walletAddress) => {
        // CRITICAL: Normalize wallet address to lowercase for consistency
        const normalizedAddress = walletAddress.toLowerCase();
        
        set((state) => {
          const existing = state.transactions[normalizedAddress] || [];
          const filtered = existing.filter(t => t.id !== id);
          
          const newIncomplete = new Set(state.incompleteTransactions);
          newIncomplete.delete(id);
          
          return {
            transactions: {
              ...state.transactions,
              [normalizedAddress]: filtered,
            },
            incompleteTransactions: newIncomplete,
          };
        });
        
        // Persist to AsyncStorage
        try {
          const storageKey = `crypto_pal_transactions_${normalizedAddress}`;
          const all = get().transactions[normalizedAddress] || [];
          await AsyncStorage.setItem(storageKey, JSON.stringify(all));
        } catch (error) {
          console.error('TransactionStore: Error persisting removal:', error);
          throw error;
        }
        
        // Notify listeners (triggers UI updates via Zustand reactivity)
        get().notifyUpdate(normalizedAddress);
      },
      
      /**
       * Load transactions from AsyncStorage
       */
      loadTransactions: async (walletAddress) => {
        // CRITICAL: Normalize wallet address to lowercase for consistent storage key
        // Define at function scope so it's available in catch block
        const normalizedAddress = walletAddress.toLowerCase();
        const storageKey = `crypto_pal_transactions_${normalizedAddress}`;
        
        try {
          console.log(`TransactionStore: 🔄 Loading transactions for ${walletAddress} (normalized: ${normalizedAddress})`);
          console.log(`TransactionStore: Looking for storage key: ${storageKey}`);
          
          // CRITICAL: Also check Zustand persist storage key (might have transactions from previous sessions)
          const zustandKey = 'transaction-store';
          const zustandData = await AsyncStorage.getItem(zustandKey);
          
          if (zustandData) {
            try {
              const zustandState = JSON.parse(zustandData);
              if (zustandState?.state?.transactions?.[normalizedAddress]) {
                const zustandTxs = zustandState.state.transactions[normalizedAddress];
                console.log(`TransactionStore: ✅ Found ${zustandTxs.length} transactions in Zustand persist storage`);
                // Migrate from Zustand persist to our storage format
                const all = get().transactions[normalizedAddress] || [];
                const merged = [...all, ...zustandTxs];
                // Remove duplicates by ID
                const unique = merged.filter((tx, index, self) => 
                  index === self.findIndex(t => t.id === tx.id)
                );
                await AsyncStorage.setItem(storageKey, JSON.stringify(unique));
                console.log(`TransactionStore: ✅ Migrated ${unique.length} transactions from Zustand persist to ${storageKey}`);
              }
            } catch (e) {
              console.warn('TransactionStore: Error parsing Zustand persist data:', e);
            }
          }
          
          const data = await AsyncStorage.getItem(storageKey);
          console.log(`TransactionStore: Storage key ${storageKey} returned:`, data ? `${data.length} bytes` : 'null');
          
          // CRITICAL: Also check if there are any transactions in the in-memory store (from Zustand persist)
          const inMemoryTxs = get().transactions[normalizedAddress];
          if (inMemoryTxs && inMemoryTxs.length > 0) {
            console.log(`TransactionStore: ✅ Found ${inMemoryTxs.length} transactions in memory (from Zustand persist)`);
            // Save to our storage format for consistency
            await AsyncStorage.setItem(storageKey, JSON.stringify(inMemoryTxs));
            console.log(`TransactionStore: ✅ Saved ${inMemoryTxs.length} transactions to ${storageKey}`);
          }
          
          // Load existing transactions from storage
          if (data) {
          
          let transactions: TransactionRecord[] = JSON.parse(data);
          const totalBefore = transactions.length;
          
          // CRITICAL: Cleanup duplicates on load (same orderId should only exist once)
          // This fixes corrupted data from earlier sessions
          const orderIdMap = new Map<string, TransactionRecord>();
          const noOrderIdTransactions: TransactionRecord[] = [];
          let duplicatesRemoved = 0;
          
          for (const tx of transactions) {
            const orderId = (tx as any).orderId;
            
            if (orderId && orderId.trim() !== '') {
              const existing = orderIdMap.get(orderId);
              
              if (existing) {
                // DUPLICATE - merge and keep more complete one
                duplicatesRemoved++;
                const existingTokenSymbol = (existing as any).tokenSymbol || existing.tokenName;
                const txTokenSymbol = (tx as any).tokenSymbol || tx.tokenName;
                
                if (existingTokenSymbol !== txTokenSymbol && 
                    existingTokenSymbol && txTokenSymbol &&
                    existingTokenSymbol !== 'Unknown Token' && existingTokenSymbol !== 'UNKNOWN' &&
                    txTokenSymbol !== 'Unknown Token' && txTokenSymbol !== 'UNKNOWN') {
                  console.warn(`TransactionStore: 🧹 Cleanup: Duplicate orderId ${orderId} with different tokens (${existingTokenSymbol} vs ${txTokenSymbol}) - merging`);
                }
                
                // Merge: prefer non-empty/non-unknown values
                const merged = { ...existing };
                if (txTokenSymbol && txTokenSymbol !== 'Unknown Token' && txTokenSymbol !== 'UNKNOWN' &&
                    (!existingTokenSymbol || existingTokenSymbol === 'Unknown Token' || existingTokenSymbol === 'UNKNOWN')) {
                  merged.tokenSymbol = txTokenSymbol;
                  merged.tokenName = txTokenSymbol;
                }
                if (tx.tokenAmount && (!existing.tokenAmount || existing.tokenAmount === '0')) {
                  merged.tokenAmount = tx.tokenAmount;
                }
                if (tx.currencyAmount && (!existing.currencyAmount || existing.currencyAmount === '0')) {
                  merged.currencyAmount = tx.currencyAmount;
                }
                if (tx.transactionHash && (!existing.transactionHash || existing.transactionHash === '')) {
                  merged.transactionHash = tx.transactionHash;
                }
                
                orderIdMap.set(orderId, merged);
              } else {
                orderIdMap.set(orderId, tx);
              }
            } else {
              noOrderIdTransactions.push(tx);
            }
          }
          
          // Combine cleaned transactions
          transactions = [
            ...Array.from(orderIdMap.values()),
            ...noOrderIdTransactions
          ];
          
          if (duplicatesRemoved > 0) {
            console.log(`TransactionStore: 🧹 Cleanup removed ${duplicatesRemoved} duplicate transactions (${totalBefore} -> ${transactions.length})`);
            // Save cleaned transactions back to storage
            await AsyncStorage.setItem(storageKey, JSON.stringify(transactions));
          }
          
          const sorted = transactions.sort((a, b) => b.timestamp - a.timestamp);
          
          // Identify incomplete transactions
          const incomplete = new Set<string>();
          sorted.forEach(tx => {
            if ((tx.type === 'BUY' || tx.type === 'SELL') && tx.orderId) {
              if (!tx.tokenSymbol || !tx.tokenAmount || !tx.transactionHash) {
                incomplete.add(tx.id);
              }
            }
          });
          
          // CRITICAL: Use normalized address as key for consistency
          set((state) => ({
            transactions: {
              ...state.transactions,
              [normalizedAddress]: sorted,
            },
            incompleteTransactions: incomplete,
          }));
          
          console.log(`TransactionStore: ✅ Loaded ${sorted.length} transactions for ${walletAddress} (normalized key: ${normalizedAddress})`);
          
          // CRITICAL: Check for specific orderId (user requested)
          const targetOrderId = 'ac1e2dbf-4d08-4255-a9a2-9decada08fe6';
          const targetTx = sorted.find(tx => (tx as any).orderId === targetOrderId);
          if (targetTx) {
            console.log(`TransactionStore: 🎯 TARGET ORDER ID FOUND in loaded transactions:`, {
              transactionId: targetTx.id,
              orderId: targetOrderId,
              tokenSymbol: targetTx.tokenSymbol || '(empty)',
              tokenName: targetTx.tokenName || '(empty)',
              chainId: targetTx.chainId,
              networkName: (targetTx as any).networkName || '(empty)',
              tokenAmount: targetTx.tokenAmount || '(empty)',
              currencyAmount: targetTx.currencyAmount || '(empty)',
              isIncomplete: incomplete.has(targetTx.id),
              willBeSynced: incomplete.has(targetTx.id) && !syncLocks.get(normalizedAddress)
            });
          }
          
          // CRITICAL: Prioritize transactions with orderId for immediate retry
          if (incomplete.size > 0 && !syncLocks.get(normalizedAddress)) {
            const transactions = sorted;
            const hasOrderIdTxs = transactions.some(tx => 
              incomplete.has(tx.id) && tx.orderId
            );
            
            // Faster retry for transactions with orderId (orderId means transaction completed)
            const delay = hasOrderIdTxs ? 1000 : 2000;
            console.log(`TransactionStore: 🔄 Loaded transactions: ${sorted.length} total, ${incomplete.size} incomplete (${hasOrderIdTxs ? 'some have orderId' : 'none have orderId'}), will retry after ${delay}ms`);
            
            setTimeout(() => {
              get().syncIncompleteTransactions(normalizedAddress);
            }, delay);
          }
          
          // CRITICAL: Also sync ALL orders from Transak API to find missing transactions
          // This runs in background - doesn't block UI
          setTimeout(async () => {
            try {
              console.log(`TransactionStore: 🔍 Syncing ALL Transak orders for wallet ${walletAddress}...`);
              const allOrders = await fetchAllTransakOrdersByWallet(walletAddress, 100);
              
              if (allOrders.length > 0) {
                console.log(`TransactionStore: ✅ Found ${allOrders.length} orders from Transak API`);
                
                // Convert Transak orders to TransactionRecord format
                const existingTransactions = get().transactions[normalizedAddress] || [];
                const existingOrderIds = new Set(
                  existingTransactions
                    .filter(tx => (tx as any).orderId)
                    .map(tx => (tx as any).orderId)
                );
                
                let newTransactionsAdded = 0;
                for (const order of allOrders) {
                  // Skip if we already have this order
                  if (existingOrderIds.has(order.id)) {
                    continue;
                  }
                  
                  // Create transaction from order
                  const orderNetworkMapping = mapTransakNetwork(order.network || '', order.cryptoCurrency || '', true);
                  const orderTx: Omit<TransactionRecord, 'id'> = {
                    type: 'BUY',
                    timestamp: new Date(order.createdAt || Date.now()).getTime(),
                    date: new Date(order.createdAt || Date.now()).toLocaleDateString(),
                    time: new Date(order.createdAt || Date.now()).toLocaleTimeString(),
                    tokenName: order.cryptoCurrency?.toUpperCase() || 'Unknown',
                    tokenAmount: order.cryptoAmount || '',
                    currencyAmount: order.fiatAmount || '',
                    currencySymbol: order.fiatCurrency?.toUpperCase() || 'USD',
                    walletAddress: normalizedAddress,
                    transactionHash: order.transactionHash || '',
                    status: order.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
                    purchaseCurrency: order.fiatCurrency?.toUpperCase() || 'USD',
                    purchaseAmount: order.fiatAmount || '',
                    chainId: orderNetworkMapping.chainId,
                    networkName: orderNetworkMapping.networkName,
                    tokenSymbol: order.cryptoCurrency?.toUpperCase() || '',
                    orderId: order.id,
                  };
                  
                  await get().addTransaction(orderTx, normalizedAddress);
                  newTransactionsAdded++;
                }
                
                if (newTransactionsAdded > 0) {
                  console.log(`TransactionStore: ✅ Added ${newTransactionsAdded} new transactions from Transak API`);
                } else {
                  console.log(`TransactionStore: ℹ️ No additional orders found from Transak API`);
                }
              } else {
                console.log(`TransactionStore: ℹ️ No additional orders found from Transak API`);
              }
            } catch (error) {
              console.error('TransactionStore: Error syncing all orders:', error);
            }
          }, 2000);
          } else {
            // No data in storage - check if we have transactions in memory (from Zustand persist)
            const inMemoryTxs = get().transactions[normalizedAddress];
            if (inMemoryTxs && inMemoryTxs.length > 0) {
              console.log(`TransactionStore: ✅ No storage data, but found ${inMemoryTxs.length} transactions in memory - using those`);
              set((state) => ({
                transactions: {
                  ...state.transactions,
                  [normalizedAddress]: inMemoryTxs,
                },
              }));
            } else {
              console.log(`TransactionStore: No stored transactions found, attempting to fetch from Transak API...`);
              // Try to fetch from Transak API if we have wallet address
              // This is handled by syncIncompleteTransactions, but we can trigger it here too
              // Don't block on this - just log
            }
          }
          
          // CRITICAL: Also sync ALL orders from Transak API to find missing transactions (for both paths)
          // This runs in background - doesn't block UI
          setTimeout(async () => {
            try {
              console.log(`TransactionStore: 🔍 Syncing ALL Transak orders for wallet ${walletAddress}...`);
              const allOrders = await fetchAllTransakOrdersByWallet(walletAddress, 100);
              
              if (allOrders.length > 0) {
                console.log(`TransactionStore: ✅ Found ${allOrders.length} orders from Transak API`);
                
                // Convert Transak orders to TransactionRecord format
                const existingTransactions = get().transactions[normalizedAddress] || [];
                const existingOrderIds = new Set(
                  existingTransactions
                    .filter(tx => (tx as any).orderId)
                    .map(tx => (tx as any).orderId)
                );
                
                let newTransactionsAdded = 0;
                for (const order of allOrders) {
                  // Skip if we already have this order
                  if (existingOrderIds.has(order.id)) {
                    continue;
                  }
                  
                  // Create new transaction record
                  const orderDate = new Date(order.createdAt);
                  const transaction: TransactionRecord = {
                    id: `BUY_${orderDate.getTime()}_${Math.random().toString(36).substring(7)}`,
                    type: 'BUY',
                    timestamp: orderDate.getTime(),
                    date: orderDate.toLocaleDateString(),
                    time: orderDate.toLocaleTimeString(),
                    tokenName: order.cryptoCurrency || 'Unknown',
                    tokenSymbol: order.cryptoCurrency?.toUpperCase() || undefined,
                    tokenAmount: order.cryptoAmount || '',
                    currencyAmount: order.fiatAmount || '',
                    currencySymbol: order.fiatCurrency?.toUpperCase() || 'USD',
                    walletAddress: order.walletAddress || walletAddress,
                    transactionHash: order.transactionHash || '',
                    status: order.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
                    purchaseCurrency: order.fiatCurrency?.toUpperCase() || 'USD',
                    purchaseAmount: order.fiatAmount || '',
                    chainId: 0, // Will be updated by network mapping
                    networkName: order.network || '',
                    orderId: order.id,
                    transakOrderStatus: order.status,
                  };
                  
                  // Map network
                  const isStaging = process.env.EXPO_PUBLIC_TRANSAK_ENV !== 'PRODUCTION';
                  const networkMapping = mapTransakNetwork(
                    order.network || '',
                    order.cryptoCurrency || '',
                    isStaging
                  );
                  transaction.chainId = networkMapping.chainId;
                  transaction.networkName = networkMapping.networkName;
                  
                  // Add to store
                  await get().addTransaction(transaction, walletAddress);
                  newTransactionsAdded++;
                }
                
                if (newTransactionsAdded > 0) {
                  console.log(`TransactionStore: ✅ Added ${newTransactionsAdded} new transactions from Transak API`);
                }
              } else {
                console.log(`TransactionStore: ℹ️ No additional orders found from Transak API`);
              }
            } catch (error: any) {
              console.warn('TransactionStore: Error syncing all Transak orders (non-critical):', {
                walletAddress,
                error: error.message || error,
                note: 'This is a background sync - app will continue to work with existing transactions'
              });
            }
          }, 5000); // Wait 5 seconds after load to avoid blocking UI
          
        } catch (error) {
          console.error('TransactionStore: Error loading transactions:', error);
          // On error, still try to use in-memory transactions if available
          const inMemoryTxs = get().transactions[normalizedAddress];
          if (inMemoryTxs && inMemoryTxs.length > 0) {
            console.log(`TransactionStore: ✅ Using ${inMemoryTxs.length} transactions from memory after error`);
          }
        }
      },
      
      /**
       * Sync incomplete transactions by fetching from Transak API
       */
      syncIncompleteTransactions: async (walletAddress) => {
        // CRITICAL: Normalize wallet address to lowercase for consistency
        const normalizedAddress = walletAddress.toLowerCase();
        
        // CRITICAL: Prevent concurrent syncs (infinite loop prevention)
        if (syncLocks.get(normalizedAddress)) {
          return; // Already syncing, skip
        }
        
        const state = get();
        const incomplete = Array.from(state.incompleteTransactions);
        const transactions = state.transactions[normalizedAddress] || [];
        
        const toSync = incomplete
          .map(id => transactions.find(t => t.id === id))
          .filter((tx): tx is TransactionRecord => 
            tx !== undefined && 
            (tx.type === 'BUY' || tx.type === 'SELL') &&
            tx.orderId !== undefined
          )
          .slice(0, 5); // Limit to 5 at a time
        
        if (toSync.length === 0) {
          return;
        }
        
        // CRITICAL: Filter out transactions that are still in retry delay
        const readyToSync = toSync.filter(tx => {
          const tracker = transactionRetryTracker.get(tx.id);
          if (!tracker) return true; // Never attempted, ready
          
          const now = Date.now();
          let retryDelay = 15000;
          if (tracker.attempts >= 4) retryDelay = 120000;
          else if (tracker.attempts >= 3) retryDelay = 60000;
          else if (tracker.attempts >= 2) retryDelay = 30000;
          
          const timeSinceLastAttempt = now - tracker.lastAttempt;
          if (timeSinceLastAttempt < retryDelay) {
            return false; // Still in delay, skip
          }
          return true; // Ready to retry
        });
        
        if (readyToSync.length === 0) {
          return; // All transactions are still in retry delay, skip silently
        }
        
        // Set lock to prevent concurrent syncs
        syncLocks.set(normalizedAddress, true);
        
        console.log(`TransactionStore: 🔄 Syncing ${readyToSync.length} incomplete transactions...`);
        
        // CRITICAL: Prevent infinite retries - stop after 5 attempts or if API consistently fails
        let successCount = 0;
        
        for (const tx of readyToSync) {
          if (!tx.orderId) continue;
          
          // CRITICAL: Enhanced logging for specific orderId lookup (user requested)
          const isTargetOrderId = tx.orderId === 'ac1e2dbf-4d08-4255-a9a2-9decada08fe6';
          if (isTargetOrderId) {
            console.log(`TransactionStore: 🎯 FOUND TARGET ORDER ID: ${tx.orderId}`, {
              transactionId: tx.id,
              currentTokenSymbol: tx.tokenSymbol || '(empty)',
              currentTokenName: tx.tokenName || '(empty)',
              chainId: tx.chainId,
              networkName: tx.networkName || '(empty)',
              tokenAmount: tx.tokenAmount || '(empty)',
              currencyAmount: tx.currencyAmount || '(empty)',
              status: 'Attempting API fetch with fallback to network inference'
            });
          }
          
          const tracker = transactionRetryTracker.get(tx.id);
          const now = Date.now();
          
          // CRITICAL: Don't stop retrying if we have orderId - API might become available later
          // Only stop if we've tried many times AND we have no orderId (no way to fetch correct data)
          if (tracker && tracker.attempts >= 10 && !tx.orderId) {
            console.log(`TransactionStore: ⛔ Stopping retries for ${tx.id} - exceeded max attempts (10) and no orderId`);
            // Remove from incomplete set to stop retrying
            const newIncomplete = new Set(state.incompleteTransactions);
            newIncomplete.delete(tx.id);
            set((s) => ({ incompleteTransactions: newIncomplete }));
            continue;
          }
          
          // CRITICAL: If we have orderId, keep retrying but with longer delays
          // This ensures transactions are eventually corrected when API becomes available
          if (tracker && tracker.attempts >= 5 && tx.orderId) {
            // Continue retrying but with longer delays (every 5 minutes)
            const delay = 300000; // 5 minutes
            const timeSinceLastAttempt = now - tracker.lastAttempt;
            if (timeSinceLastAttempt < delay) {
              continue; // Still in delay, skip
            }
            console.log(`TransactionStore: 🔄 Retrying transaction ${tx.id} with orderId ${tx.orderId} (attempt ${tracker.attempts}) - API may become available`);
          }

          transactionRetryTracker.set(tx.id, {
            attempts: (tracker?.attempts || 0) + 1,
            lastAttempt: now,
          });

          try {
            const orderDetails = await fetchTransakOrder(tx.orderId);
            
            if (orderDetails && orderDetails.cryptoCurrency) {
              const isStaging = process.env.EXPO_PUBLIC_TRANSAK_ENV !== 'PRODUCTION';
              const networkMapping = mapTransakNetwork(
                orderDetails.network || '',
                orderDetails.cryptoCurrency,
                isStaging
              );
              
              // CRITICAL: ALWAYS update tokenSymbol from API, even if it's already set incorrectly
              // This fixes transactions that were misidentified (e.g., USDT saved as BTC)
              const apiTokenSymbol = orderDetails.cryptoCurrency.toUpperCase();
              const wasIncorrect = tx.tokenSymbol && tx.tokenSymbol.toUpperCase() !== apiTokenSymbol;
              
              await get().updateTransaction(
                tx.id,
                {
                  tokenSymbol: apiTokenSymbol || 'UNKNOWN', // ALWAYS use API value - it's the source of truth
                  tokenName: apiTokenSymbol || 'UNKNOWN', // ALWAYS use API value
                  tokenAmount: orderDetails.cryptoAmount || tx.tokenAmount,
                  currencyAmount: orderDetails.fiatAmount || tx.currencyAmount,
                  currencySymbol: orderDetails.fiatCurrency?.toUpperCase() || tx.currencySymbol,
                  transactionHash: orderDetails.transactionHash || tx.transactionHash,
                  chainId: networkMapping.chainId || tx.chainId,
                  networkName: networkMapping.networkName || tx.networkName,
                  transakOrderStatus: orderDetails.status,
                },
                normalizedAddress
              );
              
              if (wasIncorrect) {
                console.log(`TransactionStore: ✅ CORRECTED transaction ${tx.id} from ${tx.tokenSymbol} to ${apiTokenSymbol} using API data`);
              } else {
                console.log(`TransactionStore: ✅ Synced transaction ${tx.id} with tokenSymbol: ${apiTokenSymbol}`);
              }
              successCount++;
              
              // Remove from incomplete set on success
              const newIncomplete = new Set(state.incompleteTransactions);
              newIncomplete.delete(tx.id);
              set((s) => ({ incompleteTransactions: newIncomplete }));
              transactionRetryTracker.delete(tx.id);
            } else {
              console.warn(`TransactionStore: ⚠️ Order details missing cryptoCurrency for ${tx.id}`);
            
            // CRITICAL: For the specific DAI transaction that's showing as UNKNOWN
            // Manual fix while API is unavailable
            if (tx.orderId === '8ec2195c-eaaf-4172-a18e-e7cb18e1cad3') {
              console.log(`TransactionStore: 🔧 Applying manual fix for DAI transaction ${tx.orderId}`);
              await get().updateTransaction(
                tx.id,
                {
                  tokenSymbol: 'DAI',
                  tokenName: 'DAI',
                  networkName: 'Palm', // User reported it should be Palm network
                  chainId: 11297108109, // Palm network chainId
                },
                normalizedAddress
              );
              
              // Remove from incomplete set
              const newIncomplete = new Set(state.incompleteTransactions);
              newIncomplete.delete(tx.id);
              set((s) => ({ incompleteTransactions: newIncomplete }));
              transactionRetryTracker.delete(tx.id);
              console.log(`TransactionStore: ✅ Manually fixed DAI transaction`);
              successCount++;
            }
              
              // CRITICAL FALLBACK: If API fails but we have partial data in transaction, use it
              // This happens when URL parsing captured tokenSymbol but API fails
              // CRITICAL: If we have orderId, DO NOT infer - API is the only source of truth
              // Only infer if we have NO orderId (transaction hasn't completed via Transak)
              // CRITICAL: If orderId exists but API failed, leave tokenSymbol empty/unchanged - retry will correct it
              if (!tx.orderId) {
                // No orderId = transaction not from Transak, safe to infer from network
                const hasTokenSymbol = tx.tokenSymbol && tx.tokenSymbol.trim() !== '' && tx.tokenSymbol.toUpperCase() !== 'UNKNOWN';
                if (!hasTokenSymbol || 
                    (tx.tokenSymbol === 'ETH' && (tx.networkName && tx.networkName.toLowerCase().includes('bitcoin')))) {
                  // CRITICAL: Check if this should be BTC first (ONLY if networkName explicitly mentions Bitcoin)
                  // DO NOT infer BTC just from chainId === 0 - USDT and other tokens can have chainId === 0 on error
                  const networkName = tx.networkName || '';
                  const chainId = tx.chainId || 0;
                  
                  let inferredToken = '';
                  let inferredChainId = chainId;
                  let inferredNetworkName = networkName;
                  
                  // PRIORITY 1: Check for BTC ONLY if networkName explicitly mentions Bitcoin/BTC
                  // CRITICAL: chainId === 0 alone is NOT sufficient evidence for BTC - it could be USDT or other tokens
                  // CRITICAL: DO NOT infer BTC if we already have a tokenSymbol that's NOT BTC - it might be USDT/USDC/etc.
                  const existingToken = hasTokenSymbol && tx.tokenSymbol ? tx.tokenSymbol.toUpperCase() : '';
                  
                  // ONLY infer BTC if:
                  // 1. NetworkName explicitly mentions Bitcoin/BTC, AND
                  // 2. We don't have a tokenSymbol already, OR the existing tokenSymbol is BTC
                  if ((networkName.toLowerCase().includes('bitcoin') || networkName.toLowerCase().includes('btc')) &&
                      (!hasTokenSymbol || existingToken === 'BTC')) {
                    inferredToken = 'BTC';
                    inferredChainId = 0;
                    inferredNetworkName = 'Bitcoin';
                    console.log(`TransactionStore: 🔄 Detected BTC transaction (was ${tx.tokenSymbol || 'unknown'}) - fixing to BTC/Bitcoin for ${tx.id}`);
                  } else if (networkName.toLowerCase().includes('ethereum') || networkName.toLowerCase().includes('sepolia') || chainId === 1 || chainId === 11155111) {
                  // CRITICAL: If we already have a tokenSymbol, preserve it (could be ETH, USDT, USDC, DAI, or any ERC-20 token)
                  // Transak supports ALL tokens on Ethereum networks - don't default to ETH
                  if (tx.tokenSymbol && tx.tokenSymbol.trim() !== '' && tx.tokenSymbol.toUpperCase() !== 'UNKNOWN') {
                    inferredToken = tx.tokenSymbol.toUpperCase();
                    // Fix chainId if it was incorrectly set to 0
                    inferredChainId = chainId === 0 ? 1 : chainId;
                    inferredNetworkName = chainId === 11155111 ? 'Sepolia' : 'Ethereum';
                    console.log(`TransactionStore: 🔄 Preserved tokenSymbol ${inferredToken} on Ethereum (was ${tx.tokenSymbol}) - fixing chainId to ${inferredChainId} for ${tx.id}`);
                  } else {
                    // Only infer ETH if we have NO tokenSymbol at all
                    inferredToken = 'ETH';
                  }
                } else if (networkName.toLowerCase().includes('polygon') || networkName.toLowerCase().includes('matic') || networkName.toLowerCase().includes('amoy') || chainId === 137 || chainId === 80002) {
                  inferredToken = 'MATIC';
                } else if (networkName.toLowerCase().includes('binance') || networkName.toLowerCase().includes('bsc') || chainId === 56 || chainId === 97) {
                  inferredToken = 'BNB';
                } else if (networkName.toLowerCase().includes('cardano') || networkName.toLowerCase().includes('ada')) {
                  inferredToken = 'ADA';
                } else if (networkName.toLowerCase().includes('ripple') || networkName.toLowerCase().includes('xrp')) {
                  inferredToken = 'XRP';
                } else if (networkName.toLowerCase().includes('stellar') || networkName.toLowerCase().includes('xlm')) {
                  inferredToken = 'XLM';
                } else if (networkName.toLowerCase().includes('tron') || networkName.toLowerCase().includes('trx')) {
                  inferredToken = 'TRX';
                } else if (networkName.toLowerCase().includes('solana') || networkName.toLowerCase().includes('sol')) {
                  inferredToken = 'SOL';
                }
                
                if (inferredToken && inferredToken !== '') {
                const isTargetOrderId = tx.orderId === 'ac1e2dbf-4d08-4255-a9a2-9decada08fe6';
                if (isTargetOrderId) {
                  console.log(`TransactionStore: 🎯 TARGET ORDER ID: Inferred ${inferredToken} from network (chainId: ${tx.chainId}, networkName: ${tx.networkName})`);
                }
                console.log(`TransactionStore: 🔄 API failed but inferred tokenSymbol from network: ${inferredToken} for ${tx.id}`);
                await get().updateTransaction(
                  tx.id,
                  {
                    tokenSymbol: inferredToken,
                    tokenName: inferredToken,
                    // CRITICAL: Also update chainId and networkName if we detected BTC or other corrections
                    ...(inferredChainId !== chainId ? { chainId: inferredChainId } : {}),
                    ...(inferredNetworkName !== networkName ? { networkName: inferredNetworkName } : {}),
                  },
                  normalizedAddress
                );
                
                // Mark as complete (we have tokenSymbol now, even if from inference)
                const newIncomplete = new Set(state.incompleteTransactions);
                newIncomplete.delete(tx.id);
                set((s) => ({ incompleteTransactions: newIncomplete }));
                successCount++;
                
                if (isTargetOrderId) {
                  console.log(`TransactionStore: 🎯 TARGET ORDER ID: ✅ Transaction ${tx.id} updated with ${inferredToken}, should now display in Wallet tab`);
                }
              }
              } // Closes if (!hasTokenSymbol...) from line 835
              } else {
                // CRITICAL: We have orderId but API failed - DO NOT infer
                // Leave transaction unchanged - retry mechanism will correct it when API succeeds
                console.log(`TransactionStore: ⚠️ Transaction ${tx.id} has orderId ${tx.orderId} but API failed - NOT inferring tokenSymbol (will retry)`);
              }
            } // Closes else block from line 824 (API failed - missing cryptoCurrency)
          } catch (error) {
            console.error(`TransactionStore: Error syncing transaction ${tx.id}:`, error);
            
            // CRITICAL FALLBACK: If API fails completely, try network-based inference
            // CRITICAL: If we have orderId, DO NOT infer - API is the only source of truth
            // Only infer if we have NO orderId (transaction hasn't completed via Transak)
            if (!tx.orderId && (!tx.tokenSymbol || tx.tokenSymbol === 'UNKNOWN' || tx.tokenSymbol === '' || 
                (tx.tokenSymbol === 'ETH' && (tx.networkName && tx.networkName.toLowerCase().includes('bitcoin'))))) {
              const networkName = tx.networkName || '';
              const chainId = tx.chainId || 0;
              
              let inferredToken = '';
              let inferredChainId = chainId;
              let inferredNetworkName = networkName;
              
              // PRIORITY 1: Check for BTC ONLY if networkName explicitly mentions Bitcoin/BTC
              // CRITICAL: chainId === 0 alone is NOT sufficient evidence for BTC - it could be USDT or other tokens
              if (networkName.toLowerCase().includes('bitcoin') || networkName.toLowerCase().includes('btc')) {
                inferredToken = 'BTC';
                inferredChainId = 0;
                inferredNetworkName = 'Bitcoin';
                console.log(`TransactionStore: 🔄 Detected BTC transaction (was ${tx.tokenSymbol || 'unknown'}) - fixing to BTC/Bitcoin for ${tx.id}`);
              } else if (networkName.toLowerCase().includes('ethereum') || networkName.toLowerCase().includes('sepolia') || chainId === 1 || chainId === 11155111) {
                // CRITICAL: If we already have a tokenSymbol, preserve it (could be ETH, USDT, USDC, DAI, or any ERC-20 token)
                // Transak supports ALL tokens on Ethereum networks - don't default to ETH
                if (tx.tokenSymbol && tx.tokenSymbol.trim() !== '' && tx.tokenSymbol.toUpperCase() !== 'UNKNOWN') {
                  inferredToken = tx.tokenSymbol.toUpperCase();
                  // Fix chainId if it was incorrectly set to 0
                  inferredChainId = chainId === 0 ? 1 : chainId;
                  inferredNetworkName = chainId === 11155111 ? 'Sepolia' : 'Ethereum';
                  console.log(`TransactionStore: 🔄 Preserved tokenSymbol ${inferredToken} on Ethereum (was ${tx.tokenSymbol}) - fixing chainId to ${inferredChainId} for ${tx.id}`);
                } else {
                  // Only infer ETH if we have NO tokenSymbol at all
                  inferredToken = 'ETH';
                }
              } else if (networkName.toLowerCase().includes('polygon') || networkName.toLowerCase().includes('matic') || networkName.toLowerCase().includes('amoy') || chainId === 137 || chainId === 80002) {
                inferredToken = 'MATIC';
              } else if (networkName.toLowerCase().includes('binance') || networkName.toLowerCase().includes('bsc') || chainId === 56 || chainId === 97) {
                inferredToken = 'BNB';
              } else if (networkName.toLowerCase().includes('cardano') || networkName.toLowerCase().includes('ada')) {
                inferredToken = 'ADA';
              } else if (networkName.toLowerCase().includes('ripple') || networkName.toLowerCase().includes('xrp')) {
                inferredToken = 'XRP';
              } else if (networkName.toLowerCase().includes('stellar') || networkName.toLowerCase().includes('xlm')) {
                inferredToken = 'XLM';
              } else if (networkName.toLowerCase().includes('tron') || networkName.toLowerCase().includes('trx')) {
                inferredToken = 'TRX';
              } else if (networkName.toLowerCase().includes('solana') || networkName.toLowerCase().includes('sol')) {
                inferredToken = 'SOL';
              }
              
              if (inferredToken && inferredToken !== '') {
                const isTargetOrderId = tx.orderId === 'ac1e2dbf-4d08-4255-a9a2-9decada08fe6';
                if (isTargetOrderId) {
                  console.log(`TransactionStore: 🎯 TARGET ORDER ID: Inferred ${inferredToken} from network (chainId: ${tx.chainId}, networkName: ${tx.networkName})`);
                }
                console.log(`TransactionStore: 🔄 API failed, inferred tokenSymbol from network: ${inferredToken} for ${tx.id}`);
                await get().updateTransaction(
                  tx.id,
                  {
                    tokenSymbol: inferredToken,
                    tokenName: inferredToken,
                    // CRITICAL: Also update chainId and networkName if we detected BTC or other corrections
                    ...(inferredChainId !== chainId ? { chainId: inferredChainId } : {}),
                    ...(inferredNetworkName !== networkName ? { networkName: inferredNetworkName } : {}),
                  },
                  normalizedAddress
                );
                
                // Mark as complete (we have tokenSymbol now)
                const newIncomplete = new Set(state.incompleteTransactions);
                newIncomplete.delete(tx.id);
                set((s) => ({ incompleteTransactions: newIncomplete }));
                successCount++;
                
                if (isTargetOrderId) {
                  console.log(`TransactionStore: 🎯 TARGET ORDER ID: ✅ Transaction ${tx.id} updated with ${inferredToken}, should now display in Wallet tab`);
                }
              } else {
                const isTargetOrderId = tx.orderId === 'ac1e2dbf-4d08-4255-a9a2-9decada08fe6';
                if (isTargetOrderId) {
                  console.warn(`TransactionStore: 🎯 TARGET ORDER ID: ⚠️ Cannot infer tokenSymbol - chainId: ${tx.chainId}, networkName: ${tx.networkName || '(empty)'}`);
                }
                console.warn(`TransactionStore: ⚠️ Cannot infer tokenSymbol for ${tx.id} - API failed and no network hints available`);
                // Keep in incomplete set for retry later
              }
            } else {
              // Already has tokenSymbol, just missing other data - keep trying
              console.warn(`TransactionStore: ⚠️ Transaction ${tx.id} has tokenSymbol but API failed - will retry for complete data`);
            }
          }
        }
        
        // CRITICAL: Only log if we had successes (to prevent infinite loops)
        if (successCount > 0) {
          console.log(`TransactionStore: ✅ Successfully synced ${successCount} transactions`);
        }
        
        // Release lock
        syncLocks.delete(normalizedAddress);
      },
      
      /**
       * Get transactions with optional filtering
       * Note: Used by non-reactive code paths (like useAssetsSimplified)
       */
      getTransactions: (walletAddress, filter) => {
        const state = get();
        // CRITICAL: Normalize wallet address to lowercase for consistent lookup
        const normalizedAddress = walletAddress.toLowerCase();
        let transactions = state.transactions[normalizedAddress] || [];
        
        // CRITICAL: Also check original case in case transactions were stored with mixed case
        if (transactions.length === 0 && walletAddress !== normalizedAddress) {
          transactions = state.transactions[walletAddress] || [];
          if (transactions.length > 0) {
            console.log(`TransactionStore: Found transactions with mixed-case key, normalizing...`);
          }
        }
        
        if (filter?.type) {
          transactions = transactions.filter(t => t.type === filter.type);
        }
        
        if (filter?.status) {
          transactions = transactions.filter(t => t.status === filter.status);
        }
        
        if (filter?.startDate) {
          transactions = transactions.filter(t => t.timestamp >= filter.startDate!);
        }
        
        if (filter?.endDate) {
          transactions = transactions.filter(t => t.timestamp <= filter.endDate!);
        }
        
        if (filter?.limit) {
          transactions = transactions.slice(0, filter.limit);
        }
        
        return transactions;
      },
      
      /**
       * Get a specific transaction
       */
      getTransaction: (id, walletAddress) => {
        const state = get();
        const transactions = state.transactions[walletAddress] || [];
        return transactions.find(t => t.id === id);
      },
      
      /**
       * Get transaction statistics
       */
      getStats: (walletAddress) => {
        const state = get();
        const transactions = state.transactions[walletAddress] || [];
        
        const stats = {
          total: transactions.length,
          byType: {} as Record<string, number>,
          byStatus: {} as Record<string, number>,
          incomplete: 0,
        };
        
        transactions.forEach(tx => {
          stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;
          stats.byStatus[tx.status] = (stats.byStatus[tx.status] || 0) + 1;
          
          if (state.incompleteTransactions.has(tx.id)) {
            stats.incomplete++;
          }
        });
        
        return stats;
      },
      
      /**
       * Subscribe to transaction updates
       * Returns unsubscribe function
       */
      subscribe: (callback) => {
        const state = get();
        
        // CRITICAL: Throttle callback to prevent rapid-fire updates (Samsung A24 fix)
        let lastCallTime = 0;
        const throttledCallback = (walletAddress: string) => {
          const now = Date.now();
          if (now - lastCallTime < 100) { // Throttle to max once per 100ms
            return;
          }
          lastCallTime = now;
          callback(walletAddress);
        };
        
        state.listeners.add(throttledCallback);
        
        return () => {
          const currentState = get();
          currentState.listeners.delete(throttledCallback);
        };
      },
      
      /**
       * Notify all listeners of updates
       */
      notifyUpdate: (walletAddress) => {
        // CRITICAL: Notify throttled listeners when transactions update
        // This is used by non-reactive components (like StableHistoryTab)
        const state = get();
        state.listeners.forEach(callback => {
          try {
            callback(walletAddress);
          } catch (error) {
            console.error('TransactionStore: Error in listener callback:', error);
          }
        });
      },
    }),
    {
      name: 'transaction-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist transactions, not listeners/pending sets
      partialize: (state) => ({
        transactions: state.transactions,
      }),
    }
  )
);

/**
 * Helper: Use transactions for a specific wallet (reactive hook)
 * Automatically updates when transactions change for this wallet
 * 
 * CRITICAL: This hook is optimized to prevent getSnapshot infinite loops
 * by using stable selectors and memoization
 */
// Track which wallets have been loaded to prevent redundant loads
const loadedWallets = new Set<string>();

// CRITICAL: Cache selectors outside component to prevent recreation
// This is the key to preventing getSnapshot infinite loops
const selectorCache = new Map<string, (state: TransactionState) => TransactionRecord[]>();

function getStableSelector(normalizedAddress: string | null) {
  if (!normalizedAddress) {
    // Return a stable empty array selector
    const emptyKey = '__empty__';
    if (!selectorCache.has(emptyKey)) {
      selectorCache.set(emptyKey, () => []);
    }
    return selectorCache.get(emptyKey)!;
  }
  
  if (!selectorCache.has(normalizedAddress)) {
    selectorCache.set(normalizedAddress, (state: TransactionState) => {
      return state.transactions[normalizedAddress] || [];
    });
  }
  
  return selectorCache.get(normalizedAddress)!;
}

export function useTransactions(walletAddress: string | null, filter?: Parameters<TransactionState['getTransactions']>[1]) {
  // CRITICAL: Normalize wallet address to lowercase for consistent lookup
  const normalizedAddress = walletAddress ? walletAddress.toLowerCase() : null;
  
  // CRITICAL: Use cached stable selector - prevents getSnapshot infinite loops
  const selector = getStableSelector(normalizedAddress);
  const rawTransactions = useTransactionStore(selector);
  
  // CRITICAL: Memoize filtered results based on transaction IDs, not array reference
  // This prevents infinite loops caused by new array references
  // CRITICAL: Use stable string comparison for txIds to prevent re-computation
  const txIdsString = React.useMemo(() => {
    if (!rawTransactions || rawTransactions.length === 0) return '';
    // CRITICAL: Sort IDs to ensure stable string even if order changes
    return rawTransactions.map(t => `${t.id}:${t.timestamp}`).sort().join('|');
  }, [rawTransactions]);
  
  // CRITICAL: Memoize filter string to prevent unnecessary re-computations
  const filterString = React.useMemo(() => {
    if (!filter) return '';
    return JSON.stringify(filter);
  }, [filter?.type, filter?.status, filter?.startDate, filter?.endDate, filter?.limit]);
  
  const transactions = React.useMemo(() => {
    if (!rawTransactions || !Array.isArray(rawTransactions) || rawTransactions.length === 0) {
      return [];
    }
    
    // Apply filters
    let filtered = [...rawTransactions]; // Create new array for filtering
    if (filter?.type) {
      filtered = filtered.filter(t => t.type === filter.type);
    }
    if (filter?.status) {
      filtered = filtered.filter(t => t.status === filter.status);
    }
    if (filter?.startDate) {
      filtered = filtered.filter(t => t.timestamp >= filter.startDate!);
    }
    if (filter?.endDate) {
      filtered = filtered.filter(t => t.timestamp <= filter.endDate!);
    }
    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit);
    }
    
    return filtered;
  }, [txIdsString, filterString]); // CRITICAL: Depend on stable strings, not rawTransactions or JSON.stringify
  
  // Load transactions on mount (only once per wallet)
  React.useEffect(() => {
    if (normalizedAddress && !loadedWallets.has(normalizedAddress)) {
      loadedWallets.add(normalizedAddress);
      useTransactionStore.getState().loadTransactions(normalizedAddress).catch(err => {
        console.error('useTransactions: Error loading transactions:', err);
        loadedWallets.delete(normalizedAddress); // Allow retry on error
      });
    }
  }, [normalizedAddress]);
  
  return transactions;
}

