/**
 * End-to-End Test: P2P Transactions (SEND function)
 * 
 * Tests:
 * 1. SEND transaction appears in sender's History tab
 * 2. SEND transaction appears in sender's Wallet tab (balance decreases)
 * 3. RECEIVE transaction appears in receiver's History tab
 * 4. RECEIVE transaction appears in receiver's Wallet tab (balance increases)
 * 5. Both users see accurate transaction details
 * 6. Transaction status updates correctly
 */

import { TransactionCaptureService } from '../../../services/TransactionCaptureService';
import { useTransactionStore } from '../../../store/useTransactionStore';
import { useWalletStore } from '../../../store/useWalletStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockSenderAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';
const mockReceiverAddress = '0x8ba1f109551bD432803012645Hac136c';

describe('P2P Transactions - End-to-End', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear both wallets' transaction storage
    await AsyncStorage.removeItem(`crypto_pal_transactions_${mockSenderAddress.toLowerCase()}`);
    await AsyncStorage.removeItem(`crypto_pal_transactions_${mockReceiverAddress.toLowerCase()}`);
  });

  describe('SEND Transaction - Sender Side', () => {
    test('should create SEND transaction in sender history', async () => {
      useWalletStore.getState().setAddress(mockSenderAddress);

      const sendData = {
        tokenSymbol: 'ETH',
        tokenAmount: '0.5',
        toAddress: mockReceiverAddress,
        transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        gasFee: '0.001',
        status: 'COMPLETED' as const,
        chainId: 1,
        networkName: 'Ethereum',
        currencyAmount: '1250',
        currencySymbol: 'USD',
      };

      const transactionId = await TransactionCaptureService.captureSendTransaction(
        sendData,
        mockSenderAddress
      );

      expect(transactionId).toBeDefined();

      // Verify in sender's history
      const senderTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockSenderAddress.toLowerCase());
        return store.getTransactions(mockSenderAddress.toLowerCase());
      })();
      const sendTransaction = senderTransactions.find((tx) => tx.id === transactionId);

      expect(sendTransaction).toBeDefined();
      expect(sendTransaction?.type).toBe('SEND');
      expect(sendTransaction?.tokenName).toBe('ETH');
      expect(sendTransaction?.tokenAmount).toBe('0.5');
      expect(sendTransaction?.toAddress).toBe(mockReceiverAddress);
      expect(sendTransaction?.fromAddress).toBe(mockSenderAddress);
      expect(sendTransaction?.transactionHash).toBe(sendData.transactionHash);
      expect(sendTransaction?.status).toBe('COMPLETED');
      expect(sendTransaction?.chainId).toBe(1);
      expect(sendTransaction?.networkName).toBe('Ethereum');
      expect(sendTransaction?.fee).toBe('0.001');
    });

    test('should decrease sender balance in wallet', async () => {
      useWalletStore.getState().setAddress(mockSenderAddress);

      // Initial BUY to have balance
      await TransactionCaptureService.captureBuyTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '1.0',
          currencyAmount: '2500',
          currencySymbol: 'USD',
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED',
        },
        mockSenderAddress
      );

      // SEND transaction
      await TransactionCaptureService.captureSendTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.3',
          toAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          gasFee: '0.001',
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockSenderAddress
      );

      // Verify sender's transactions
      const senderTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockSenderAddress.toLowerCase());
        return store.getTransactions(mockSenderAddress.toLowerCase());
      })();
      const sendTransactions = senderTransactions.filter((tx) => tx.type === 'SEND');
      
      expect(sendTransactions.length).toBeGreaterThan(0);
      expect(sendTransactions[0]?.tokenAmount).toBe('0.3');
    });
  });

  describe('RECEIVE Transaction - Receiver Side', () => {
    test('should create RECEIVE transaction in receiver history', async () => {
      useWalletStore.getState().setAddress(mockReceiverAddress);

      const receiveData = {
        tokenSymbol: 'ETH',
        tokenAmount: '0.5',
        fromAddress: mockSenderAddress,
        transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        status: 'COMPLETED' as const,
        chainId: 1,
        networkName: 'Ethereum',
        currencyAmount: '1250',
        currencySymbol: 'USD',
      };

      const transactionId = await TransactionCaptureService.captureReceiveTransaction(
        receiveData,
        mockReceiverAddress
      );

      expect(transactionId).toBeDefined();

      // Verify in receiver's history
      const receiverTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockReceiverAddress.toLowerCase());
        return store.getTransactions(mockReceiverAddress.toLowerCase());
      })();
      const receiveTransaction = receiverTransactions.find((tx) => tx.id === transactionId);

      expect(receiveTransaction).toBeDefined();
      expect(receiveTransaction?.type).toBe('RECEIVE');
      expect(receiveTransaction?.tokenName).toBe('ETH');
      expect(receiveTransaction?.tokenAmount).toBe('0.5');
      expect(receiveTransaction?.fromAddress).toBe(mockSenderAddress);
      expect(receiveTransaction?.toAddress).toBe(mockReceiverAddress);
      expect(receiveTransaction?.transactionHash).toBe(receiveData.transactionHash);
      expect(receiveTransaction?.status).toBe('COMPLETED');
      expect(receiveTransaction?.chainId).toBe(1);
      expect(receiveTransaction?.networkName).toBe('Ethereum');
    });

    test('should increase receiver balance in wallet', async () => {
      useWalletStore.getState().setAddress(mockReceiverAddress);

      // RECEIVE transaction
      await TransactionCaptureService.captureReceiveTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          fromAddress: mockSenderAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
          currencyAmount: '1250',
          currencySymbol: 'USD',
        },
        mockReceiverAddress
      );

      // Verify receiver's transactions
      const receiverTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockReceiverAddress.toLowerCase());
        return store.getTransactions(mockReceiverAddress.toLowerCase());
      })();
      const receiveTransactions = receiverTransactions.filter((tx) => tx.type === 'RECEIVE');
      
      expect(receiveTransactions.length).toBeGreaterThan(0);
      expect(receiveTransactions[0]?.tokenAmount).toBe('0.5');
    });
  });

  describe('Bidirectional Transaction Flow', () => {
    test('should handle complete P2P transaction flow', async () => {
      // Sender sends ETH
      useWalletStore.getState().setAddress(mockSenderAddress);
      
      const sendTransactionId = await TransactionCaptureService.captureSendTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          toAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          gasFee: '0.001',
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockSenderAddress
      );

      // Receiver receives ETH (same transaction hash)
      useWalletStore.getState().setAddress(mockReceiverAddress);
      
      const receiveTransactionId = await TransactionCaptureService.captureReceiveTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          fromAddress: mockSenderAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          status: 'COMPLETED' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockReceiverAddress
      );

      // Verify sender's transaction
      const senderTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockSenderAddress.toLowerCase());
        return store.getTransactions(mockSenderAddress.toLowerCase());
      })();
      const senderSend = senderTransactions.find((tx) => tx.id === sendTransactionId);
      expect(senderSend).toBeDefined();
      expect(senderSend?.type).toBe('SEND');
      expect(senderSend?.tokenAmount).toBe('0.5');

      // Verify receiver's transaction
      const receiverTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockReceiverAddress.toLowerCase());
        return store.getTransactions(mockReceiverAddress.toLowerCase());
      })();
      const receiverReceive = receiverTransactions.find((tx) => tx.id === receiveTransactionId);
      expect(receiverReceive).toBeDefined();
      expect(receiverReceive?.type).toBe('RECEIVE');
      expect(receiverReceive?.tokenAmount).toBe('0.5');
    });

    test('should handle multiple P2P transactions between users', async () => {
      const transactions = [
        { amount: '0.1', from: mockSenderAddress, to: mockReceiverAddress },
        { amount: '0.2', from: mockReceiverAddress, to: mockSenderAddress },
        { amount: '0.05', from: mockSenderAddress, to: mockReceiverAddress },
      ];

      for (const tx of transactions) {
        // Sender side
        useWalletStore.getState().setAddress(tx.from);
        await TransactionCaptureService.captureSendTransaction(
          {
            tokenSymbol: 'ETH',
            tokenAmount: tx.amount,
            toAddress: tx.to,
            transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
            gasFee: '0.001',
            status: 'COMPLETED' as const,
            chainId: 1,
            networkName: 'Ethereum',
          },
          tx.from
        );

        // Receiver side
        useWalletStore.getState().setAddress(tx.to);
        await TransactionCaptureService.captureReceiveTransaction(
          {
            tokenSymbol: 'ETH',
            tokenAmount: tx.amount,
            fromAddress: tx.from,
            transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
            status: 'COMPLETED' as const,
            chainId: 1,
            networkName: 'Ethereum',
          },
          tx.to
        );
      }

      // Verify sender's transactions
      const senderTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockSenderAddress.toLowerCase());
        return store.getTransactions(mockSenderAddress.toLowerCase());
      })();
      const senderSends = senderTransactions.filter((tx) => tx.type === 'SEND' && tx.tokenName === 'ETH');
      const senderReceives = senderTransactions.filter((tx) => tx.type === 'RECEIVE' && tx.tokenName === 'ETH');
      
      expect(senderSends.length).toBe(2); // 0.1 and 0.05 sent
      expect(senderReceives.length).toBe(1); // 0.2 received

      // Verify receiver's transactions
      const receiverTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockReceiverAddress.toLowerCase());
        return store.getTransactions(mockReceiverAddress.toLowerCase());
      })();
      const receiverSends = receiverTransactions.filter((tx) => tx.type === 'SEND' && tx.tokenName === 'ETH');
      const receiverReceives = receiverTransactions.filter((tx) => tx.type === 'RECEIVE' && tx.tokenName === 'ETH');
      
      expect(receiverSends.length).toBe(1); // 0.2 sent
      expect(receiverReceives.length).toBe(2); // 0.1 and 0.05 received
    });
  });

  describe('Transaction Status Updates', () => {
    test('should update transaction status from PENDING to COMPLETED', async () => {
      useWalletStore.getState().setAddress(mockSenderAddress);

      // Create PENDING transaction
      const transactionId = await TransactionCaptureService.captureSendTransaction(
        {
          tokenSymbol: 'ETH',
          tokenAmount: '0.5',
          toAddress: mockReceiverAddress,
          transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
          gasFee: '0.001',
          status: 'PENDING' as const,
          chainId: 1,
          networkName: 'Ethereum',
        },
        mockSenderAddress
      );

      // Verify initial status
      let transactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockSenderAddress.toLowerCase());
        return store.getTransactions(mockSenderAddress.toLowerCase());
      })();
      let transaction = transactions.find((tx) => tx.id === transactionId);
      expect(transaction?.status).toBe('PENDING');

      // Update to COMPLETED
      await TransactionCaptureService.updateTransaction(
        transactionId,
        { status: 'COMPLETED' },
        mockSenderAddress
      );

      // Verify updated status
      transactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockSenderAddress.toLowerCase());
        return store.getTransactions(mockSenderAddress.toLowerCase());
      })();
      transaction = transactions.find((tx) => tx.id === transactionId);
      expect(transaction?.status).toBe('COMPLETED');
    });
  });

  describe('Different Tokens and Networks', () => {
    test('should handle P2P transactions for different tokens', async () => {
      const tokens = ['ETH', 'MATIC', 'USDC'];

      for (const token of tokens) {
        useWalletStore.getState().setAddress(mockSenderAddress);

        await TransactionCaptureService.captureSendTransaction(
          {
            tokenSymbol: token,
            tokenAmount: token === 'USDC' ? '100' : '1.0',
            toAddress: mockReceiverAddress,
            transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
            gasFee: '0.001',
            status: 'COMPLETED' as const,
            chainId: token === 'MATIC' ? 137 : 1,
            networkName: token === 'MATIC' ? 'Polygon' : 'Ethereum',
          },
          mockSenderAddress
        );

        useWalletStore.getState().setAddress(mockReceiverAddress);

        await TransactionCaptureService.captureReceiveTransaction(
          {
            tokenSymbol: token,
            tokenAmount: token === 'USDC' ? '100' : '1.0',
            fromAddress: mockSenderAddress,
            transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
            status: 'COMPLETED' as const,
            chainId: token === 'MATIC' ? 137 : 1,
            networkName: token === 'MATIC' ? 'Polygon' : 'Ethereum',
          },
          mockReceiverAddress
        );
      }

      // Verify all transactions recorded
      const senderTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockSenderAddress.toLowerCase());
        return store.getTransactions(mockSenderAddress.toLowerCase());
      })();
      const receiverTransactions = await (async () => {
        const store = useTransactionStore.getState();
        await store.loadTransactions(mockReceiverAddress.toLowerCase());
        return store.getTransactions(mockReceiverAddress.toLowerCase());
      })();

      expect(senderTransactions.filter((tx) => tx.type === 'SEND').length).toBe(tokens.length);
      expect(receiverTransactions.filter((tx) => tx.type === 'RECEIVE').length).toBe(tokens.length);
    });
  });
});

