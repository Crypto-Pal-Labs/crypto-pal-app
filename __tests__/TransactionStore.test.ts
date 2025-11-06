/**
 * TransactionStore Unit Tests
 * Tests core transaction management functionality
 */

import { useTransactionStore } from '../src/store/useTransactionStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiRemove: jest.fn(),
}));

// Mock Transak Order Service
jest.mock('../src/services/TransakOrderService', () => ({
  fetchTransakOrder: jest.fn(),
}));

describe('TransactionStore', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset TransactionStore state
    const store = useTransactionStore.getState();
    store.transactions = {};
    store.incompleteTransactions = new Set();
    store.pendingTransactions = new Set();
  });

  describe('addTransaction', () => {
    it('should add a new transaction', async () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const txData = {
        type: 'BUY' as const,
        timestamp: Date.now(),
        date: '11/4/2025',
        time: '3:45:00 PM',
        tokenSymbol: 'ETH',
        tokenName: 'Ethereum',
        tokenAmount: '0.1',
        tokenDecimals: 18,
        currencySymbol: 'GBP',
        currencyAmount: '300',
        fromAddress: '',
        toAddress: walletAddress,
        transactionHash: '0xabc123',
        chainId: 1,
        networkName: 'Ethereum',
        gasFee: '0.001',
        totalCost: '0.001',
        status: 'COMPLETED' as const,
        reference: '0xabc123',
        source: 'TRANSAK' as const,
        explorerUrl: 'https://etherscan.io/tx/0xabc123',
        walletAddress: walletAddress,
        orderId: 'test-order-123',
      };

      const store = useTransactionStore.getState();
      const txId = await store.addTransaction(txData, walletAddress);

      expect(txId).toBeTruthy();
      expect(txId).toContain('BUY_');
      
      const transactions = store.getTransactions(walletAddress);
      expect(transactions).toHaveLength(1);
      expect(transactions[0].tokenSymbol).toBe('ETH');
      expect(transactions[0].tokenAmount).toBe('0.1');
      expect((transactions[0] as any).orderId).toBe('test-order-123');
    });

    it('should prevent duplicate transactions with same orderId', async () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const orderId = 'duplicate-test-order';
      
      const txData1 = {
        type: 'BUY' as const,
        timestamp: Date.now(),
        date: '11/4/2025',
        time: '3:45:00 PM',
        tokenSymbol: 'ETH',
        tokenName: 'Ethereum',
        tokenAmount: '0.1',
        tokenDecimals: 18,
        currencySymbol: 'GBP',
        currencyAmount: '300',
        fromAddress: '',
        toAddress: walletAddress,
        transactionHash: '',
        chainId: 1,
        networkName: 'Ethereum',
        gasFee: '0',
        totalCost: '0',
        status: 'COMPLETED' as const,
        reference: orderId,
        source: 'TRANSAK' as const,
        explorerUrl: '',
        walletAddress: walletAddress,
        orderId: orderId,
      };

      const txData2 = {
        ...txData1,
        tokenSymbol: 'BTC', // Different token (bug scenario)
        tokenName: 'Bitcoin',
        chainId: 0,
        networkName: 'Bitcoin',
      };

      const store = useTransactionStore.getState();
      const txId1 = await store.addTransaction(txData1, walletAddress);
      const txId2 = await store.addTransaction(txData2, walletAddress);

      // Should return same ID (updated existing)
      expect(txId1).toBe(txId2);
      
      const transactions = store.getTransactions(walletAddress);
      // Should only have ONE transaction
      expect(transactions).toHaveLength(1);
      expect((transactions[0] as any).orderId).toBe(orderId);
    });

    it('should merge duplicate transactions intelligently', async () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const orderId = 'merge-test-order';
      
      // First transaction: has orderId but missing data
      const txData1 = {
        type: 'BUY' as const,
        timestamp: Date.now(),
        date: '11/4/2025',
        time: '3:45:00 PM',
        tokenSymbol: '',
        tokenName: 'Unknown Token',
        tokenAmount: '',
        tokenDecimals: 18,
        currencySymbol: 'GBP',
        currencyAmount: '',
        fromAddress: '',
        toAddress: walletAddress,
        transactionHash: '',
        chainId: 11155111,
        networkName: 'Sepolia',
        gasFee: '0',
        totalCost: '0',
        status: 'PENDING' as const,
        reference: orderId,
        source: 'TRANSAK' as const,
        explorerUrl: '',
        walletAddress: walletAddress,
        orderId: orderId,
      };

      // Second transaction: same orderId with complete data
      const txData2 = {
        ...txData1,
        tokenSymbol: 'BTC',
        tokenName: 'Bitcoin',
        tokenAmount: '0.00129534',
        transactionHash: '0xabc123',
        chainId: 0,
        networkName: 'Bitcoin',
        status: 'COMPLETED' as const,
      };

      const store = useTransactionStore.getState();
      await store.addTransaction(txData1, walletAddress);
      await store.addTransaction(txData2, walletAddress);

      const transactions = store.getTransactions(walletAddress);
      expect(transactions).toHaveLength(1);
      expect(transactions[0].tokenSymbol).toBe('BTC'); // Should prefer complete data
      expect(transactions[0].tokenAmount).toBe('0.00129534');
      expect(transactions[0].chainId).toBe(0);
    });
  });

  describe('loadTransactions', () => {
    it('should load and cleanup duplicate transactions', async () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const orderId = 'cleanup-test-order';
      
      // Simulate corrupted storage with duplicates
      const storedData = [
        {
          id: 'BUY_1_abc',
          type: 'BUY',
          orderId: orderId,
          tokenSymbol: 'ETH',
          tokenName: 'Ethereum',
          tokenAmount: '0.1',
          transactionHash: '',
          timestamp: Date.now(),
          date: '11/4/2025',
          time: '3:45 PM',
          tokenDecimals: 18,
          currencySymbol: 'GBP',
          currencyAmount: '300',
          fromAddress: '',
          toAddress: walletAddress,
          chainId: 1,
          networkName: 'Ethereum',
          gasFee: '0.001',
          totalCost: '0.001',
          status: 'COMPLETED',
          reference: orderId,
          source: 'TRANSAK',
          explorerUrl: '',
          walletAddress: walletAddress,
        },
        {
          id: 'BUY_2_def',
          type: 'BUY',
          orderId: orderId, // DUPLICATE orderId
          tokenSymbol: 'BTC', // Different token (bug)
          tokenName: 'Bitcoin',
          tokenAmount: '0.002',
          transactionHash: '0xhash123',
          timestamp: Date.now(),
          date: '11/4/2025',
          time: '3:46 PM',
          tokenDecimals: 8,
          currencySymbol: 'GBP',
          currencyAmount: '300',
          fromAddress: '',
          toAddress: walletAddress,
          chainId: 0,
          networkName: 'Bitcoin',
          gasFee: '0',
          totalCost: '0',
          status: 'COMPLETED',
          reference: orderId,
          source: 'TRANSAK',
          explorerUrl: '',
          walletAddress: walletAddress,
        }
      ];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(storedData));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const store = useTransactionStore.getState();
      await store.loadTransactions(walletAddress);

      // Should have cleaned up duplicates
      const transactions = store.getTransactions(walletAddress);
      expect(transactions).toHaveLength(1); // Merged into one
      
      // Should have saved cleaned data
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Transaction filtering', () => {
    it('should filter transactions by type', async () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const store = useTransactionStore.getState();

      // Add BUY transaction
      await store.addTransaction({
        type: 'BUY',
        tokenSymbol: 'ETH',
        tokenName: 'Ethereum',
        tokenAmount: '0.1',
        // ... other required fields
      } as any, walletAddress);

      // Add SEND transaction
      await store.addTransaction({
        type: 'SEND',
        tokenSymbol: 'ETH',
        tokenName: 'Ethereum',
        tokenAmount: '0.05',
        // ... other required fields
      } as any, walletAddress);

      const buyTransactions = store.getTransactions(walletAddress, { type: 'BUY' });
      const sendTransactions = store.getTransactions(walletAddress, { type: 'SEND' });

      expect(buyTransactions).toHaveLength(1);
      expect(sendTransactions).toHaveLength(1);
      expect(buyTransactions[0].type).toBe('BUY');
      expect(sendTransactions[0].type).toBe('SEND');
    });
  });
});

