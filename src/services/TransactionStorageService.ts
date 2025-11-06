import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TransactionRecord {
  id: string;
  type: 'BUY' | 'SELL' | 'SEND' | 'RECEIVE';
  timestamp: number;
  date: string;
  time: string;
  
  // Common fields
  tokenName: string;
  tokenAmount: string;
  currencyAmount: string;
  currencySymbol: string;
  walletAddress: string;
  transactionHash: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  
  // Buy/Sell specific
  purchaseCurrency?: string;
  purchaseAmount?: string;
  
  // Send/Receive specific
  fromAddress?: string;
  toAddress?: string;
  fee?: string;
  feeToken?: string;
  
  // Network info
  chainId: number;
  networkName: string;
  
  // Additional metadata
  metadata?: Record<string, any>;
  
  // Transak-specific fields
  orderId?: string; // Transak order ID for fetching complete details
  transakOrderStatus?: string; // Order status from Transak API
  
  // Token symbol for BUY/SELL transactions (stored separately for display)
  tokenSymbol?: string;
}

const STORAGE_KEY_PREFIX = 'crypto_pal_transactions_';
const MAX_TRANSACTIONS = 1000; // Limit to prevent storage bloat

export class TransactionStorageService {
  /**
   * Get wallet-specific storage key
   */
  private static getStorageKey(walletAddress: string): string {
    if (!walletAddress) {
      throw new Error('Wallet address is required for transaction storage');
    }
    return `${STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`;
  }

  /**
   * Save a new transaction record
   */
  static async saveTransaction(transaction: Omit<TransactionRecord, 'id'>): Promise<string> {
    try {
      if (!transaction.walletAddress) {
        throw new Error('Wallet address is required to save transaction');
      }

      const id = `${transaction.type}_${transaction.timestamp}_${Math.random().toString(36).substr(2, 9)}`;
      const fullTransaction: TransactionRecord = {
        ...transaction,
        id,
      };

      // Get existing transactions for this wallet
      const existing = await this.getAllTransactions(transaction.walletAddress);
      
      // CRITICAL: Ensure existing is an array before using spread operator
      const existingArray = Array.isArray(existing) ? existing : [];
      
      // Add new transaction at the beginning (most recent first)
      const updated = [fullTransaction, ...existingArray].slice(0, MAX_TRANSACTIONS);
      
      // Save to wallet-specific storage
      const storageKey = this.getStorageKey(transaction.walletAddress);
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      
      console.log(`TransactionStorageService: ✅ Transaction saved for wallet ${transaction.walletAddress}:`, {
        id,
        type: transaction.type,
        tokenName: transaction.tokenName,
        tokenSymbol: (transaction as any).tokenSymbol || 'MISSING',
        tokenAmount: transaction.tokenAmount,
        orderId: (transaction as any).orderId || 'MISSING'
      });
      
      // CRITICAL: Trigger History tab refresh immediately after saving
      // This ensures new transactions appear instantly without manual refresh
      this.triggerHistoryRefresh();
      
      return id;
    } catch (error) {
      console.error('Error saving transaction:', error);
      throw error;
    }
  }

  // CRITICAL: Event emitter for transaction updates
  private static listeners: Set<() => void> = new Set();
  
  /**
   * Subscribe to transaction updates
   */
  static onTransactionUpdate(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
  
  /**
   * Trigger a refresh of the history tab
   */
  static triggerHistoryRefresh() {
    console.log('TransactionStorageService: History refresh triggered, notifying listeners');
    this.listeners.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('TransactionStorageService: Error in refresh callback:', error);
      }
    });
  }

  /**
   * Get all transactions for a specific wallet, sorted by timestamp (most recent first)
   */
  static async getAllTransactions(walletAddress: string): Promise<TransactionRecord[]> {
    try {
      if (!walletAddress) {
        console.log('TransactionStorageService: No wallet address provided, returning empty array');
        return [];
      }

      const storageKey = this.getStorageKey(walletAddress);
      const data = await AsyncStorage.getItem(storageKey);
      if (!data) {
        console.log(`TransactionStorageService: No transactions found for wallet ${walletAddress}`);
        return [];
      }
      
      const transactions: TransactionRecord[] = JSON.parse(data);
      console.log(`TransactionStorageService: Found ${transactions.length} transactions for wallet ${walletAddress}`);
      return transactions.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error loading transactions:', error);
      return [];
    }
  }

  /**
   * Get transactions by type
   */
  static async getTransactionsByType(type: TransactionRecord['type'], walletAddress: string): Promise<TransactionRecord[]> {
    const all = await this.getAllTransactions(walletAddress);
    return all.filter(t => t.type === type);
  }

  /**
   * Get transactions by date range
   */
  static async getTransactionsByDateRange(startDate: number, endDate: number, walletAddress: string): Promise<TransactionRecord[]> {
    const all = await this.getAllTransactions(walletAddress);
    return all.filter(t => t.timestamp >= startDate && t.timestamp <= endDate);
  }

  /**
   * Update transaction status
   */
  static async updateTransactionStatus(id: string, status: TransactionRecord['status'], walletAddress: string): Promise<void> {
    try {
      const all = await this.getAllTransactions(walletAddress);
      const index = all.findIndex(t => t.id === id);
      
      if (index !== -1) {
        all[index].status = status;
        const storageKey = this.getStorageKey(walletAddress);
        await AsyncStorage.setItem(storageKey, JSON.stringify(all));
        console.log(`Transaction ${id} status updated to ${status} for wallet ${walletAddress}`);
      }
    } catch (error) {
      console.error('Error updating transaction status:', error);
    }
  }

  /**
   * Clear all transactions (for testing or reset)
   */
  static async clearAllTransactions(walletAddress: string): Promise<void> {
    try {
      const storageKey = this.getStorageKey(walletAddress);
      await AsyncStorage.removeItem(storageKey);
      console.log(`All transactions cleared for wallet ${walletAddress}`);
    } catch (error) {
      console.error('Error clearing transactions:', error);
    }
  }

  /**
   * Get transaction statistics
   */
  static async getTransactionStats(walletAddress: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    totalValue: number;
  }> {
    const all = await this.getAllTransactions(walletAddress);
    
    const stats = {
      total: all.length,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      totalValue: 0,
    };

    all.forEach(transaction => {
      // Count by type
      stats.byType[transaction.type] = (stats.byType[transaction.type] || 0) + 1;
      
      // Count by status
      stats.byStatus[transaction.status] = (stats.byStatus[transaction.status] || 0) + 1;
      
      // Sum total value (in USD)
      if (transaction.currencySymbol === 'USD') {
        stats.totalValue += parseFloat(transaction.currencyAmount) || 0;
      }
    });

    return stats;
  }
}