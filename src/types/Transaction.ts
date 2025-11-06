// src/types/Transaction.ts
// New comprehensive transaction data model

export type TransactionType = 'BUY' | 'SELL' | 'SEND' | 'RECEIVE';

export type TransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type TransactionSource = 'TRANSAK' | 'P2P' | 'BLOCKCHAIN';

export interface TransactionRecord {
  id: string;                    // Unique transaction ID
  type: TransactionType;           // Transaction category
  timestamp: number;              // Unix timestamp
  date: string;                   // Human-readable date (YYYY-MM-DD)
  time: string;                   // Human-readable time (HH:MM:SS)
  
  // Token/Asset Information
  tokenSymbol: string;            // ETH, MATIC, USDC, etc.
  tokenName: string;              // Ethereum, Polygon, USD Coin
  tokenAmount: string;            // Amount in token units
  tokenDecimals: number;          // Token decimals
  
  // Currency Information
  currencySymbol: string;         // USD, GBP, etc.
  currencyAmount: string;         // Amount in fiat currency
  
  // Wallet Information
  fromAddress: string;            // Sender wallet address
  toAddress: string;              // Receiver wallet address
  
  // Transaction Details
  transactionHash: string;        // Blockchain transaction hash
  chainId: number;               // Blockchain network ID
  networkName: string;            // Ethereum, Polygon, etc.
  
  // Fees and Costs
  gasFee: string;                // Gas fee paid
  totalCost: string;              // Total cost including fees
  
  // Status and Reference
  status: TransactionStatus;      // Transaction status
  reference: string;              // Transaction reference number
  
  // Source Information
  source: TransactionSource;      // Transaction source
  explorerUrl: string;           // Link to blockchain explorer
  
  // Additional metadata
  notes?: string;                // User notes
  tags?: string[];               // User tags for categorization
}

// Helper types for transaction creation
export interface BuyTransactionData {
  tokenSymbol: string;
  tokenAmount: string;
  currencyAmount: string;
  currencySymbol: string;
  transactionHash?: string;
  status: string;
}

export interface SellTransactionData {
  tokenSymbol: string;
  tokenAmount: string;
  currencyAmount: string;
  currencySymbol: string;
  transactionHash?: string;
  status: string;
}

export interface SendTransactionData {
  tokenSymbol: string;
  tokenAmount: string;
  toAddress: string;
  transactionHash: string;
  gasFee: string;
}

export interface ReceiveTransactionData {
  tokenSymbol: string;
  tokenAmount: string;
  fromAddress: string;
  transactionHash: string;
}
