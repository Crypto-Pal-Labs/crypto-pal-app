# Crypto Pal - Comprehensive TODO List for AAB Build
**Date:** January 2025  
**Goal:** Complete the app to production-ready AAB build for Android launch  
**Status:** Ready for Execution

---

## Table of Contents

1. [Phase 1: Foundation & Network Expansion](#phase-1-foundation--network-expansion)
2. [Phase 2: Code Quality & Reliability](#phase-2-code-quality--reliability)
3. [Phase 3: API Management & Rate Limiting](#phase-3-api-management--rate-limiting)
4. [Phase 4: Testing Infrastructure](#phase-4-testing-infrastructure)
5. [Phase 5: End-to-End Testing](#phase-5-end-to-end-testing)
6. [Phase 6: Production Configuration](#phase-6-production-configuration)
7. [Phase 7: Security & Performance](#phase-7-security--performance)
8. [Phase 8: AAB Build & Launch](#phase-8-aab-build--launch)

---

## Phase 1: Foundation & Network Expansion

### TODO-001: Expand Transak Network Coverage
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 40-60 hours  
**Status:** Pending

**Tasks:**
1. **Research Transak Supported Networks:**
   - [ ] Review Transak documentation for all supported networks
   - [ ] List all 45+ supported blockchains
   - [ ] Identify EVM vs non-EVM chains
   - [ ] Document network requirements and RPC endpoints

2. **Extend Chain Registry:**
   - [ ] Add all EVM chains to `src/config/chainRegistry.ts`
   - [ ] Add RPC endpoints for each chain (primary + fallbacks)
   - [ ] Add explorer URLs for each chain
   - [ ] Add native currency symbols and decimals
   - [ ] Mark Covalent-supported vs non-supported chains

3. **Update TransakNetworkMapper:**
   - [ ] Add mappings for all Transak network names
   - [ ] Handle testnet vs mainnet detection
   - [ ] Add fallback mappings for unknown networks
   - [ ] Test all network mappings

4. **Test Network Integration:**
   - [ ] Test each network with Transak buy flow
   - [ ] Verify transaction capture for each network
   - [ ] Verify transaction display for each network
   - [ ] Document any network-specific issues

**Files to Modify:**
- `src/config/chainRegistry.ts`
- `src/services/TransakNetworkMapper.ts`
- `src/services/MultiCoinWalletService.ts`

**Testing:**
- Manual test: Buy transaction on each new network
- Verify: Transaction appears in History tab
- Verify: Balance appears in Wallet tab
- Verify: Network name is correct

---

### TODO-002: Enhance Multi-Coin Wallet Service
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 20-30 hours  
**Status:** Pending

**Tasks:**
1. **Complete Non-EVM Address Derivation:**
   - [ ] Complete XRP address encoding (if library compatible)
   - [ ] Add Solana address derivation
   - [ ] Add Cardano address derivation
   - [ ] Add other non-EVM address derivations
   - [ ] Test all address derivations

2. **Update WalletAddressesData Format:**
   - [ ] Ensure format matches Transak requirements
   - [ ] Include all supported networks
   - [ ] Test with Transak API
   - [ ] Verify address validation

3. **Error Handling:**
   - [ ] Add error handling for unsupported networks
   - [ ] Add fallback mechanisms
   - [ ] Add user-friendly error messages

**Files to Modify:**
- `src/services/MultiCoinWalletService.ts`
- `src/services/NonEvmBalanceService.ts`

**Testing:**
- Manual test: Derive addresses for all supported networks
- Verify: Addresses are valid format
- Verify: Transak accepts addresses
- Verify: Transactions work with derived addresses

---

## Phase 2: Code Quality & Reliability

### TODO-003: Refactor Buy.tsx (3262 lines)
**Priority:** 🟡 HIGH  
**Estimated Time:** 30-40 hours  
**Status:** Pending

**Tasks:**
1. **Extract Components:**
   - [ ] Extract `RecentPurchases` component
   - [ ] Extract `TransakWebView` component
   - [ ] Extract `TransactionCapture` component
   - [ ] Extract `PriceChart` component
   - [ ] Create component files in `src/components/Buy/`

2. **Extract Hooks:**
   - [ ] Extract `useTransakSession` hook
   - [ ] Extract `useTransactionCapture` hook
   - [ ] Extract `useRecentPurchases` hook
   - [ ] Create hook files in `src/hooks/Buy/`

3. **Extract Services:**
   - [ ] Extract transaction capture logic to service
   - [ ] Extract URL building logic
   - [ ] Extract order ID extraction logic
   - [ ] Create service files in `src/services/Buy/`

4. **Improve Error Handling:**
   - [ ] Add try-catch blocks around all async operations
   - [ ] Add user-friendly error messages
   - [ ] Add error recovery mechanisms
   - [ ] Add error logging

5. **Remove Poor Quality Patches:**
   - [ ] Remove hardcoded token checks
   - [ ] Remove debug logging
   - [ ] Use TransakNetworkMapper for all networks
   - [ ] Clean up commented code

**Files to Create:**
- `src/components/Buy/RecentPurchases.tsx`
- `src/components/Buy/TransakWebView.tsx`
- `src/components/Buy/TransactionCapture.tsx`
- `src/components/Buy/PriceChart.tsx`
- `src/hooks/Buy/useTransakSession.ts`
- `src/hooks/Buy/useTransactionCapture.ts`
- `src/hooks/Buy/useRecentPurchases.ts`
- `src/services/Buy/TransactionCaptureService.ts`
- `src/services/Buy/TransakUrlBuilder.ts`

**Files to Modify:**
- `src/screens/Buy.tsx` (refactor to use new components/hooks)

**Testing:**
- Unit test: Each extracted component/hook
- Integration test: Buy flow end-to-end
- Manual test: Complete buy transaction
- Verify: No regressions in functionality

---

### TODO-004: Refactor StableHistoryTab.tsx (2128 lines)
**Priority:** 🟡 HIGH  
**Estimated Time:** 25-35 hours  
**Status:** Pending

**Tasks:**
1. **Extract Components:**
   - [ ] Extract `TransactionCard` component
   - [ ] Extract `TransactionFilter` component
   - [ ] Extract `TransactionList` component
   - [ ] Extract `CurrencyToggle` component
   - [ ] Create component files in `src/components/History/`

2. **Extract Hooks:**
   - [ ] Extract `useTransactionFilter` hook
   - [ ] Extract `useTransactionDeduplication` hook
   - [ ] Extract `useTransactionFormatting` hook
   - [ ] Create hook files in `src/hooks/History/`

3. **Extract Services:**
   - [ ] Extract deduplication logic to service
   - [ ] Extract transaction formatting logic
   - [ ] Extract transaction grouping logic
   - [ ] Create service files in `src/services/History/`

4. **Improve Performance:**
   - [ ] Optimize FlatList rendering
   - [ ] Add memoization where needed
   - [ ] Optimize filtering logic
   - [ ] Add pagination for large lists

5. **Fix Transaction Display Issues:**
   - [ ] Fix filtering logic that shows 0 transactions
   - [ ] Fix deduplication logic
   - [ ] Fix transaction type detection
   - [ ] Fix missing transaction display

**Files to Create:**
- `src/components/History/TransactionCard.tsx`
- `src/components/History/TransactionFilter.tsx`
- `src/components/History/TransactionList.tsx`
- `src/components/History/CurrencyToggle.tsx`
- `src/hooks/History/useTransactionFilter.ts`
- `src/hooks/History/useTransactionDeduplication.ts`
- `src/hooks/History/useTransactionFormatting.ts`
- `src/services/History/TransactionDeduplicationService.ts`
- `src/services/History/TransactionFormattingService.ts`

**Files to Modify:**
- `src/screens/StableHistoryTab.tsx` (refactor to use new components/hooks)

**Testing:**
- Unit test: Each extracted component/hook
- Integration test: History tab display
- Manual test: View transaction history
- Verify: All transactions display correctly
- Verify: No duplicates
- Verify: Filtering works correctly

---

### TODO-005: Refactor useTransactionStore.ts (1394 lines)
**Priority:** 🟡 HIGH  
**Estimated Time:** 20-30 hours  
**Status:** Pending

**Tasks:**
1. **Extract Services:**
   - [ ] Extract `TransactionPersistenceService`
   - [ ] Extract `TransactionRetryService`
   - [ ] Extract `TransactionSyncService`
   - [ ] Create service files in `src/services/TransactionStore/`

2. **Improve Deduplication:**
   - [ ] Remove manual DAI fix (use proper network mapping)
   - [ ] Improve orderId-based deduplication
   - [ ] Improve timestamp-based deduplication
   - [ ] Add comprehensive deduplication tests

3. **Improve Retry Logic:**
   - [ ] Extract retry logic to service
   - [ ] Improve exponential backoff
   - [ ] Add retry limits
   - [ ] Add retry status tracking

4. **Improve Synchronization:**
   - [ ] Extract sync logic to service
   - [ ] Add background sync
   - [ ] Add incremental sync
   - [ ] Add conflict resolution

5. **Remove Poor Quality Patches:**
   - [ ] Remove manual DAI transaction fix (line 254)
   - [ ] Remove hardcoded network mappings
   - [ ] Use TransakNetworkMapper for all tokens
   - [ ] Clean up debug logging

**Files to Create:**
- `src/services/TransactionStore/TransactionPersistenceService.ts`
- `src/services/TransactionStore/TransactionRetryService.ts`
- `src/services/TransactionStore/TransactionSyncService.ts`

**Files to Modify:**
- `src/store/useTransactionStore.ts` (refactor to use new services)

**Testing:**
- Unit test: Each extracted service
- Integration test: Transaction store operations
- Manual test: Transaction CRUD operations
- Verify: Deduplication works correctly
- Verify: Retry mechanism works
- Verify: Synchronization works

---

### TODO-006: Remove Debug Logging
**Priority:** 🟢 MEDIUM  
**Estimated Time:** 5-10 hours  
**Status:** Pending

**Tasks:**
1. **Audit All Files:**
   - [ ] Find all console.log statements
   - [ ] Find all console.warn statements
   - [ ] Find all console.error statements
   - [ ] Categorize by importance

2. **Create Logging Service:**
   - [ ] Create `src/services/LoggingService.ts`
   - [ ] Add log levels (DEBUG, INFO, WARN, ERROR)
   - [ ] Add environment-based filtering
   - [ ] Add log formatting

3. **Replace Console Logs:**
   - [ ] Replace important logs with LoggingService
   - [ ] Remove debug logs
   - [ ] Keep error logs
   - [ ] Add structured logging

4. **Test Logging:**
   - [ ] Test in development mode
   - [ ] Test in production mode
   - [ ] Verify log levels work
   - [ ] Verify no sensitive data in logs

**Files to Create:**
- `src/services/LoggingService.ts`

**Files to Modify:**
- All files with console.log statements

**Testing:**
- Manual test: Check logs in development
- Manual test: Check logs in production
- Verify: No sensitive data in logs
- Verify: Appropriate log levels

---

## Phase 3: API Management & Rate Limiting

### TODO-007: Implement Multi-Provider Price Service
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 15-20 hours  
**Status:** Pending

**Tasks:**
1. **Extend PriceService:**
   - [ ] Add CoinPaprika provider
   - [ ] Add CryptoCompare provider
   - [ ] Add Transak price provider (from order data)
   - [ ] Implement provider priority system

2. **Implement Fallback Chain:**
   - [ ] Primary: CoinGecko (with rate limiting)
   - [ ] Secondary: CoinPaprika
   - [ ] Tertiary: CryptoCompare
   - [ ] Fallback: Transak prices / cached prices

3. **Add Rate Limiting:**
   - [ ] Implement request queue
   - [ ] Add request throttling (max requests per minute)
   - [ ] Add exponential backoff on rate limit errors
   - [ ] Add API key rotation (use multiple keys)

4. **Add Caching:**
   - [ ] Cache prices for 5 minutes
   - [ ] Cache rate limit status
   - [ ] Cache provider availability
   - [ ] Implement cache invalidation

5. **Test Multi-Provider:**
   - [ ] Test with CoinGecko available
   - [ ] Test with CoinGecko rate limited
   - [ ] Test with all providers down
   - [ ] Test fallback to cached prices

**Files to Modify:**
- `src/services/PriceService.ts`
- `src/lib/cgCache.ts`

**Files to Create:**
- `src/services/PriceService/CoinPaprikaProvider.ts`
- `src/services/PriceService/CryptoCompareProvider.ts`
- `src/services/PriceService/TransakPriceProvider.ts`
- `src/services/PriceService/RateLimiter.ts`

**Testing:**
- Unit test: Each provider
- Integration test: Fallback chain
- Manual test: Price updates with rate limiting
- Verify: Prices always available (from cache or provider)

---

### TODO-008: Implement API Request Throttling
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 10-15 hours  
**Status:** Pending

**Tasks:**
1. **Create Request Queue Service:**
   - [ ] Create `src/services/RequestQueueService.ts`
   - [ ] Implement priority queue
   - [ ] Add request throttling
   - [ ] Add request cancellation

2. **Integrate with All APIs:**
   - [ ] Integrate with CoinGecko API
   - [ ] Integrate with Covalent API
   - [ ] Integrate with Transak API
   - [ ] Integrate with RPC endpoints

3. **Add Rate Limit Detection:**
   - [ ] Detect HTTP 429 responses
   - [ ] Detect rate limit headers
   - [ ] Implement exponential backoff
   - [ ] Add retry logic

4. **Add Request Monitoring:**
   - [ ] Track request rates
   - [ ] Track rate limit errors
   - [ ] Add alerts for high error rates
   - [ ] Add metrics collection

**Files to Create:**
- `src/services/RequestQueueService.ts`
- `src/services/RequestQueueService/RateLimitDetector.ts`
- `src/services/RequestQueueService/RequestMonitor.ts`

**Files to Modify:**
- `src/services/PriceService.ts`
- `src/lib/covalent.ts`
- `src/services/TransakOrderService.ts`

**Testing:**
- Unit test: Request queue
- Integration test: Rate limiting
- Manual test: High request volume
- Verify: No rate limit errors
- Verify: Requests are throttled appropriately

---

### TODO-009: Improve Error Handling
**Priority:** 🟡 HIGH  
**Estimated Time:** 15-20 hours  
**Status:** Pending

**Tasks:**
1. **Create Error Handling Service:**
   - [ ] Create `src/services/ErrorHandlingService.ts`
   - [ ] Add error categorization
   - [ ] Add error recovery strategies
   - [ ] Add user-friendly error messages

2. **Add Error Recovery:**
   - [ ] Add retry logic for transient errors
   - [ ] Add fallback mechanisms for API failures
   - [ ] Add offline support
   - [ ] Add cached data fallback

3. **Improve Error Messages:**
   - [ ] Replace technical errors with user-friendly messages
   - [ ] Add helpful hints for common issues
   - [ ] Add error recovery suggestions
   - [ ] Add error reporting

4. **Add Error Logging:**
   - [ ] Log all errors with context
   - [ ] Track error rates
   - [ ] Add error analytics
   - [ ] Add error reporting to monitoring service

**Files to Create:**
- `src/services/ErrorHandlingService.ts`
- `src/services/ErrorHandlingService/ErrorRecovery.ts`
- `src/services/ErrorHandlingService/ErrorMessageFormatter.ts`

**Files to Modify:**
- All files with error handling

**Testing:**
- Unit test: Error handling service
- Integration test: Error recovery
- Manual test: Simulate various errors
- Verify: User-friendly error messages
- Verify: Error recovery works

---

## Phase 4: Testing Infrastructure

### TODO-010: Set Up Unit Testing Infrastructure
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 20-25 hours  
**Status:** Pending

**Tasks:**
1. **Configure Jest:**
   - [ ] Review `jest.config.js`
   - [ ] Add missing mocks
   - [ ] Configure coverage thresholds
   - [ ] Add test utilities

2. **Create Test Utilities:**
   - [ ] Create `src/__tests__/helpers/testUtils.tsx`
   - [ ] Create mock data generators
   - [ ] Create mock API responses
   - [ ] Create test fixtures

3. **Set Up Mocks:**
   - [ ] Mock AsyncStorage
   - [ ] Mock SecureStore
   - [ ] Mock Expo modules
   - [ ] Mock API responses

4. **Write Unit Tests:**
   - [ ] Test TransactionStore (target: 90% coverage)
   - [ ] Test TransakNetworkMapper (target: 100% coverage)
   - [ ] Test PriceService (target: 80% coverage)
   - [ ] Test TransactionCaptureService (target: 80% coverage)

5. **Set Up Coverage Reports:**
   - [ ] Configure coverage reporting
   - [ ] Set coverage thresholds (80% overall)
   - [ ] Add coverage badges
   - [ ] Integrate with CI/CD

**Files to Modify:**
- `jest.config.js`
- `src/__tests__/helpers/testUtils.tsx`

**Files to Create:**
- `src/__tests__/unit/TransactionStore.test.ts`
- `src/__tests__/unit/TransakNetworkMapper.test.ts`
- `src/__tests__/unit/PriceService.test.ts`
- `src/__tests__/unit/TransactionCaptureService.test.ts`

**Testing:**
- Run: `npm run test:unit`
- Verify: All tests pass
- Verify: Coverage meets thresholds
- Verify: Tests run in CI/CD

---

### TODO-011: Set Up Integration Testing Infrastructure
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 25-30 hours  
**Status:** Pending

**Tasks:**
1. **Configure Integration Test Environment:**
   - [ ] Set up test database
   - [ ] Set up test API endpoints
   - [ ] Set up test wallets
   - [ ] Configure test environment variables

2. **Create Integration Test Utilities:**
   - [ ] Create test wallet setup
   - [ ] Create test transaction generators
   - [ ] Create API response mocks
   - [ ] Create test cleanup utilities

3. **Write Integration Tests:**
   - [ ] Test Buy flow end-to-end
   - [ ] Test Sell flow end-to-end
   - [ ] Test P2P flow end-to-end
   - [ ] Test transaction history
   - [ ] Test wallet balance updates

4. **Set Up Test Data:**
   - [ ] Create test transaction data
   - [ ] Create test wallet data
   - [ ] Create test API responses
   - [ ] Create test fixtures

**Files to Create:**
- `src/__tests__/integration/BuyFlow.test.ts`
- `src/__tests__/integration/SellFlow.test.ts`
- `src/__tests__/integration/P2PFlow.test.ts`
- `src/__tests__/integration/TransactionHistory.test.ts`
- `src/__tests__/integration/WalletBalance.test.ts`
- `src/__tests__/helpers/integrationTestUtils.ts`

**Testing:**
- Run: `npm run test:integration`
- Verify: All tests pass
- Verify: Tests are isolated
- Verify: Tests clean up after themselves

---

### TODO-012: Set Up E2E Testing Infrastructure
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 30-40 hours  
**Status:** Pending

**Tasks:**
1. **Choose E2E Testing Framework:**
   - [ ] Evaluate Detox (React Native)
   - [ ] Evaluate Maestro (React Native)
   - [ ] Choose framework
   - [ ] Set up framework

2. **Configure E2E Test Environment:**
   - [ ] Set up test devices/emulators
   - [ ] Configure test app build
   - [ ] Set up test data
   - [ ] Configure test environment

3. **Write E2E Tests:**
   - [ ] Test onboarding flow
   - [ ] Test buy transaction flow
   - [ ] Test sell transaction flow
   - [ ] Test P2P transaction flow
   - [ ] Test transaction history
   - [ ] Test wallet balance display

4. **Set Up Test Automation:**
   - [ ] Configure CI/CD for E2E tests
   - [ ] Set up test reporting
   - [ ] Add test screenshots
   - [ ] Add test video recording

**Files to Create:**
- `e2e/onboarding.test.ts`
- `e2e/buyTransaction.test.ts`
- `e2e/sellTransaction.test.ts`
- `e2e/p2pTransaction.test.ts`
- `e2e/transactionHistory.test.ts`
- `e2e/walletBalance.test.ts`
- `.maestro/` or `.detox/` configuration files

**Testing:**
- Run: `npm run test:e2e`
- Verify: All tests pass
- Verify: Tests run on CI/CD
- Verify: Test reports are generated

---

### TODO-013: Set Up Headless Server Testing
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 40-50 hours  
**Status:** Pending

**Tasks:**
1. **Set Up CI/CD Pipeline:**
   - [ ] Choose CI/CD platform (GitHub Actions recommended)
   - [ ] Create `.github/workflows/test.yml`
   - [ ] Configure test environment
   - [ ] Set up test runners

2. **Configure Headless Test Environment:**
   - [ ] Set up headless Android emulator
   - [ ] Configure test app build
   - [ ] Set up test data
   - [ ] Configure test environment variables

3. **Create Headless Test Scripts:**
   - [ ] Create test runner script
   - [ ] Create test cleanup script
   - [ ] Create test reporting script
   - [ ] Create test notification script

4. **Write Headless Tests:**
   - [ ] Unit tests (Jest)
   - [ ] Integration tests (Jest)
   - [ ] E2E tests (Detox/Maestro)
   - [ ] Performance tests
   - [ ] Security tests

5. **Set Up Test Reporting:**
   - [ ] Configure test result reporting
   - [ ] Set up test result storage
   - [ ] Add test result notifications
   - [ ] Add test result dashboards

6. **Set Up Test Automation:**
   - [ ] Run on every commit
   - [ ] Run on PR creation
   - [ ] Run on release
   - [ ] Add test result badges

**Files to Create:**
- `.github/workflows/test.yml`
- `scripts/run-headless-tests.sh`
- `scripts/setup-headless-env.sh`
- `scripts/generate-test-report.sh`
- `test-config/headless.config.js`

**Files to Modify:**
- `package.json` (add test scripts)

**Testing:**
- Run: `npm run test:headless`
- Verify: Tests run in CI/CD
- Verify: Test reports are generated
- Verify: Test notifications work
- Verify: Test badges update

---

## Phase 5: End-to-End Testing

### TODO-014: Comprehensive User Flow Testing
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 60-80 hours  
**Status:** Pending

**Test Scenarios:**

1. **Onboarding Flow:**
   - [ ] Create new wallet
   - [ ] Set PIN
   - [ ] Enable biometrics
   - [ ] Verify wallet creation
   - [ ] Restore wallet from mnemonic
   - [ ] Verify wallet restoration

2. **Buy Transaction Flow (All Tokens):**
   - [ ] Buy ETH (Ethereum)
   - [ ] Buy BTC (Bitcoin)
   - [ ] Buy XRP (Ripple)
   - [ ] Buy MATIC (Polygon)
   - [ ] Buy USDC (Ethereum)
   - [ ] Buy USDT (BSC)
   - [ ] Buy DAI (Palm/other networks)
   - [ ] Buy SOL (Solana)
   - [ ] Buy ADA (Cardano)
   - [ ] Buy TRX (Tron)
   - [ ] Test all other supported tokens

3. **Sell Transaction Flow (All Tokens):**
   - [ ] Sell ETH
   - [ ] Sell BTC
   - [ ] Sell XRP
   - [ ] Sell all other supported tokens

4. **P2P Transaction Flow (All Tokens):**
   - [ ] Send ETH (native)
   - [ ] Send ERC-20 tokens (USDC, USDT, etc.)
   - [ ] Send BTC (if supported)
   - [ ] Send XRP (if supported)
   - [ ] Verify transaction on sender side
   - [ ] Verify transaction on receiver side
   - [ ] Verify balance updates

5. **Transaction History:**
   - [ ] View all transactions
   - [ ] Filter by type (BUY, SELL, SEND, RECEIVE)
   - [ ] Filter by date range
   - [ ] Verify transaction details
   - [ ] Verify transaction links
   - [ ] Verify currency toggle

6. **Wallet Balance Display:**
   - [ ] Verify all balances are accurate
   - [ ] Verify USD values are correct
   - [ ] Verify local currency values are correct
   - [ ] Verify 24h changes are correct
   - [ ] Verify balance updates after transactions

7. **Multi-Chain Testing:**
   - [ ] Test all supported EVM chains
   - [ ] Test all supported non-EVM chains
   - [ ] Verify network detection
   - [ ] Verify transaction display
   - [ ] Verify balance accuracy

**Testing:**
- Manual test: Each scenario
- Automated test: Where possible
- Document: Any issues found
- Fix: All issues before production

---

### TODO-015: Cross-Device Testing
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 40-60 hours  
**Status:** Pending

**Test Devices:**
1. **Samsung S20 (High-end):**
   - [ ] Onboarding flow
   - [ ] Buy transactions (all tokens)
   - [ ] Sell transactions (all tokens)
   - [ ] P2P transactions (all tokens)
   - [ ] Transaction history
   - [ ] Wallet balance display
   - [ ] Performance testing
   - [ ] Battery usage

2. **Samsung A24 (Mid-range):**
   - [ ] All scenarios from S20
   - [ ] Performance testing (lower-end device)
   - [ ] Memory usage monitoring
   - [ ] Battery usage impact
   - [ ] Slow network testing

3. **Low-end Device (if available):**
   - [ ] All core scenarios
   - [ ] Performance testing
   - [ ] Memory usage
   - [ ] Battery usage

4. **Different Android Versions:**
   - [ ] Android 10
   - [ ] Android 11
   - [ ] Android 12
   - [ ] Android 13
   - [ ] Android 14

**Testing:**
- Manual test: Each device
- Document: Device-specific issues
- Fix: All device-specific issues
- Verify: Consistent behavior across devices

---

### TODO-016: Edge Case Testing
**Priority:** 🟡 HIGH  
**Estimated Time:** 30-40 hours  
**Status:** Pending

**Test Scenarios:**

1. **Network Failures:**
   - [ ] No internet connection
   - [ ] Slow network connection
   - [ ] Intermittent network connection
   - [ ] Network timeout
   - [ ] Verify offline support
   - [ ] Verify cached data display
   - [ ] Verify error messages

2. **API Failures:**
   - [ ] CoinGecko API down
   - [ ] Covalent API down
   - [ ] Transak API down
   - [ ] RPC endpoints down
   - [ ] Verify fallback mechanisms
   - [ ] Verify error handling
   - [ ] Verify user-friendly messages

3. **Transaction Failures:**
   - [ ] Transaction rejection
   - [ ] Transaction timeout
   - [ ] Insufficient gas
   - [ ] Invalid address
   - [ ] Verify error messages
   - [ ] Verify recovery options

4. **Data Integrity:**
   - [ ] Large transaction history (1000+ transactions)
   - [ ] Multiple simultaneous transactions
   - [ ] Transaction conflicts
   - [ ] Duplicate transactions
   - [ ] Missing transaction data
   - [ ] Verify data accuracy

5. **Performance:**
   - [ ] Large wallet (100+ assets)
   - [ ] Large transaction history
   - [ ] Multiple concurrent API calls
   - [ ] Memory usage
   - [ ] Battery usage
   - [ ] Verify performance is acceptable

**Testing:**
- Manual test: Each edge case
- Automated test: Where possible
- Document: All edge cases
- Fix: All edge case issues

---

## Phase 6: Production Configuration

### TODO-017: Switch to Production Transak API
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 2-4 hours  
**Status:** Pending

**Tasks:**
1. **Update Buy.tsx:**
   - [ ] Change `TRANSAK_BASE` from staging to production
   - [ ] Update `TRANSAK_API_KEY` to production key
   - [ ] Update `TRANSAK_ENV` to 'PRODUCTION'
   - [ ] Test production endpoints

2. **Update TransakOrderService.ts:**
   - [ ] Change `TRANSAK_ENV` to 'PRODUCTION'
   - [ ] Update `TRANSAK_BASE_URL` to production endpoint
   - [ ] Update API key to production key
   - [ ] Test production API calls

3. **Update Netlify Functions:**
   - [ ] Update `netlify/functions/fetch-transak-order.ts`
   - [ ] Update `netlify/functions/create-transak-session.ts`
   - [ ] Set production environment variables in Netlify
   - [ ] Test production functions

4. **Update Environment Variables:**
   - [ ] Update `eas.json` production profile
   - [ ] Set `EXPO_PUBLIC_TRANSAK_ENV=PRODUCTION`
   - [ ] Set production API keys
   - [ ] Verify all environment variables

5. **Test Production:**
   - [ ] Test buy transaction in production
   - [ ] Test sell transaction in production
   - [ ] Verify transaction capture
   - [ ] Verify transaction display

**Files to Modify:**
- `src/screens/Buy.tsx`
- `src/services/TransakOrderService.ts`
- `netlify/functions/fetch-transak-order.ts`
- `netlify/functions/create-transak-session.ts`
- `eas.json`

**Testing:**
- Manual test: Buy transaction in production
- Manual test: Sell transaction in production
- Verify: All transactions work
- Verify: No staging references remain

---

### TODO-018: Configure Production Environment Variables
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 2-3 hours  
**Status:** Pending

**Tasks:**
1. **Review eas.json:**
   - [ ] Verify production profile exists
   - [ ] Verify all required variables are set
   - [ ] Verify API keys are production keys
   - [ ] Verify RPC URLs are production URLs

2. **Set Environment Variables:**
   - [ ] Set `EXPO_PUBLIC_TRANSAK_API_KEY` (production)
   - [ ] Set `EXPO_PUBLIC_TRANSAK_ENV=PRODUCTION`
   - [ ] Set `EXPO_PUBLIC_COVALENT_KEY` (production)
   - [ ] Set `EXPO_PUBLIC_COINGECKO_API_KEY` (production)
   - [ ] Set all production RPC URLs
   - [ ] Set all production explorer URLs

3. **Set Netlify Environment Variables:**
   - [ ] Set `TRANSAK_API_KEY` (production)
   - [ ] Set `TRANSAK_ENV=PRODUCTION`
   - [ ] Set `TRANSAK_ACCESS_TOKEN` (production)
   - [ ] Verify all variables are set

4. **Test Configuration:**
   - [ ] Test production build
   - [ ] Verify all APIs work
   - [ ] Verify all endpoints are accessible
   - [ ] Verify no staging references

**Files to Modify:**
- `eas.json`
- Netlify dashboard (environment variables)

**Testing:**
- Run: `eas build --platform android --profile production`
- Verify: Build succeeds
- Verify: All APIs work in production build
- Verify: No staging references

---

### TODO-019: Finalize Build Configuration
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 3-5 hours  
**Status:** Pending

**Tasks:**
1. **Review app.json:**
   - [ ] Verify app name: "Crypto Pal"
   - [ ] Verify package name: "com.crwmlw.cryptopal"
   - [ ] Verify version number
   - [ ] Verify app icons
   - [ ] Verify splash screens

2. **Review eas.json:**
   - [ ] Verify production profile
   - [ ] Verify build type: "app-bundle"
   - [ ] Verify signing configuration
   - [ ] Verify environment variables

3. **Test Builds:**
   - [ ] Test APK build: `npm run build:apk`
   - [ ] Test AAB build: `npm run build:aab`
   - [ ] Verify build succeeds
   - [ ] Verify build size is acceptable (< 50MB)

4. **Verify Signing:**
   - [ ] Verify signing keys are configured
   - [ ] Verify signing works
   - [ ] Verify app can be installed

**Files to Modify:**
- `app.config.js`
- `eas.json`

**Testing:**
- Run: `npm run build:apk`
- Run: `npm run build:aab`
- Verify: Both builds succeed
- Verify: Builds are installable
- Verify: Builds work on test devices

---

## Phase 7: Security & Performance

### TODO-020: Security Audit
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 20-30 hours  
**Status:** Pending

**Tasks:**
1. **Key Management Audit:**
   - [ ] Verify keys are stored securely (SecureStore)
   - [ ] Verify keys are never logged
   - [ ] Verify keys are not exposed in code
   - [ ] Verify key derivation is correct

2. **Transaction Security Audit:**
   - [ ] Verify transaction signing is secure
   - [ ] Verify address validation before transactions
   - [ ] Verify gas limit validation
   - [ ] Verify transaction confirmation flow

3. **API Security Audit:**
   - [ ] Verify HTTPS only (no HTTP)
   - [ ] Verify API keys are not exposed
   - [ ] Verify no sensitive data in requests
   - [ ] Verify request signing (if applicable)

4. **Data Protection Audit:**
   - [ ] Verify encrypted storage
   - [ ] Verify no sensitive data in logs
   - [ ] Verify secure session management
   - [ ] Verify privacy compliance

5. **Code Security Audit:**
   - [ ] Review code for vulnerabilities
   - [ ] Check for hardcoded secrets
   - [ ] Check for SQL injection risks
   - [ ] Check for XSS risks

**Testing:**
- Manual audit: All security areas
- Automated scan: Use security scanning tools
- Fix: All security issues
- Document: Security findings

---

### TODO-021: Performance Optimization
**Priority:** 🟡 HIGH  
**Estimated Time:** 20-30 hours  
**Status:** Pending

**Tasks:**
1. **Profile App Performance:**
   - [ ] Profile on Samsung S20
   - [ ] Profile on Samsung A24
   - [ ] Identify performance bottlenecks
   - [ ] Document performance metrics

2. **Optimize Code:**
   - [ ] Optimize transaction loading
   - [ ] Optimize asset fetching
   - [ ] Optimize WebView memory usage
   - [ ] Optimize image loading
   - [ ] Optimize FlatList rendering

3. **Optimize Bundle Size:**
   - [ ] Analyze bundle size
   - [ ] Remove unused dependencies
   - [ ] Optimize imports
   - [ ] Code splitting
   - [ ] Tree shaking

4. **Optimize Network:**
   - [ ] Reduce API calls
   - [ ] Implement request batching
   - [ ] Optimize cache strategy
   - [ ] Reduce payload sizes

5. **Test Performance:**
   - [ ] Test on high-end device
   - [ ] Test on mid-range device
   - [ ] Test on low-end device
   - [ ] Verify performance targets met

**Testing:**
- Profile: App performance
- Measure: All performance metrics
- Verify: Performance targets met
- Document: Performance improvements

---

## Phase 8: AAB Build & Launch

### TODO-022: Pre-Build Checklist
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 4-6 hours  
**Status:** Pending

**Checklist:**
- [ ] All tests passing (100%)
- [ ] Production configuration complete
- [ ] Security audit passed
- [ ] Performance acceptable
- [ ] Manual testing complete on multiple devices
- [ ] Transaction flows verified
- [ ] Error handling verified
- [ ] User documentation complete
- [ ] Privacy policy complete
- [ ] Terms of service complete
- [ ] App icons and splash screens ready
- [ ] Store listing assets ready

**Testing:**
- Review: Entire checklist
- Verify: All items complete
- Document: Any remaining items

---

### TODO-023: Create AAB Build
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 2-4 hours  
**Status:** Pending

**Tasks:**
1. **Final Verification:**
   - [ ] Review all configuration
   - [ ] Verify all environment variables
   - [ ] Verify signing keys
   - [ ] Verify app version

2. **Create Build:**
   - [ ] Run: `eas build --platform android --profile production`
   - [ ] Monitor build progress
   - [ ] Verify build succeeds
   - [ ] Download build artifact

3. **Test Build:**
   - [ ] Install on test device
   - [ ] Verify app works
   - [ ] Verify all features work
   - [ ] Verify performance is acceptable
   - [ ] Verify no critical bugs

4. **Verify Build Quality:**
   - [ ] Check build size
   - [ ] Check build metadata
   - [ ] Verify signing
   - [ ] Verify version number

**Testing:**
- Run: Build command
- Install: On test device
- Test: All features
- Verify: Everything works

---

### TODO-024: Play Store Preparation
**Priority:** 🔴 CRITICAL  
**Estimated Time:** 8-12 hours  
**Status:** Pending

**Tasks:**
1. **Prepare Store Assets:**
   - [ ] App icon (512x512)
   - [ ] Feature graphic (1024x500)
   - [ ] Screenshots (multiple sizes)
   - [ ] Short description
   - [ ] Full description
   - [ ] Privacy policy URL
   - [ ] Terms of service URL

2. **Complete Store Listing:**
   - [ ] App name: "Crypto Pal"
   - [ ] Category: Finance
   - [ ] Age rating: 17+ (financial transactions)
   - [ ] Content rating: PEGI 3
   - [ ] Keywords
   - [ ] Support URL

3. **Prepare Release:**
   - [ ] Create release notes
   - [ ] Choose release track (Internal/Alpha/Beta/Production)
   - [ ] Set release percentage (if gradual rollout)
   - [ ] Set release countries

4. **Submit for Review:**
   - [ ] Submit to Play Store
   - [ ] Monitor review status
   - [ ] Respond to any review comments
   - [ ] Publish when approved

**Testing:**
- Review: All store assets
- Verify: All information is correct
- Test: Store listing preview
- Verify: Links work

---

## Summary

### Total Estimated Time: 500-700 hours (12-17 weeks)

### Priority Breakdown:
- 🔴 CRITICAL: 15 tasks (300-400 hours)
- 🟡 HIGH: 6 tasks (150-200 hours)
- 🟢 MEDIUM: 3 tasks (50-100 hours)

### Phases:
1. **Phase 1 (Foundation):** 60-90 hours
2. **Phase 2 (Code Quality):** 80-115 hours
3. **Phase 3 (API Management):** 40-55 hours
4. **Phase 4 (Testing Infrastructure):** 115-145 hours
5. **Phase 5 (E2E Testing):** 130-180 hours
6. **Phase 6 (Production Config):** 7-12 hours
7. **Phase 7 (Security & Performance):** 40-60 hours
8. **Phase 8 (Build & Launch):** 14-22 hours

---

## Critical Path

**Must Complete Before AAB Build:**
1. TODO-001: Expand Transak Network Coverage
2. TODO-007: Implement Multi-Provider Price Service
3. TODO-008: Implement API Request Throttling
4. TODO-010: Set Up Unit Testing Infrastructure
5. TODO-013: Set Up Headless Server Testing
6. TODO-014: Comprehensive User Flow Testing
7. TODO-017: Switch to Production Transak API
8. TODO-018: Configure Production Environment Variables
9. TODO-019: Finalize Build Configuration
10. TODO-022: Pre-Build Checklist
11. TODO-023: Create AAB Build

**Can Complete After AAB Build:**
- TODO-003: Refactor Buy.tsx (can be done incrementally)
- TODO-004: Refactor StableHistoryTab.tsx (can be done incrementally)
- TODO-005: Refactor useTransactionStore.ts (can be done incrementally)
- TODO-006: Remove Debug Logging (can be done incrementally)
- TODO-021: Performance Optimization (can be done incrementally)

---

**Document Status:** Ready for Execution  
**Last Updated:** January 2025  
**Next Review:** After Phase 1 completion

