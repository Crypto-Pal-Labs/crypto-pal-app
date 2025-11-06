import { TransactionRecord } from './TransactionStorageService';
import { useTransactionStore } from '../store/useTransactionStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BuyTransactionData {
  tokenSymbol: string;
  tokenAmount: string;
  currencyAmount: string;
  currencySymbol: string;
  transactionHash?: string;
  orderId?: string; // Transak order ID
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface SellTransactionData {
  tokenSymbol: string;
  tokenAmount: string;
  currencyAmount: string;
  currencySymbol: string;
  transactionHash?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface SendTransactionData {
  tokenSymbol: string;
  tokenAmount: string;
  toAddress: string;
  transactionHash: string;
  gasFee: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  blockTimestamp?: string; // Optional blockchain timestamp
  chainId?: number; // Optional chain ID
  networkName?: string; // Optional network name
  currencyAmount?: string; // Optional USD amount
  currencySymbol?: string; // Optional currency symbol
}

export interface ReceiveTransactionData {
  tokenSymbol: string;
  tokenAmount: string;
  fromAddress: string;
  transactionHash: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  blockTimestamp?: string; // Optional blockchain timestamp
  chainId?: number; // Optional chain ID
  networkName?: string; // Optional network name
  currencyAmount?: string; // Optional USD amount
  currencySymbol?: string; // Optional currency symbol
}

export class TransactionCaptureService {
  /**
   * Capture a BUY transaction from Transak
   */
  static async captureBuyTransaction(data: BuyTransactionData, walletAddress: string): Promise<string> {
    const now = new Date();
    const timestamp = now.getTime();
    
    // CRITICAL: Ensure tokenSymbol is always stored, even if empty (will be filled later via updateTransaction)
    const tokenSymbol = (data.tokenSymbol || '').trim().toUpperCase();
    
    const transaction: Omit<TransactionRecord, 'id'> = {
      type: 'BUY',
      timestamp,
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      tokenName: tokenSymbol || data.tokenSymbol || '', // Use tokenSymbol if available, fallback to data.tokenSymbol
      tokenAmount: data.tokenAmount || '',
      currencyAmount: data.currencyAmount || '',
      currencySymbol: data.currencySymbol || '',
      walletAddress: walletAddress, // Use provided wallet address
      transactionHash: data.transactionHash || '',
      status: data.status,
      purchaseCurrency: data.currencySymbol || '',
      purchaseAmount: data.currencyAmount || '',
      chainId: 0, // Will be filled by the calling component
      networkName: '', // Will be filled by the calling component
      tokenSymbol: tokenSymbol || undefined, // CRITICAL: Store tokenSymbol field explicitly
      orderId: data.orderId || undefined, // CRITICAL: Store orderId for retry mechanism
    };

    // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
    const transactionStore = useTransactionStore.getState();
    const transactionId = await transactionStore.addTransaction(transaction, walletAddress);
    
    // CRITICAL: Log if tokenSymbol is missing
    if (!tokenSymbol || tokenSymbol === '') {
      console.warn(`TransactionCaptureService: ⚠️ BUY transaction ${transactionId} captured WITHOUT tokenSymbol - will need to be updated later`);
    } else {
      console.log(`TransactionCaptureService: ✅ BUY transaction ${transactionId} captured WITH tokenSymbol: ${tokenSymbol}`);
    }
    
    // No manual refresh needed - TransactionStore handles notifications automatically
    return transactionId;
  }

  /**
   * Capture a SELL transaction from Transak
   */
  static async captureSellTransaction(data: SellTransactionData, walletAddress: string): Promise<string> {
    const now = new Date();
    const timestamp = now.getTime();
    
    const transaction: Omit<TransactionRecord, 'id'> = {
      type: 'SELL',
      timestamp,
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      tokenName: data.tokenSymbol,
      tokenAmount: data.tokenAmount,
      currencyAmount: data.currencyAmount,
      currencySymbol: data.currencySymbol,
      walletAddress: walletAddress, // Use provided wallet address
      transactionHash: data.transactionHash || '',
      status: data.status,
      purchaseCurrency: data.currencySymbol,
      purchaseAmount: data.currencyAmount,
      chainId: 0, // Will be filled by the calling component
      networkName: '', // Will be filled by the calling component
    };

    // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService  
    const transactionStore = useTransactionStore.getState();
    return await transactionStore.addTransaction(transaction, walletAddress);
  }

  /**
   * Capture a SEND transaction (P2P)
   */
  static async captureSendTransaction(data: SendTransactionData, walletAddress: string): Promise<string> {
    // Use blockchain timestamp if available, otherwise use current time
    const transactionDate = data.blockTimestamp ? new Date(data.blockTimestamp) : new Date();
    const timestamp = transactionDate.getTime();
    
    const transaction: Omit<TransactionRecord, 'id'> = {
      type: 'SEND',
      timestamp,
      date: transactionDate.toLocaleDateString(),
      time: transactionDate.toLocaleTimeString(),
      tokenName: data.tokenSymbol,
      tokenAmount: data.tokenAmount,
      currencyAmount: data.currencyAmount || '0', // Use provided currency amount
      currencySymbol: data.currencySymbol || 'USD', // Use provided currency symbol
      walletAddress: walletAddress, // Use provided wallet address
      transactionHash: data.transactionHash,
      status: data.status,
      fromAddress: walletAddress, // Use provided wallet address as from address
      toAddress: data.toAddress,
      fee: data.gasFee,
      feeToken: data.tokenSymbol,
      chainId: data.chainId || 0, // Use provided chainId or default to 0
      networkName: data.networkName || '', // Use provided networkName or default to empty
    };

    // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService  
    const transactionStore = useTransactionStore.getState();
    return await transactionStore.addTransaction(transaction, walletAddress);
  }

  /**
   * Capture a RECEIVE transaction (P2P)
   */
  static async captureReceiveTransaction(data: ReceiveTransactionData, walletAddress: string): Promise<string> {
    // Use blockchain timestamp if available, otherwise use current time
    const transactionDate = data.blockTimestamp ? new Date(data.blockTimestamp) : new Date();
    const timestamp = transactionDate.getTime();
    
    const transaction: Omit<TransactionRecord, 'id'> = {
      type: 'RECEIVE',
      timestamp,
      date: transactionDate.toLocaleDateString(),
      time: transactionDate.toLocaleTimeString(),
      tokenName: data.tokenSymbol,
      tokenAmount: data.tokenAmount,
      currencyAmount: data.currencyAmount || '0', // Use provided currency amount
      currencySymbol: data.currencySymbol || 'USD', // Use provided currency symbol
      walletAddress: walletAddress, // Use provided wallet address
      transactionHash: data.transactionHash,
      status: data.status,
      fromAddress: data.fromAddress,
      toAddress: walletAddress, // Use provided wallet address as to address
      chainId: data.chainId || 0, // Use provided chainId or default to 0
      networkName: data.networkName || '', // Use provided networkName or default to empty
    };

    // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService  
    const transactionStore = useTransactionStore.getState();
    return await transactionStore.addTransaction(transaction, walletAddress);
  }

  /**
   * Update transaction with additional details
   */
  static async updateTransaction(
    id: string, 
    updates: Partial<TransactionRecord>,
    walletAddress: string
  ): Promise<void> {
    try {
      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      
      // CRITICAL: Normalize address for consistent lookup
      const normalizedAddress = walletAddress.toLowerCase();
      
      await transactionStore.updateTransaction(id, updates, normalizedAddress);
      
      console.log('TransactionCaptureService: ✅ Transaction updated via TransactionStore:', {
        id,
        tokenSymbol: (updates as any).tokenSymbol || 'MISSING',
        updatedFields: Object.keys(updates),
        note: 'TransactionStore handles persistence and notifications automatically'
      });
      
      // No manual refresh needed - TransactionStore handles notifications automatically
    } catch (error) {
      console.error('TransactionCaptureService: Error updating transaction:', error);
      throw error;
    }
  }
}