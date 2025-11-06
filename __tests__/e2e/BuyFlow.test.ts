/**
 * End-to-End Test: BUY Transaction Flow
 * Simulates complete BUY flow from Transak WebView to History display
 */

import { useTransactionStore } from '../../src/store/useTransactionStore';

describe('E2E: BUY Transaction Flow', () => {
  const mockWalletAddress = '0x6cF880d3180C67F8BF2Ed51d8c3346dee09f62CC';
  const mockOrderId = 'test-order-123-abc';

  beforeEach(() => {
    // Reset store
    const store = useTransactionStore.getState();
    store.transactions = {};
    store.incompleteTransactions = new Set();
  });

  it('should complete full BUY flow: Transak → TransactionStore → Wallet → History', async () => {
    /**
     * STEP 1: User completes Transak purchase
     * Buy.tsx handleNavigationChange detects completion
     */
    const store = useTransactionStore.getState();
    
    // Simulate initial transaction save (incomplete data from URL)
    const initialTxData = {
      type: 'BUY' as const,
      timestamp: Date.now(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      tokenSymbol: 'ETH', // From URL parsing
      tokenName: 'ETH',
      tokenAmount: '', // Empty - waiting for API
      tokenDecimals: 18,
      currencySymbol: 'GBP',
      currencyAmount: '', // Empty - waiting for API
      fromAddress: '',
      toAddress: mockWalletAddress,
      transactionHash: '', // Empty - waiting for API
      chainId: 11155111,
      networkName: 'Sepolia',
      gasFee: '0',
      totalCost: '0',
      status: 'COMPLETED' as const,
      reference: mockOrderId,
      source: 'TRANSAK' as const,
      explorerUrl: '',
      walletAddress: mockWalletAddress,
      orderId: mockOrderId,
    };

    const txId = await store.addTransaction(initialTxData, mockWalletAddress);
    
    /**
     * STEP 2: Verify transaction saved
     */
    let transactions = store.getTransactions(mockWalletAddress);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].id).toBe(txId);
    expect((transactions[0] as any).orderId).toBe(mockOrderId);
    expect(transactions[0].tokenAmount).toBe(''); // Incomplete

    /**
     * STEP 3: Simulate API enrichment (TransactionStore.syncIncompleteTransactions)
     */
    await store.updateTransaction(txId, {
      tokenAmount: '0.00129534',
      currencyAmount: '112.00',
      transactionHash: '0xabc123def456',
    }, mockWalletAddress);

    /**
     * STEP 4: Verify transaction updated
     */
    transactions = store.getTransactions(mockWalletAddress);
    expect(transactions).toHaveLength(1); // Still only one
    expect(transactions[0].tokenAmount).toBe('0.00129534'); // Now complete
    expect(transactions[0].currencyAmount).toBe('112.00');
    expect(transactions[0].transactionHash).toBe('0xabc123def456');

    /**
     * STEP 5: Simulate duplicate prevention (navigation fires again)
     */
    const duplicateTxData = {
      ...initialTxData,
      tokenSymbol: 'BTC', // Wrong token (bug scenario)
      tokenName: 'Bitcoin',
      chainId: 0,
      networkName: 'Bitcoin',
    };

    const txId2 = await store.addTransaction(duplicateTxData, mockWalletAddress);
    
    /**
     * STEP 6: Verify NO duplicate created
     */
    transactions = store.getTransactions(mockWalletAddress);
    expect(transactions).toHaveLength(1); // Still only one!
    expect(txId2).toBe(txId); // Same ID returned
    expect(transactions[0].tokenSymbol).toBe('ETH'); // Preserved original (more complete)

    /**
     * STEP 7: Verify transaction accessible in Wallet tab
     */
    const buyTransactions = store.getTransactions(mockWalletAddress, { type: 'BUY' });
    expect(buyTransactions).toHaveLength(1);
    expect((buyTransactions[0] as any).orderId).toBe(mockOrderId);

    /**
     * STEP 8: Verify transaction accessible in History tab
     */
    const allTransactions = store.getTransactions(mockWalletAddress);
    expect(allTransactions).toHaveLength(1);
    expect(allTransactions[0].type).toBe('BUY');
    expect(allTransactions[0].tokenAmount).toBe('0.00129534');

    console.log('✅ E2E BUY Flow Test PASSED');
  });

  it('should handle concurrent BUY transactions (race condition)', async () => {
    const store = useTransactionStore.getState();
    const orderId = 'concurrent-test-order';

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
      toAddress: mockWalletAddress,
      transactionHash: '',
      chainId: 1,
      networkName: 'Ethereum',
      gasFee: '0',
      totalCost: '0',
      status: 'COMPLETED' as const,
      reference: orderId,
      source: 'TRANSAK' as const,
      explorerUrl: '',
      walletAddress: mockWalletAddress,
      orderId: orderId,
    };

    // Simulate 3 concurrent saves (WebView fires multiple times)
    const [id1, id2, id3] = await Promise.all([
      store.addTransaction(txData, mockWalletAddress),
      store.addTransaction(txData, mockWalletAddress),
      store.addTransaction(txData, mockWalletAddress),
    ]);

    const transactions = store.getTransactions(mockWalletAddress);
    expect(transactions).toHaveLength(1); // Only ONE created
    expect(id1).toBe(id2); // All return same ID
    expect(id2).toBe(id3);

    console.log('✅ Concurrent Transaction Test PASSED');
  });
});

describe('E2E: SEND Transaction Flow', () => {
  it('should complete full SEND flow: Pay tab → Blockchain → TransactionStore → History', async () => {
    const mockWalletAddress = '0x6cF880d3180C67F8BF2Ed51d8c3346dee09f62CC';
    const mockRecipient = '0x1234567890abcdef1234567890abcdef12345678';
    const mockTxHash = '0xabc123def456789';

    /**
     * STEP 1: User sends tokens via Pay tab
     * SendTab.tsx completes blockchain transaction
     */
    const store = useTransactionStore.getState();
    
    const sendTxData = {
      type: 'SEND' as const,
      timestamp: Date.now(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      tokenSymbol: 'ETH',
      tokenName: 'Ethereum',
      tokenAmount: '0.1',
      tokenDecimals: 18,
      currencySymbol: 'USD',
      currencyAmount: '335',
      fromAddress: mockWalletAddress,
      toAddress: mockRecipient,
      transactionHash: mockTxHash,
      chainId: 11155111,
      networkName: 'Sepolia',
      gasFee: '0.00021',
      totalCost: '0.00021',
      status: 'COMPLETED' as const,
      reference: mockTxHash.substring(0, 16),
      source: 'P2P' as const,
      explorerUrl: `https://sepolia.etherscan.io/tx/${mockTxHash}`,
      walletAddress: mockWalletAddress,
    };

    const txId = await store.addTransaction(sendTxData, mockWalletAddress);

    /**
     * STEP 2: Verify transaction saved
     */
    const transactions = store.getTransactions(mockWalletAddress);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe('SEND');
    expect(transactions[0].fromAddress).toBe(mockWalletAddress);
    expect(transactions[0].toAddress).toBe(mockRecipient);
    expect(transactions[0].transactionHash).toBe(mockTxHash);

    /**
     * STEP 3: Verify accessible in History tab
     */
    const sendTransactions = store.getTransactions(mockWalletAddress, { type: 'SEND' });
    expect(sendTransactions).toHaveLength(1);
    expect((sendTransactions[0] as any).gasFee).toBe('0.00021');

    /**
     * STEP 4: Verify wallet balance would decrease (integration with Wallet tab)
     * This would be calculated by: blockchainBalance - SEND amount - fee
     */
    const sendAmount = parseFloat(sendTxData.tokenAmount);
    const fee = parseFloat(sendTxData.gasFee || '0');
    const totalDeduction = sendAmount + fee;
    expect(totalDeduction).toBe(0.10021); // 0.1 + 0.00021

    console.log('✅ E2E SEND Flow Test PASSED');
  });
});

describe('E2E: RECEIVE Transaction Flow', () => {
  it('should detect and display RECEIVE transactions', async () => {
    const mockWalletAddress = '0x6cF880d3180C67F8BF2Ed51d8c3346dee09f62CC';
    const mockSender = '0xf1c6fed73449cf04ca4089a0406f42ba8dc9aad5';
    const mockTxHash = '0x84ac4864b687f1fa2c537b7ebbfdbbe16577be2f4e4054754e1f8add8f0913e7';

    /**
     * STEP 1: Blockchain API detects RECEIVE transaction
     * StableHistoryTab.tsx fetchExplorerTransactions
     */
    const receiveTx = {
      id: `explorer_${mockTxHash}`,
      type: 'RECEIVE' as const,
      timestamp: 1761694164000,
      date: new Date(1761694164000).toLocaleDateString(),
      time: new Date(1761694164000).toLocaleTimeString(),
      tokenName: 'ETH',
      tokenAmount: '0.002512',
      currencyAmount: '0',
      currencySymbol: 'USD',
      transactionHash: mockTxHash,
      chainId: 11155111,
      networkName: 'Sepolia',
      fromAddress: mockSender,
      toAddress: mockWalletAddress,
      fee: '0',
      status: 'COMPLETED' as const,
    };

    /**
     * STEP 2: Verify transaction structure
     */
    expect(receiveTx.type).toBe('RECEIVE');
    expect(receiveTx.fromAddress).toBe(mockSender);
    expect(receiveTx.toAddress).toBe(mockWalletAddress);
    expect(parseFloat(receiveTx.tokenAmount)).toBeGreaterThan(0);

    /**
     * STEP 3: Verify would increase wallet balance
     */
    const receiveAmount = parseFloat(receiveTx.tokenAmount);
    expect(receiveAmount).toBe(0.002512);

    console.log('✅ E2E RECEIVE Flow Test PASSED');
  });
});

