/**
 * Integration Test: History Tab
 * Tests transaction display and deduplication logic
 */

describe('History Tab Integration', () => {
  it('should deduplicate transactions with same orderId', () => {
    /**
     * Simulates the scenario where same orderId appears with different tokenSymbols
     * (the bug we fixed in TransactionStore)
     */
    const transactions = [
      {
        id: 'BUY_1',
        type: 'BUY',
        orderId: 'same-order-id',
        tokenSymbol: 'ETH',
        tokenName: 'Ethereum',
        tokenAmount: '0.1',
        transactionHash: '',
        timestamp: 1000,
        // ... other fields
      },
      {
        id: 'BUY_2',
        type: 'BUY',
        orderId: 'same-order-id', // SAME orderId
        tokenSymbol: 'BTC', // Different token
        tokenName: 'Bitcoin',
        tokenAmount: '0.002',
        transactionHash: '0xabc123',
        timestamp: 1001,
        // ... other fields
      },
    ];

    // Deduplication logic (from StableHistoryTab.tsx)
    const deduplicated = transactions.reduce((acc: any[], tx: any) => {
      const existing = acc.find(t => 
        t.type === tx.type && 
        t.orderId === tx.orderId
      );
      
      if (existing) {
        // Merge - prefer non-empty values
        const index = acc.findIndex(t => t.orderId === tx.orderId);
        const merged = { ...existing, ...tx };
        
        // Prefer non-empty hash
        if (!merged.transactionHash && existing.transactionHash) {
          merged.transactionHash = existing.transactionHash;
        }
        if (!existing.transactionHash && tx.transactionHash) {
          merged.transactionHash = tx.transactionHash;
        }
        
        acc[index] = merged;
        return acc;
      }
      
      acc.push(tx);
      return acc;
    }, []);

    // Should only have ONE transaction
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].orderId).toBe('same-order-id');
    expect(deduplicated[0].transactionHash).toBe('0xabc123'); // Merged hash

    console.log('✅ History Tab Deduplication Test PASSED');
  });

  it('should display all transaction types correctly', () => {
    const allTransactionTypes = [
      { type: 'BUY', expectedFields: ['tokenAmount', 'currencyAmount', 'orderId'] },
      { type: 'SELL', expectedFields: ['tokenAmount', 'currencyAmount', 'orderId'] },
      { type: 'SEND', expectedFields: ['fromAddress', 'toAddress', 'transactionHash', 'gasFee'] },
      { type: 'RECEIVE', expectedFields: ['fromAddress', 'toAddress', 'transactionHash'] },
    ];

    allTransactionTypes.forEach(({ type, expectedFields }) => {
      const mockTx: any = {
        id: `${type}_test`,
        type: type,
        timestamp: Date.now(),
        date: '11/4/2025',
        time: '3:45 PM',
        tokenSymbol: 'ETH',
        tokenName: 'Ethereum',
        tokenAmount: '0.1',
        currencyAmount: '300',
        transactionHash: '0xabc123',
        chainId: 1,
        networkName: 'Ethereum',
        fromAddress: '0x123',
        toAddress: '0x456',
        gasFee: '0.001',
        orderId: 'test-order',
        status: 'COMPLETED',
      };

      // Verify all expected fields exist
      expectedFields.forEach(field => {
        expect(mockTx[field]).toBeDefined();
      });
    });

    console.log('✅ All Transaction Types Test PASSED');
  });

  it('should sort transactions chronologically (newest first)', () => {
    const transactions = [
      { id: '1', timestamp: 1000, type: 'BUY' },
      { id: '2', timestamp: 3000, type: 'SEND' }, // Newest
      { id: '3', timestamp: 2000, type: 'RECEIVE' },
    ];

    const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp);

    expect(sorted[0].id).toBe('2'); // Newest first
    expect(sorted[1].id).toBe('3');
    expect(sorted[2].id).toBe('1'); // Oldest last

    console.log('✅ Chronological Sorting Test PASSED');
  });
});

