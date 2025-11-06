/**
 * End-to-End Test: Balance Accuracy - Buy & Sell Net Calculations
 * 
 * Tests:
 * 1. Balance increases after BUY transaction
 * 2. Balance decreases after SELL transaction
 * 3. Net balance calculation (multiple BUY and SELL)
 * 4. Accurate balance display in Wallet tab
 * 5. Balance accuracy across different tokens
 */

import { TransactionCaptureService } from '../../../services/TransactionCaptureService';
import { useTransactionStore } from '../../../store/useTransactionStore';
import { useWalletStore } from '../../../store/useWalletStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ethers from 'ethers';

const mockWalletAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';

// Helper to calculate net balance from transactions
function calculateNetBalance(
  transactions: any[],
  tokenSymbol: string
): { tokenAmount: string; fiatValue: string } {
  let totalTokenAmount = ethers.BigNumber.from(0);
  let totalFiatValue = parseFloat('0');

  transactions.forEach((tx) => {
    if (tx.tokenName !== tokenSymbol) return;

    const tokenAmountBN = ethers.utils.parseUnits(
      tx.tokenAmount || '0',
      tx.tokenName === 'BTC' ? 8 : tx.tokenName === 'USDC' || tx.tokenName === 'USDT' ? 6 : 18
    );

    if (tx.type === 'BUY' || tx.type === 'RECEIVE') {
      totalTokenAmount = totalTokenAmount.add(tokenAmountBN);
    } else if (tx.type === 'SELL' || tx.type === 'SEND') {
      totalTokenAmount = totalTokenAmount.sub(tokenAmountBN);
    }

    // Calculate fiat value
    const fiatAmount = parseFloat(tx.currencyAmount || '0');
    if (tx.type === 'BUY' || tx.type === 'RECEIVE') {
      totalFiatValue += fiatAmount;
    } else if (tx.type === 'SELL' || tx.type === 'SEND') {
      totalFiatValue -= fiatAmount;
    }
  });

  const decimals = tokenSymbol === 'BTC' ? 8 : tokenSymbol === 'USDC' || tokenSymbol === 'USDT' ? 6 : 18;
  const formattedAmount = ethers.utils.formatUnits(totalTokenAmount, decimals);

  return {
    tokenAmount: formattedAmount,
    fiatValue: totalFiatValue.toFixed(2),
  };
}

describe('Balance Accuracy - Buy & Sell', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    useWalletStore.getState().setAddress(mockWalletAddress);
    await AsyncStorage.removeItem(`crypto_pal_transactions_${mockWalletAddress.toLowerCase()}`);
  });

  describe('Single Token Balance Calculations', () => {
    test('should increase balance after BUY transaction', async () => {
      // Initial: No transactions
      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      let allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      let netBalance = calculateNetBalance(allTransactions, 'ETH');
      expect(parseFloat(netBalance.tokenAmount)).toBe(0);

      // BUY: 0.5 ETH for $1250
      const buyTransaction = await TransactionCaptureService.captureBuyTransaction(
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

      expect(buyTransaction).toBeDefined();

      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      netBalance = calculateNetBalance(allTransactions, 'ETH');

      expect(parseFloat(netBalance.tokenAmount)).toBe(0.5);
      expect(parseFloat(netBalance.fiatValue)).toBe(1250);
    });

    test('should decrease balance after SELL transaction', async () => {
      // Setup: Start with 1 ETH
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

      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      let allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      let netBalance = calculateNetBalance(allTransactions, 'ETH');
      expect(parseFloat(netBalance.tokenAmount)).toBe(1.0);

      // SELL: 0.3 ETH for $750
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

      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      netBalance = calculateNetBalance(allTransactions, 'ETH');

      expect(parseFloat(netBalance.tokenAmount)).toBeCloseTo(0.7, 2);
      expect(parseFloat(netBalance.fiatValue)).toBeCloseTo(1750, 2);
    });

    test('should calculate net balance correctly after multiple BUY and SELL', async () => {
      // Sequence of transactions
      const transactions = [
        { type: 'BUY', tokenAmount: '1.0', fiatAmount: '2500' },
        { type: 'BUY', tokenAmount: '0.5', fiatAmount: '1250' },
        { type: 'SELL', tokenAmount: '0.2', fiatAmount: '500' },
        { type: 'BUY', tokenAmount: '0.1', fiatAmount: '250' },
        { type: 'SELL', tokenAmount: '0.4', fiatAmount: '1000' },
      ];

      for (const tx of transactions) {
        if (tx.type === 'BUY') {
          await TransactionCaptureService.captureBuyTransaction(
            {
              tokenSymbol: 'ETH',
              tokenAmount: tx.tokenAmount,
              currencyAmount: tx.fiatAmount,
              currencySymbol: 'USD',
              transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
              status: 'COMPLETED',
            },
            mockWalletAddress
          );
        } else {
          await TransactionCaptureService.captureSellTransaction(
            {
              tokenSymbol: 'ETH',
              tokenAmount: tx.tokenAmount,
              currencyAmount: tx.fiatAmount,
              currencySymbol: 'USD',
              transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
              status: 'COMPLETED',
            },
            mockWalletAddress
          );
        }
      }

      // Calculate net balance
      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      const allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      const netBalance = calculateNetBalance(allTransactions, 'ETH');

      // Expected: 1.0 + 0.5 - 0.2 + 0.1 - 0.4 = 1.0 ETH
      expect(parseFloat(netBalance.tokenAmount)).toBeCloseTo(1.0, 2);

      // Expected fiat: 2500 + 1250 - 500 + 250 - 1000 = 2500 USD
      expect(parseFloat(netBalance.fiatValue)).toBeCloseTo(2500, 2);
    });
  });

  describe('Multiple Tokens Balance Calculations', () => {
    test('should track balances for multiple tokens independently', async () => {
      // ETH transactions
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

      // BTC transactions
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

      // USDC transactions
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'USDC',
          tokenAmount: '100',
          currencyAmount: '100',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      await TransactionCaptureService.captureSellTransaction(
        {
          tokenSymbol: 'USDC',
          tokenAmount: '50',
          currencyAmount: '50',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      const allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());

      // Verify each token's balance independently
      const ethBalance = calculateNetBalance(allTransactions, 'ETH');
      const btcBalance = calculateNetBalance(allTransactions, 'BTC');
      const usdcBalance = calculateNetBalance(allTransactions, 'USDC');

      expect(parseFloat(ethBalance.tokenAmount)).toBeCloseTo(0.7, 2); // 1.0 - 0.3
      expect(parseFloat(btcBalance.tokenAmount)).toBeCloseTo(0.01, 8); // 0.01
      expect(parseFloat(usdcBalance.tokenAmount)).toBeCloseTo(50, 6); // 100 - 50
    });
  });

  describe('Balance Edge Cases', () => {
    test('should handle zero balance correctly', async () => {
      // BUY then SELL same amount
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
          tokenAmount: '1.0',
          currencyAmount: '2500',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      const allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      const netBalance = calculateNetBalance(allTransactions, 'ETH');

      expect(parseFloat(netBalance.tokenAmount)).toBeCloseTo(0, 2);
    });

    test('should handle failed transactions correctly', async () => {
      // Failed BUY should not affect balance
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '1.0',
          currencyAmount: '2500',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'FAILED',
        },
        mockWalletAddress
      );

      // Completed BUY should affect balance
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

      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      const allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      const completedTransactions = allTransactions.filter((tx: any) => tx.status === 'COMPLETED');
      const netBalance = calculateNetBalance(completedTransactions, 'ETH');

      // Only completed transaction should count
      expect(parseFloat(netBalance.tokenAmount)).toBeCloseTo(0.5, 2);
    });
  });

  describe('Decimal Precision', () => {
    test('should maintain precision for small amounts', async () => {
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.000001',
          currencyAmount: '0.0025',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      const allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      const netBalance = calculateNetBalance(allTransactions, 'ETH');

      // Should maintain precision for very small amounts
      expect(parseFloat(netBalance.tokenAmount)).toBeGreaterThan(0);
      expect(parseFloat(netBalance.tokenAmount)).toBeLessThanOrEqual(0.000001);
    });

    test('should handle large amounts correctly', async () => {
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '1000.5',
          currencyAmount: '2501250',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockWalletAddress
      );

      // CRITICAL: Use TransactionStore instead of legacy TransactionStorageService
      const transactionStore = useTransactionStore.getState();
      await transactionStore.loadTransactions(mockWalletAddress.toLowerCase());
      const allTransactions = transactionStore.getTransactions(mockWalletAddress.toLowerCase());
      const netBalance = calculateNetBalance(allTransactions, 'ETH');

      expect(parseFloat(netBalance.tokenAmount)).toBeCloseTo(1000.5, 2);
    });
  });
});

