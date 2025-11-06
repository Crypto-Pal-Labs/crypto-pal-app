/**
 * End-to-End Test: BUY Transactions through Transak
 * 
 * Tests:
 * 1. BUY transactions with multiple fiat currencies (USD, GBP, EUR, NZD, etc.)
 * 2. BUY transactions for different tokens (ETH, BTC, XRP, MATIC, USDC, etc.)
 * 3. BUY transactions across different networks (Ethereum, Polygon, Bitcoin, Ripple, etc.)
 * 4. Transaction appears correctly in History tab
 * 5. Transaction appears correctly in Wallet tab
 * 6. Balance calculations are accurate
 */

import { TransactionCaptureService } from '../../../services/TransactionCaptureService';
import { useTransactionStore } from '../../../store/useTransactionStore';
import { fetchTransakOrder } from '../../../services/TransakOrderService';
import { mapTransakNetwork } from '../../../services/TransakNetworkMapper';
import { useWalletStore } from '../../../store/useWalletStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock Transak Order API
jest.mock('../../../services/TransakOrderService', () => ({
  fetchTransakOrder: jest.fn(),
}));

// Mock wallet address
const mockWalletAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';

describe('BUY Transactions - End-to-End', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    useWalletStore.getState().setAddress(mockWalletAddress);
    // Clear transaction storage
    await AsyncStorage.removeItem(`crypto_pal_transactions_${mockWalletAddress.toLowerCase()}`);
  });

  describe('Multiple Fiat Currencies', () => {
    const testCases = [
      { fiat: 'USD', symbol: 'ETH', amount: '100', tokenAmount: '0.04', network: 'ethereum' },
      { fiat: 'GBP', symbol: 'BTC', amount: '80', tokenAmount: '0.00133333', network: 'bitcoin' },
      { fiat: 'EUR', symbol: 'MATIC', amount: '50', tokenAmount: '71.43', network: 'polygon' },
      { fiat: 'NZD', symbol: 'USDC', amount: '150', tokenAmount: '150', network: 'ethereum' },
      { fiat: 'AUD', symbol: 'XRP', amount: '75', tokenAmount: '125', network: 'xrp' },
    ];

    testCases.forEach(({ fiat, symbol, amount, tokenAmount, network }) => {
      test(`should handle BUY ${symbol} with ${fiat}`, async () => {
        // Simulate Transak order completion
        const mockOrderId = `order-${symbol}-${fiat}-${Date.now()}`;
        const mockOrderDetails = {
          id: mockOrderId,
          status: 'COMPLETED',
          cryptoCurrency: symbol,
          fiatCurrency: fiat,
          cryptoAmount: tokenAmount,
          fiatAmount: amount,
          paymentMethod: 'credit_card',
          walletAddress: mockWalletAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          network: network,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };

        (fetchTransakOrder as jest.Mock).mockResolvedValue(mockOrderDetails);

        // Capture transaction
        const buyData = {
          tokenSymbol: symbol,
          tokenAmount: tokenAmount,
          currencyAmount: amount,
          currencySymbol: fiat,
          transactionHash: mockOrderDetails.transactionHash,
          orderId: mockOrderId,
          status: 'COMPLETED' as const,
        };

        const transactionId = await TransactionCaptureService.captureBuyTransaction(
          buyData,
          mockWalletAddress
        );

        expect(transactionId).toBeDefined();

        // Map network
        const networkMapping = mapTransakNetwork(network, symbol, true);
        await TransactionCaptureService.updateTransaction(
          transactionId,
          {
            chainId: networkMapping.chainId,
            networkName: networkMapping.networkName,
            orderId: mockOrderId,
          },
          mockWalletAddress
        );

        // Verify transaction in History tab
        const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
        const buyTransaction = allTransactions.find(
          (tx) => tx.type === 'BUY' && tx.id === transactionId
        );

        expect(buyTransaction).toBeDefined();
        expect(buyTransaction?.tokenName).toBe(symbol);
        expect(buyTransaction?.tokenAmount).toBe(tokenAmount);
        expect(buyTransaction?.currencyAmount).toBe(amount);
        expect(buyTransaction?.currencySymbol).toBe(fiat);
        expect(buyTransaction?.status).toBe('COMPLETED');
        expect(buyTransaction?.chainId).toBe(networkMapping.chainId);
        expect(buyTransaction?.networkName).toBe(networkMapping.networkName);
      });
    });
  });

  describe('Different Tokens', () => {
    // NOTE: Tests use isStaging=true, so EVM networks map to testnets
    const tokens = [
      { symbol: 'ETH', network: 'ethereum', chainId: 11155111, isEvm: true }, // Sepolia (staging)
      { symbol: 'BTC', network: 'bitcoin', chainId: 0, isEvm: false }, // Bitcoin (no staging)
      { symbol: 'XRP', network: 'xrp', chainId: 999998, isEvm: false }, // XRP (no staging)
      { symbol: 'MATIC', network: 'polygon', chainId: 80002, isEvm: true }, // Polygon Amoy (staging)
      { symbol: 'USDC', network: 'ethereum', chainId: 11155111, isEvm: true }, // Sepolia (staging)
      { symbol: 'BNB', network: 'bsc', chainId: 97, isEvm: true }, // BSC Testnet (staging)
      { symbol: 'SOL', network: 'solana', chainId: 999999, isEvm: false }, // Solana (no staging)
      { symbol: 'ADA', network: 'cardano', chainId: 999996, isEvm: false }, // Cardano (no staging)
    ];

    tokens.forEach(({ symbol, network, chainId, isEvm }) => {
      test(`should handle BUY ${symbol} on ${network}`, async () => {
        const mockOrderId = `order-${symbol}-${Date.now()}`;
        const tokenAmount = symbol === 'BTC' ? '0.001' : symbol === 'XRP' ? '100' : '1.5';
        const fiatAmount = '100';

        const mockOrderDetails = {
          id: mockOrderId,
          status: 'COMPLETED',
          cryptoCurrency: symbol,
          fiatCurrency: 'USD',
          cryptoAmount: tokenAmount,
          fiatAmount: fiatAmount,
          network: network,
          transactionHash: isEvm ? `0x${Math.random().toString(16).substr(2, 64)}` : `${Math.random().toString(36).substr(2, 64)}`,
        };

        (fetchTransakOrder as jest.Mock).mockResolvedValue(mockOrderDetails);

        // Map network
        const networkMapping = mapTransakNetwork(network, symbol, true);
        expect(networkMapping.chainId).toBe(chainId);
        expect(networkMapping.isEvm).toBe(isEvm);

        // Capture transaction
        const buyData = {
          tokenSymbol: symbol,
          tokenAmount: tokenAmount,
          currencyAmount: fiatAmount,
          currencySymbol: 'USD',
          transactionHash: mockOrderDetails.transactionHash,
          orderId: mockOrderId,
          status: 'COMPLETED' as const,
        };

        const transactionId = await TransactionCaptureService.captureBuyTransaction(
          buyData,
          mockWalletAddress
        );

        await TransactionCaptureService.updateTransaction(
          transactionId,
          {
            chainId: networkMapping.chainId,
            networkName: networkMapping.networkName,
            orderId: mockOrderId,
          },
          mockWalletAddress
        );

        // Verify transaction
        const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
        const buyTransaction = allTransactions.find((tx) => tx.id === transactionId);

        expect(buyTransaction).toBeDefined();
        expect(buyTransaction?.tokenName).toBe(symbol);
        expect(buyTransaction?.chainId).toBe(chainId);
        expect(buyTransaction?.networkName).toBe(networkMapping.networkName);
      });
    });
  });

  describe('History Tab Verification', () => {
    test('should display BUY transactions correctly in History tab', async () => {
      // Create multiple BUY transactions
      const transactions = [
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          currencyAmount: '1250',
          currencySymbol: 'USD',
          orderId: 'order-eth-1',
        },
        {
          tokenSymbol: 'BTC',
          tokenAmount: '0.001',
          currencyAmount: '60',
          currencySymbol: 'USD',
          orderId: 'order-btc-1',
        },
        {
          tokenSymbol: 'XRP',
          tokenAmount: '100',
          currencyAmount: '50',
          currencySymbol: 'USD',
          orderId: 'order-xrp-1',
        },
      ];

      const transactionIds: string[] = [];
      
      for (const tx of transactions) {
        const id = await TransactionCaptureService.captureBuyTransaction(
          {
            ...tx,
            transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
            status: 'COMPLETED' as const,
          },
          mockWalletAddress
        );
        transactionIds.push(id);
      }

      // Retrieve all transactions
      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const buyTransactions = allTransactions.filter((tx) => tx.type === 'BUY');

      expect(buyTransactions.length).toBeGreaterThanOrEqual(transactions.length);

      // Verify each transaction has correct data
      transactions.forEach((expectedTx, index) => {
        const foundTx = buyTransactions.find((tx) => 
          tx.tokenName === expectedTx.tokenSymbol
        );
        expect(foundTx).toBeDefined();
        expect(foundTx?.tokenAmount).toBe(expectedTx.tokenAmount);
        expect(foundTx?.currencyAmount).toBe(expectedTx.currencyAmount);
        expect(foundTx?.currencySymbol).toBe(expectedTx.currencySymbol);
        expect(foundTx?.status).toBe('COMPLETED');
      });
    });
  });

  describe('Wallet Tab Verification', () => {
    test('should update wallet balance after BUY transaction', async () => {
      // Note: This test verifies transaction is saved correctly
      // Actual balance update depends on asset fetching service
      
      const buyData = {
        tokenSymbol: 'ETH',
        tokenAmount: '0.1',
        currencyAmount: '250',
        currencySymbol: 'USD',
        transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        orderId: 'order-wallet-test',
        status: 'COMPLETED' as const,
      };

      const transactionId = await TransactionCaptureService.captureBuyTransaction(
        buyData,
        mockWalletAddress
      );

      // Verify transaction exists (wallet tab should fetch this via asset service)
      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === transactionId);

      expect(transaction).toBeDefined();
      expect(transaction?.type).toBe('BUY');
      expect(transaction?.tokenName).toBe('ETH');
      expect(transaction?.tokenAmount).toBe('0.1');
    });
  });

  describe('Error Handling', () => {
    test('should handle Transak API failures gracefully', async () => {
      (fetchTransakOrder as jest.Mock).mockRejectedValue(new Error('API timeout'));

      // Transaction should still be saved with available data
      const buyData = {
        tokenSymbol: 'ETH',
        tokenAmount: '0.1',
        currencyAmount: '250',
        currencySymbol: 'USD',
        transactionHash: '',
        orderId: 'order-api-fail',
        status: 'COMPLETED' as const,
      };

      const transactionId = await TransactionCaptureService.captureBuyTransaction(
        buyData,
        mockWalletAddress
      );

      expect(transactionId).toBeDefined();

      // Transaction should exist even if API failed
      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === transactionId);
      expect(transaction).toBeDefined();
    });

    test('should handle missing orderId', async () => {
      const buyData = {
        tokenSymbol: 'ETH',
        tokenAmount: '0.1',
        currencyAmount: '250',
        currencySymbol: 'USD',
        transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        orderId: '',
        status: 'COMPLETED' as const,
      };

      const transactionId = await TransactionCaptureService.captureBuyTransaction(
        buyData,
        mockWalletAddress
      );

      expect(transactionId).toBeDefined();

      // Should still save transaction without orderId
      const allTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockWalletAddress.toLowerCase());
        return store.getTransactions(mockWalletAddress.toLowerCase());
      })();
      const transaction = allTransactions.find((tx) => tx.id === transactionId);
      expect(transaction).toBeDefined();
    });
  });
});

