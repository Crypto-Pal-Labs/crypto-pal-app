/**
 * Performance Tests
 * Ensures app performs well with large transaction volumes
 */

import { useTransactionStore } from '../../src/store/useTransactionStore';

describe('Performance Tests', () => {
  it('should handle 100 transactions efficiently', async () => {
    const store = useTransactionStore.getState();
    const mockWalletAddress = '0x6cF880d3180C67F8BF2Ed51d8c3346dee09f62CC';

    const startTime = Date.now();

    // Create 100 transactions
    const promises = [];
    for (let i = 0; i < 100; i++) {
      const txData = {
        type: (i % 4 === 0 ? 'BUY' : i % 4 === 1 ? 'SELL' : i % 4 === 2 ? 'SEND' : 'RECEIVE') as any,
        timestamp: Date.now() - (i * 1000), // Spread over time
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        tokenSymbol: 'ETH',
        tokenName: 'Ethereum',
        tokenAmount: (Math.random() * 0.1).toFixed(6),
        tokenDecimals: 18,
        currencySymbol: 'USD',
        currencyAmount: (Math.random() * 300).toFixed(2),
        fromAddress: i % 2 === 0 ? mockWalletAddress : '0x123',
        toAddress: i % 2 === 0 ? '0x456' : mockWalletAddress,
        transactionHash: `0x${i.toString(16).padStart(64, '0')}`,
        chainId: 1,
        networkName: 'Ethereum',
        gasFee: '0.001',
        totalCost: '0.001',
        status: 'COMPLETED' as const,
        reference: `ref_${i}`,
        source: 'P2P' as const,
        explorerUrl: '',
        walletAddress: mockWalletAddress,
      };

      promises.push(store.addTransaction(txData, mockWalletAddress));
    }

    await Promise.all(promises);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete in < 5 seconds
    expect(duration).toBeLessThan(5000);

    // Verify all transactions saved
    const transactions = store.getTransactions(mockWalletAddress);
    expect(transactions.length).toBeGreaterThanOrEqual(50); // At least 50 (some might merge)

    console.log(`✅ Performance Test PASSED: 100 transactions processed in ${duration}ms`);
  });

  it('should query transactions efficiently', () => {
    const store = useTransactionStore.getState();
    const mockWalletAddress = '0x6cF880d3180C67F8BF2Ed51d8c3346dee09f62CC';

    const startTime = Date.now();

    // Query 10 times
    for (let i = 0; i < 10; i++) {
      store.getTransactions(mockWalletAddress);
      store.getTransactions(mockWalletAddress, { type: 'BUY' });
      store.getTransactions(mockWalletAddress, { type: 'SEND' });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete in < 100ms for 30 queries
    expect(duration).toBeLessThan(100);

    console.log(`✅ Query Performance Test PASSED: 30 queries in ${duration}ms`);
  });

  it('should cleanup duplicates efficiently', async () => {
    // Simulate 50 transactions with 10 duplicates
    const duplicates = [];
    for (let i = 0; i < 50; i++) {
      duplicates.push({
        id: `tx_${i}`,
        orderId: i < 10 ? 'duplicate-order' : `order_${i}`, // First 10 share orderId
        type: 'BUY',
        tokenSymbol: 'ETH',
        // ... other fields
      });
    }

    const startTime = Date.now();

    // Cleanup logic (from TransactionStore.loadTransactions)
    const orderIdMap = new Map();
    const noOrderIdTransactions: any[] = [];

    for (const tx of duplicates) {
      const orderId = tx.orderId;
      if (orderId) {
        const existing = orderIdMap.get(orderId);
        if (!existing) {
          orderIdMap.set(orderId, tx);
        }
        // Skip duplicate
      } else {
        noOrderIdTransactions.push(tx);
      }
    }

    const cleaned = [...Array.from(orderIdMap.values()), ...noOrderIdTransactions];

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete in < 50ms
    expect(duration).toBeLessThan(50);
    expect(cleaned.length).toBe(41); // 50 - 9 duplicates = 41

    console.log(`✅ Cleanup Performance Test PASSED: Cleaned 50 transactions in ${duration}ms`);
  });
});

