# Crypto Pal App - Development Handover Document

**Date:** October 27, 2025  
**Project:** Crypto Pal Safety App  
**Status:** In Progress - Multiple Issues Identified

## Project Overview

The Crypto Pal app is a React Native cryptocurrency wallet application that supports multiple EVM chains and provides real-time price data, transaction history, and wallet management functionality.

## Current Architecture

### Key Components
- **Main App**: `App.js` - Entry point
- **Navigation**: `src/navigation/AppTabs.tsx` - Bottom tab navigator
- **Wallet Tab**: `src/screens/Wallet.tsx` - Portfolio display
- **History Tab**: `src/screens/StableHistoryTab.tsx` - Transaction history (PRIMARY)
- **Send Tab**: `src/screens/Pay/SendTab.tsx` - Transaction sending
- **Buy Tab**: `src/screens/Buy.tsx` - Cryptocurrency purchasing

### Data Sources
- **CoinGecko API**: Primary price data source
- **Covalent API**: Transaction history for multiple chains
- **Polygonscan/Etherscan**: Blockchain explorer APIs
- **Transak**: Cryptocurrency purchasing service

### Supported Chains
- Sepolia (Testnet) - Chain ID: 11155111
- BSC Testnet - Chain ID: 97
- Polygon Amoy (Testnet) - Chain ID: 80002
- Ethereum Mainnet - Chain ID: 1
- BSC Mainnet - Chain ID: 56
- Polygon Mainnet - Chain ID: 137
- Arbitrum - Chain ID: 42161
- Optimism - Chain ID: 10
- Avalanche - Chain ID: 43114
- Base - Chain ID: 8453
- Linea - Chain ID: 59144

## Completed Work

### 1. Real-Time Price Data Implementation ✅
- Removed all hardcoded/fixed price rates
- Implemented strict real-time pricing from CoinGecko API
- Added fallback to CoinPaprika API
- Updated all components to use live market data

### 2. Gas Fee Estimation ✅
- Implemented dynamic gas price estimation using `provider.getFeeData()`
- Added real-time gas limit estimation using `provider.estimateGas()`
- Removed fixed gas price constants
- Added timeout handling for gas estimation

### 3. SendTab Transaction Capture ✅
- Fixed `SendTab.tsx` to pass correct `chainId` and `networkName` to `TransactionCaptureService`
- Ensures MATIC transactions are properly labeled as Polygon instead of Sepolia
- Both native token and ERC-20 token sends now capture correct network information

### 4. History Tab UI Improvements ✅
- Fixed currency toggle display (e.g., "NZD$1.06" instead of "$1.06 NZD")
- Limited ETH value length to prevent text wrapping
- Made transaction detail headings bold
- Implemented clickable hash links to blockchain explorers
- Added "Recent (Oct 19+)" filter option

## Current Issues (CRITICAL)

### 1. CoinGecko API Rate Limiting (HTTP 429) 🚨
**Problem**: App is hitting CoinGecko rate limits, causing:
- All price data to fall back to cached/zero values
- Wallet showing incorrect balances ($0.00 for most tokens)
- History tab unable to calculate transaction values

**Impact**: Core functionality broken - users see incorrect portfolio values

**Log Evidence**:
```
ERROR CoinGecko API error: HTTP 429 -
LOG CoinGecko API failed, using cache/fallback: [Error: CG HTTP 429]
LOG CoinGecko: ⚠️ No real-time price data for MATIC, skipping
```

### 2. History Tab Transaction Display Failure 🚨
**Problem**: Despite finding transactions, none are displayed:
- Logs show "Found 81 stored transactions"
- Logs show "Covalent found 80 transactions for Sepolia"
- Final result: "Showing all transactions: 0"

**Impact**: Users cannot see their transaction history

**Log Evidence**:
```
LOG StableHistoryTab: Found 81 stored transactions
LOG StableHistoryTab: Covalent found 80 transactions for Sepolia
LOG StableHistoryTab: Showing all transactions: 0
```

### 3. Polygon Amoy API Failures 🚨
**Problem**: Polygon Amoy testnet API calls failing:
- Multiple endpoint attempts failing
- No transactions retrieved from Polygon Amoy
- Affects testnet transaction visibility

**Log Evidence**:
```
LOG StableHistoryTab: Trying Polygon Amoy endpoint: https://api-amoy.polygonscan.com/api
LOG StableHistoryTab: ⚠️ No transactions found using https://api-amoy.polygonscan.com/api
```

### 4. Missing RECEIVE Transactions 🚨
**Problem**: P2P RECEIVE transactions not displaying on receiver device
- SEND transactions appear on sender device
- RECEIVE transactions missing on receiver device (A24)
- Affects user experience for peer-to-peer transfers

## Technical Debt

### 1. API Rate Limiting Strategy
- No proper rate limiting implementation
- No API key rotation strategy
- No request throttling mechanism

### 2. Error Handling
- Insufficient error handling for API failures
- No graceful degradation when APIs are unavailable
- Missing retry mechanisms

### 3. Transaction Processing
- Complex transaction deduplication logic
- Multiple data sources causing conflicts
- Inconsistent transaction type detection

## Immediate Action Items

### Priority 1: Fix CoinGecko Rate Limiting
1. Implement API request throttling
2. Add request queuing mechanism
3. Implement exponential backoff for retries
4. Add multiple API key rotation
5. Consider alternative price data sources

### Priority 2: Fix History Tab Display
1. Debug transaction filtering logic
2. Check transaction deduplication process
3. Verify transaction type detection
4. Test transaction rendering pipeline

### Priority 3: Fix Polygon Amoy API
1. Verify correct API endpoints
2. Check API key configuration
3. Implement proper error handling
4. Add fallback mechanisms

### Priority 4: Fix RECEIVE Transaction Detection
1. Debug transaction type classification
2. Verify address matching logic
3. Test cross-device transaction visibility
4. Check transaction storage/retrieval

## File Locations

### Critical Files
- `src/screens/StableHistoryTab.tsx` - Main history component
- `src/hooks/useAssets.ts` - Price data management
- `src/screens/Pay/SendTab.tsx` - Transaction sending
- `src/services/TransactionCaptureService.ts` - Transaction storage
- `src/lib/covalent.ts` - Covalent API integration

### Configuration Files
- `src/config/chainRegistry.ts` - Chain configurations
- `src/config/TransakKeys.ts` - API keys
- `eas.json` - Build configuration

## Testing Status

### Completed Tests
- ✅ Real-time price data validation
- ✅ Gas fee estimation accuracy
- ✅ Transaction capture functionality
- ✅ UI component rendering

### Pending Tests
- ❌ Cross-device transaction visibility
- ❌ API rate limiting handling
- ❌ Error recovery mechanisms
- ❌ Multi-chain transaction processing

## Development Environment

### Setup Requirements
- Node.js with React Native
- Expo CLI
- Android Studio (for APK builds)
- API keys for CoinGecko, Covalent, Transak

### Build Commands
```bash
# Development
npx expo start

# APK Build
eas build --platform android
```

## Next Steps

1. **Immediate**: Address CoinGecko rate limiting
2. **Short-term**: Fix history tab transaction display
3. **Medium-term**: Implement robust error handling
4. **Long-term**: Optimize API usage and add monitoring

## Contact Information

**Current Developer**: AI Assistant  
**Project Owner**: User  
**Last Updated**: October 27, 2025

---

**Note**: This document should be updated as issues are resolved and new features are implemented. The current state represents a partially functional app with critical issues that need immediate attention.
