import { TransactionCaptureService } from './TransactionCaptureService';
import { useTransactionStore } from '../store/useTransactionStore';
import { covalentGet } from '../lib/covalent';
import { CHAINS } from '../config/chainRegistry';
import * as ethers from 'ethers';

export interface DetectedTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  chainId: number;
  networkName: string;
  tokenSymbol: string;
  tokenAmount: string;
  gasUsed?: string;
  gasPrice?: string;
}

export class TransactionDetectionService {
  private static detectionInterval: NodeJS.Timeout | null = null;
  private static lastCheckedBlock: Map<number, number> = new Map();
  
  /**
   * Start monitoring for incoming transactions
   */
  static async startMonitoring(userAddress: string) {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
    }
    
    // Removed verbose startup logging
    
    try {
      // Check every 30 seconds for new transactions
      this.detectionInterval = setInterval(async () => {
        try {
          await this.checkForNewTransactions(userAddress);
        } catch (error) {
          console.error('TransactionDetectionService: Error checking for transactions:', error);
          // Don't crash the app - just log and continue
        }
      }, 30000);
      
      // Initial check
      await this.checkForNewTransactions(userAddress);
    } catch (error) {
      console.error('TransactionDetectionService: Failed to start monitoring:', error);
      // Don't throw - monitoring is not critical for app functionality
    }
  }
  
  /**
   * Stop monitoring
   */
  static stopMonitoring() {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    console.log('TransactionDetectionService: Stopped monitoring');
  }
  
  /**
   * Check for new transactions across all supported chains
   */
  private static async checkForNewTransactions(userAddress: string) {
    // CRITICAL: Use TransactionStore to get existing transaction hashes to avoid duplicates
    const transactionStore = useTransactionStore.getState();
    const normalizedAddress = userAddress.toLowerCase();
    
    // Load transactions from storage first
    await transactionStore.loadTransactions(normalizedAddress);
    const existingTransactions = transactionStore.getTransactions(normalizedAddress);
    const existingHashes = new Set(existingTransactions.map((tx: any) => tx.transactionHash));
    
    // Check each chain for new transactions
    // CRITICAL: Don't skip any chains - users may have purchased tokens on any chain
    // We'll try all chains, but handle failures silently to avoid log spam
    const chainsToCheck = CHAINS.filter(chain => {
      // Only skip Polygon Amoy (80002) if it doesn't have Covalent support
      // This is a testnet and RPC is unreliable - but keep other chains
      if (chain.chainId === 80002 && !chain.covalentSupported) {
        return false;
      }
      return true;
    });
    
    for (const chain of chainsToCheck) {
      try {
        // Add timeout per chain to prevent blocking
        const chainPromise = this.getNewTransactionsForChain(chain, userAddress, existingHashes);
        const timeoutPromise = new Promise<DetectedTransaction[]>((resolve) => 
          setTimeout(() => resolve([]), 8000) // 8 second timeout per chain
        );
        
        const newTransactions = await Promise.race([chainPromise, timeoutPromise]);
        
        for (const tx of newTransactions) {
          await this.processDetectedTransaction(tx, userAddress);
        }
      } catch (error) {
        // Silent error - transaction detection is not critical for app functionality
      }
    }
  }
  
  /**
   * Get new transactions for a specific chain
   */
  private static async getNewTransactionsForChain(
    chain: any, 
    userAddress: string, 
    existingHashes: Set<string>
  ): Promise<DetectedTransaction[]> {
    const newTransactions: DetectedTransaction[] = [];
    
    try {
      if (chain.covalentSupported) {
        // Use Covalent API
        const url = `https://api.covalenthq.com/v1/${chain.covalentChainId}/address/${userAddress.toLowerCase()}/transactions_v3/?no-logs=true&page-size=20`;
        const response = await covalentGet(url);
        
        if (response.data?.items && Array.isArray(response.data.items)) {
          for (const tx of response.data.items) {
            if (!existingHashes.has(tx.tx_hash)) {
              const detectedTx: DetectedTransaction = {
                hash: tx.tx_hash,
                from: tx.from_address,
                to: tx.to_address,
                value: tx.value || '0',
                timestamp: new Date(tx.block_signed_at).getTime(),
                chainId: chain.chainId,
                networkName: chain.name,
                tokenSymbol: chain.nativeSymbol,
                tokenAmount: tx.value ? (parseFloat(tx.value) / Math.pow(10, 18)).toFixed(6) : '0',
                gasUsed: tx.gas_spent,
                gasPrice: tx.gas_price
              };
              newTransactions.push(detectedTx);
            }
          }
        }
      } else {
        // Use RPC for unsupported chains - try multiple RPC URLs
        let provider = null;
        let workingRpc = null;
        
        // Try each RPC URL until one works
        for (const rpcUrl of chain.rpcUrls || []) {
          try {
            const testProvider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, {
              chainId: chain.chainId,
              name: chain.name
            });
            
            // Test basic connectivity with aggressive timeout (5 seconds)
            const testBlock = await Promise.race([
              testProvider.getBlockNumber(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 5000))
            ]);
            
            if (Number(testBlock) > 0) {
              provider = testProvider;
              workingRpc = rpcUrl;
              // Removed verbose RPC logging
              break;
            }
          } catch (e: any) {
            // Silent error - don't spam logs for RPC failures
            // These are expected for unreliable chains and will just slow down detection
            continue;
          }
        }
        
        if (!provider) {
          // Silent error - no working RPC is not critical, just skip this chain
          return newTransactions;
        }
        
        const currentBlock = await provider.getBlockNumber();
        const lastChecked = this.lastCheckedBlock.get(chain.chainId) || currentBlock - 100;
        
        // Check blocks from last checked to current (limit to last 50 blocks for performance)
        const maxBlocksToCheck = 50;
        const startBlock = Math.max(lastChecked + 1, currentBlock - maxBlocksToCheck);
        
        for (let blockNum = startBlock; blockNum <= currentBlock; blockNum++) {
          try {
            // Add timeout per block (2 seconds)
            const blockPromise = provider.getBlockWithTransactions(blockNum);
            const blockTimeout = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Block timeout')), 2000)
            );
            
            const block = await Promise.race([blockPromise, blockTimeout]) as any;
            if (block && block.transactions) {
              for (const tx of block.transactions) {
                if (tx.to && tx.from && 
                    tx.to.toLowerCase() === userAddress.toLowerCase() && 
                    tx.from.toLowerCase() !== userAddress.toLowerCase()) {
                  // This is an incoming transaction
                  if (!existingHashes.has(tx.hash)) {
                    const detectedTx: DetectedTransaction = {
                      hash: tx.hash,
                      from: tx.from,
                      to: tx.to,
                      value: tx.value.toString(),
                      timestamp: block.timestamp * 1000,
                      chainId: chain.chainId,
                      networkName: chain.name,
                      tokenSymbol: chain.nativeSymbol,
                      tokenAmount: ethers.utils.formatEther(tx.value),
                      gasUsed: tx.gasLimit?.toString(),
                      gasPrice: tx.gasPrice?.toString()
                    };
                    newTransactions.push(detectedTx);
                  }
                }
              }
            }
          } catch (blockError) {
            // Silent failure for slow blocks
            continue;
          }
        }
        
        this.lastCheckedBlock.set(chain.chainId, currentBlock);
      }
    } catch (error) {
      // Silent error - transaction detection failures are not critical for app functionality
      // Don't spam logs - users may have purchased tokens on any chain, even if RPC fails
    }
    
    return newTransactions;
  }
  
  /**
   * Process a detected transaction and create RECEIVE record
   */
  private static async processDetectedTransaction(tx: DetectedTransaction, userAddress: string) {
    try {
      // Removed verbose logging - only log errors or new transactions
      
      // Determine if this is a RECEIVE transaction
      const isReceive = tx.to && tx.from && 
                       tx.to.toLowerCase() === userAddress.toLowerCase() && 
                       tx.from.toLowerCase() !== userAddress.toLowerCase();
      
      if (isReceive) {
        // CRITICAL: Use TransactionStore to check for duplicates
        const transactionStore = useTransactionStore.getState();
        const normalizedAddress = userAddress.toLowerCase();
        
        // Load existing transactions to check for duplicates
        await transactionStore.loadTransactions(normalizedAddress);
        const existingTransactions = transactionStore.getTransactions(normalizedAddress);
        
        const isDuplicate = existingTransactions.some((existing: any) => 
          existing.transactionHash === tx.hash && existing.type === 'RECEIVE'
        );
        
        if (isDuplicate) {
          // Skip duplicate - no logging needed
          return;
        }
        
        const receiveData = {
          tokenSymbol: tx.tokenSymbol,
          tokenAmount: tx.tokenAmount,
          fromAddress: tx.from,
          transactionHash: tx.hash,
          status: 'COMPLETED' as const,
          blockTimestamp: new Date(tx.timestamp).toISOString(),
          chainId: tx.chainId,
          networkName: tx.networkName,
          currencyAmount: '0', // Will be calculated with real-time prices
          currencySymbol: 'USD'
        };
        
        const transactionId = await TransactionCaptureService.captureReceiveTransaction(receiveData, userAddress);
        // Only log new transactions (not duplicates)
        console.log(`TransactionDetectionService: New RECEIVE transaction: ${tx.tokenAmount} ${tx.tokenSymbol} from ${tx.networkName}`);
        
        // Trigger history refresh
        // No manual refresh needed - TransactionStore handles notifications automatically
      }
    } catch (error) {
      console.error('TransactionDetectionService: Error processing detected transaction:', error);
    }
  }
  
  /**
   * Manually trigger a check for new transactions
   */
  static async manualCheck(userAddress: string) {
    console.log('TransactionDetectionService: Manual check triggered');
    await this.checkForNewTransactions(userAddress);
  }
}
