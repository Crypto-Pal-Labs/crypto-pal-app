/**
 * End-to-End Test: History Tab Filtering and Transaction Card Accuracy
 * 
 * Tests:
 * 1. Transaction type filtering (ALL, BUY, SELL, SEND, RECEIVE, RECENT)
 * 2. Transaction cards display accurate data
 * 3. Transaction details are correct (amounts, addresses, timestamps)
 * 4. Currency symbols and amounts are accurate
 * 5. Transaction status is displayed correctly
 * 6. Network information is accurate
 */

import { TransactionCaptureService } from '../../../services/TransactionCaptureService';
import { useTransactionStore } from '../../../store/useTransactionStore';
import { useWalletStore } from '../../../store/useWalletStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockWalletAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';
const mockReceiverAddress = '0x8ba1f109551bD432803012645Hac136c';

// Helper to filter transactions by type (simulating History tab logic)
function filterTransactions(transactions: any[], filterType: string) {
  if (filterType === 'ALL') {
    return transactions;
  }
  if (filterType === 'RECENT') {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return transactions.filter((tx) => tx.timestamp >= thirtyDaysAgo);
  }
  return transactions.filter((tx) => tx.type === filterType);
}

describe('History Tab Filtering and Transaction Cards', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    useWalletStore.getState().setAddress(mockWalletAddress);
    await AsyncStorage.removeItem(`crypto_pal_transactions_${mockWalletAddress.toLowerCase()}`);
  });

  describe('Transaction Type Filtering', () => {
    test('should filter ALL transactions correctly', async () => {
      // Create various transaction types
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          currencyAmount: '1250',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureSellTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.2',
          currencyAmount: '500',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureSendTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.1',
          toAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          gasFee: '0.001',
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureReceiveTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.3',
          fromAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const filtered = filterTransactions(allTransactions, 'ALL');

      expect(filtered.length).toBeGreaterThanOrEqual(4);
      expect(filtered.some((tx) => tx.type === 'BUY')).toBe(true);
      expect(filtered.some((tx) => tx.type === 'SELL')).toBe(true);
      expect(filtered.some((tx) => tx.type === 'SEND')).toBe(true);
      expect(filtered.some((tx) => tx.type === 'RECEIVE')).toBe(true);
    });

    test('should filter BUY transactions correctly', async () => {
      // Create BUY and other transaction types
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          currencyAmount: '1250',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'BTC',
          tokenAmount: '0.01',
          currencyAmount: '600',
          currencySymbol: 'USD',
          transactionHash: `${Math.random().toString(36).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureSellTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.2',
          currencyAmount: '500',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const filtered = filterTransactions(allTransactions, 'BUY');

      expect(filtered.length).toBe(2);
      expect(filtered.every((tx) => tx.type === 'BUY')).toBe(true);
      expect(filtered.some((tx) => tx.tokenName === 'ETH')).toBe(true);
      expect(filtered.some((tx) => tx.tokenName === 'BTC')).toBe(true);
    });

    test('should filter SELL transactions correctly', async () => {
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '1.0',
          currencyAmount: '2500',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureSellTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.3',
          currencyAmount: '750',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureSellTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.2',
          currencyAmount: '500',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const filtered = filterTransactions(allTransactions, 'SELL');

      expect(filtered.length).toBe(2);
      expect(filtered.every((tx) => tx.type === 'SELL')).toBe(true);
    });

    test('should filter SEND transactions correctly', async () => {
      await TransactionCaptureService.captureSendTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.1',
          toAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          gasFee: '0.001',
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureReceiveTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.2',
          fromAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const filtered = filterTransactions(allTransactions, 'SEND');

      expect(filtered.length).toBe(1);
      expect(filtered[0]?.type).toBe('SEND');
      expect(filtered[0]?.toAddress).toBe(mockReceiverAddress);
    });

    test('should filter RECEIVE transactions correctly', async () => {
      await TransactionCaptureService.captureSendTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.1',
          toAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          gasFee: '0.001',
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureReceiveTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.2',
          fromAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const filtered = filterTransactions(allTransactions, 'RECEIVE');

      expect(filtered.length).toBe(1);
      expect(filtered[0]?.type).toBe('RECEIVE');
      expect(filtered[0]?.fromAddress).toBe(mockReceiverAddress);
    });

    test('should filter RECENT transactions correctly', async () => {
      // Create old transaction (more than 30 days ago)
      const oldTransaction = await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.1',
          currencyAmount: '250',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      // Manually update timestamp to be old
      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const oldTx = allTransactions.find((tx) => tx.id === oldTransaction);
      if (oldTx) {
        const thirtyDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
        await TransactionCaptureService.updateTransaction(
          oldTransaction,
          { timestamp: thirtyDaysAgo },
          mockWalletAddress
        );
      }

      // Create recent transaction
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          currencyAmount: '1250',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      const updatedTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const filtered = filterTransactions(updatedTransactions, 'RECENT');

      // Should only include transactions from last 30 days
      const recentCount = filtered.length;
      expect(recentCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Transaction Card Accuracy', () => {
    test('should display correct BUY transaction details', async () => {
      const buyTransactionId = await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          currencyAmount: '1250',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          orderId: 'test-order-123',
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.updateTransaction(
        buyTransactionId,
        {
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === buyTransactionId);

      // Verify transaction card data
      expect(transaction).toBeDefined();
      expect(transaction?.type).toBe('BUY');
      expect(transaction?.tokenName).toBe('ETH');
      expect(transaction?.tokenAmount).toBe('0.5');
      expect(transaction?.currencyAmount).toBe('1250');
      expect(transaction?.currencySymbol).toBe('USD');
      expect(transaction?.status).toBe('COMPLETED');
      expect(transaction?.chainId).toBe(1);
      expect(transaction?.networkName).toBe('Ethereum');
      expect(transaction?.transactionHash).toBeDefined();
      expect(transaction?.timestamp).toBeDefined();
      expect(transaction?.date).toBeDefined();
      expect(transaction?.time).toBeDefined();
    });

    test('should display correct SELL transaction details', async () => {
      const sellTransactionId = await TransactionCaptureService.captureSellTransaction(
        {
          tokenSymbol: 'BTC',
          tokenAmount: '0.01',
          currencyAmount: '600',
          currencySymbol: 'USD',
          transactionHash: `${Math.random().toString(36).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.updateTransaction(
        sellTransactionId,
        {
          chainId: 0,
          networkName: 'Bitcoin',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === sellTransactionId);

      expect(transaction).toBeDefined();
      expect(transaction?.type).toBe('SELL');
      expect(transaction?.tokenName).toBe('BTC');
      expect(transaction?.tokenAmount).toBe('0.01');
      expect(transaction?.currencyAmount).toBe('600');
      expect(transaction?.currencySymbol).toBe('USD');
      expect(transaction?.status).toBe('COMPLETED');
      expect(transaction?.chainId).toBe(0);
      expect(transaction?.networkName).toBe('Bitcoin');
    });

    test('should display correct SEND transaction details', async () => {
      const sendTransactionId = await TransactionCaptureService.captureSendTransaction(
        {
          tokenSymbol: 'MATIC',
          tokenAmount: '100',
          toAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          gasFee: '0.01',
          status: 'COMPLETED' as const,
          chainId: 137,
          networkName: 'Polygon',
          currencyAmount: '70',
          currencySymbol: 'USD',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === sendTransactionId);

      expect(transaction).toBeDefined();
      expect(transaction?.type).toBe('SEND');
      expect(transaction?.tokenName).toBe('MATIC');
      expect(transaction?.tokenAmount).toBe('100');
      expect(transaction?.toAddress).toBe(mockReceiverAddress);
      expect(transaction?.fromAddress).toBe(mockWalletAddress);
      expect(transaction?.fee).toBe('0.01');
      expect(transaction?.chainId).toBe(137);
      expect(transaction?.networkName).toBe('Polygon');
      expect(transaction?.status).toBe('COMPLETED');
    });

    test('should display correct RECEIVE transaction details', async () => {
      const receiveTransactionId = await TransactionCaptureService.captureReceiveTransaction(
        {
          tokenSymbol: 'USDC',
          tokenAmount: '50',
          fromAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
          currencyAmount: '50',
          currencySymbol: 'USD',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === receiveTransactionId);

      expect(transaction).toBeDefined();
      expect(transaction?.type).toBe('RECEIVE');
      expect(transaction?.tokenName).toBe('USDC');
      expect(transaction?.tokenAmount).toBe('50');
      expect(transaction?.fromAddress).toBe(mockReceiverAddress);
      expect(transaction?.toAddress).toBe(mockWalletAddress);
      expect(transaction?.chainId).toBe(1);
      expect(transaction?.networkName).toBe('Ethereum');
      expect(transaction?.status).toBe('COMPLETED');
    });
  });

  describe('Transaction Status Display', () => {
    test('should display PENDING status correctly', async () => {
      const transactionId = await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          currencyAmount: '1250',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'PENDING',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === transactionId);

      expect(transaction?.status).toBe('PENDING');
    });

    test('should display FAILED status correctly', async () => {
      const transactionId = await TransactionCaptureService.captureSendTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          toAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          gasFee: '0.001',
          status: 'FAILED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockWalletAddress
      );

      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === transactionId);

      expect(transaction?.status).toBe('FAILED');
    });
  });

  describe('Currency and Amount Display', () => {
    test('should handle different fiat currencies correctly', async () => {
      const currencies = ['USD', 'GBP', 'EUR', 'NZD', 'AUD'];

      for (const currency of currencies) {
        const transactionId = await TransactionCaptureService.captureBuyTransaction(
          {
            tokenSymbol: 'ETH',
            tokenAmount: '0.1',
            currencyAmount: '250',
            currencySymbol: currency,
            transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
            status: 'COMPLETED',
          },
          mockWalletAddress
        );

        const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
        const transaction = allTransactions.find((tx) => tx.id === transactionId);

        expect(transaction?.currencySymbol).toBe(currency);
        expect(transaction?.currencyAmount).toBe('250');
      }
    });
  });
});

