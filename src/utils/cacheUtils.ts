// src/utils/cacheUtils.ts
// Utility functions for clearing cached data

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Clear all cached data for a fresh start
 * This should be called when creating a new wallet
 * 
 * @param preserveTransactions - If true, keeps TransactionStore data (for wallet restore)
 */
export async function clearAllCachedData(preserveTransactions: boolean = false): Promise<void> {
  try {
    console.log('CacheUtils: Clearing all cached data for new wallet...', { preserveTransactions });
    
    // CRITICAL: Only clear transactions if creating a NEW wallet
    // When restoring EXISTING wallet, preserve transactions (user's purchase history)
    if (!preserveTransactions) {
      const keys = await AsyncStorage.getAllKeys();
      const transactionKeys = keys.filter(key => key.startsWith('crypto_pal_transactions_'));
      
      if (transactionKeys.length > 0) {
        await AsyncStorage.multiRemove(transactionKeys);
        console.log(`CacheUtils: Cleared ${transactionKeys.length} transaction storage keys`);
      }
    } else {
      console.log('CacheUtils: ✅ Preserving TransactionStore data (wallet restore)');
    }
    
    // Clear other cached data (balances, prices) - these can be refetched
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => 
      (key.includes('cache') || 
       key.includes('price') || 
       key.includes('asset') ||
       key.includes('balance')) &&
      !key.startsWith('crypto_pal_transactions_') // Don't clear transactions if preserving
    );
    
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
      console.log(`CacheUtils: Cleared ${cacheKeys.length} cache keys`);
    }
    
    console.log('CacheUtils: All cached data cleared successfully');
  } catch (error) {
    console.error('CacheUtils: Error clearing cached data:', error);
  }
}

/**
 * Clear cached data for a specific wallet
 */
export async function clearWalletCachedData(walletAddress: string): Promise<void> {
  try {
    console.log(`CacheUtils: Clearing cached data for wallet ${walletAddress}...`);
    
    const keys = await AsyncStorage.getAllKeys();
    const walletKeys = keys.filter(key => 
      key.includes(walletAddress.toLowerCase()) ||
      key.startsWith(`crypto_pal_transactions_${walletAddress.toLowerCase()}`)
    );
    
    if (walletKeys.length > 0) {
      await AsyncStorage.multiRemove(walletKeys);
      console.log(`CacheUtils: Cleared ${walletKeys.length} keys for wallet ${walletAddress}`);
    }
    
    console.log(`CacheUtils: Cached data cleared for wallet ${walletAddress}`);
  } catch (error) {
    console.error('CacheUtils: Error clearing wallet cached data:', error);
  }
}

