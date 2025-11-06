/**
 * Transaction Cleanup Utility
 * Removes duplicate transactions from storage
 * Run this once to clean up corrupted data from earlier sessions
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TransactionRecord } from '../services/TransactionStorageService';

export interface CleanupResult {
  totalBefore: number;
  totalAfter: number;
  duplicatesRemoved: number;
  orderIdConflictsFixed: number;
}

/**
 * Clean up duplicate transactions for a wallet address
 * CRITICAL: Same orderId MUST result in ONE transaction record
 */
export async function cleanupTransactions(walletAddress: string): Promise<CleanupResult> {
  try {
    const normalizedAddress = walletAddress.toLowerCase();
    const storageKey = `crypto_pal_transactions_${normalizedAddress}`;
    
    const data = await AsyncStorage.getItem(storageKey);
    if (!data) {
      console.log('TransactionCleanup: No transactions found for', walletAddress);
      return {
        totalBefore: 0,
        totalAfter: 0,
        duplicatesRemoved: 0,
        orderIdConflictsFixed: 0,
      };
    }
    
    const transactions: TransactionRecord[] = JSON.parse(data);
    const totalBefore = transactions.length;
    
    console.log(`TransactionCleanup: Starting cleanup for ${walletAddress} - ${totalBefore} transactions`);
    
    // CRITICAL: Deduplicate by orderId - same orderId = same transaction
    const orderIdMap = new Map<string, TransactionRecord>();
    const noOrderIdTransactions: TransactionRecord[] = [];
    let orderIdConflictsFixed = 0;
    
    for (const tx of transactions) {
      const orderId = (tx as any).orderId;
      
      if (orderId && orderId.trim() !== '') {
        // Transaction has orderId - check for duplicates
        const existing = orderIdMap.get(orderId);
        
        if (existing) {
          // DUPLICATE FOUND - merge and keep the more complete one
          orderIdConflictsFixed++;
          
          const existingTokenSymbol = (existing as any).tokenSymbol || existing.tokenName;
          const txTokenSymbol = (tx as any).tokenSymbol || tx.tokenName;
          
          console.warn(`TransactionCleanup: ⚠️ Duplicate orderId ${orderId} found:`, {
            existing: {
              id: existing.id,
              tokenSymbol: existingTokenSymbol,
              amount: existing.tokenAmount,
              hash: existing.transactionHash
            },
            duplicate: {
              id: tx.id,
              tokenSymbol: txTokenSymbol,
              amount: tx.tokenAmount,
              hash: tx.transactionHash
            }
          });
          
          // Merge: prefer non-empty/non-unknown values
          const merged: TransactionRecord = { ...existing };
          
          // Prefer known tokenSymbol
          if (txTokenSymbol && txTokenSymbol !== 'Unknown Token' && txTokenSymbol !== 'UNKNOWN' &&
              (!existingTokenSymbol || existingTokenSymbol === 'Unknown Token' || existingTokenSymbol === 'UNKNOWN')) {
            merged.tokenSymbol = txTokenSymbol;
            merged.tokenName = txTokenSymbol;
          }
          
          // Prefer non-empty amounts
          if (tx.tokenAmount && (!existing.tokenAmount || existing.tokenAmount === '0')) {
            merged.tokenAmount = tx.tokenAmount;
          }
          if (tx.currencyAmount && (!existing.currencyAmount || existing.currencyAmount === '0')) {
            merged.currencyAmount = tx.currencyAmount;
          }
          
          // Prefer non-empty hash
          if (tx.transactionHash && (!existing.transactionHash || existing.transactionHash === '')) {
            merged.transactionHash = tx.transactionHash;
          }
          
          // Update the map with merged transaction
          orderIdMap.set(orderId, merged);
          
          console.log(`TransactionCleanup: ✅ Merged duplicate orderId ${orderId} - final tokenSymbol: ${merged.tokenSymbol || merged.tokenName}`);
        } else {
          // First transaction with this orderId - add to map
          orderIdMap.set(orderId, tx);
        }
      } else {
        // No orderId - keep as-is (will be deduplicated by timestamp later)
        noOrderIdTransactions.push(tx);
      }
    }
    
    // Combine deduplicated transactions
    const deduplicated = [
      ...Array.from(orderIdMap.values()),
      ...noOrderIdTransactions
    ];
    
    // Sort by timestamp (most recent first)
    deduplicated.sort((a, b) => b.timestamp - a.timestamp);
    
    const totalAfter = deduplicated.length;
    const duplicatesRemoved = totalBefore - totalAfter;
    
    // Save cleaned transactions
    await AsyncStorage.setItem(storageKey, JSON.stringify(deduplicated));
    
    const result: CleanupResult = {
      totalBefore,
      totalAfter,
      duplicatesRemoved,
      orderIdConflictsFixed,
    };
    
    console.log('TransactionCleanup: ✅ Cleanup complete:', result);
    
    return result;
  } catch (error) {
    console.error('TransactionCleanup: Error during cleanup:', error);
    throw error;
  }
}

/**
 * Clean up ALL transactions for all wallet addresses
 * Use with caution - this scans all AsyncStorage keys
 */
export async function cleanupAllTransactions(): Promise<Record<string, CleanupResult>> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const transactionKeys = allKeys.filter(key => key.startsWith('crypto_pal_transactions_'));
    
    console.log(`TransactionCleanup: Found ${transactionKeys.length} wallet transaction stores`);
    
    const results: Record<string, CleanupResult> = {};
    
    for (const key of transactionKeys) {
      // Extract wallet address from key: crypto_pal_transactions_0x...
      const walletAddress = key.replace('crypto_pal_transactions_', '');
      
      try {
        const result = await cleanupTransactions(walletAddress);
        results[walletAddress] = result;
      } catch (error) {
        console.error(`TransactionCleanup: Error cleaning up ${walletAddress}:`, error);
      }
    }
    
    console.log('TransactionCleanup: ✅ Cleaned up all wallets:', {
      totalWallets: transactionKeys.length,
      results
    });
    
    return results;
  } catch (error) {
    console.error('TransactionCleanup: Error during cleanup all:', error);
    throw error;
  }
}

