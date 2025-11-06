# Crypto Pal - Testing Guide
**Date:** January 2025  
**Purpose:** Comprehensive testing guide for production readiness

---

## 🧪 Testing Strategy

### Test Levels

1. **Unit Tests** (Critical services)
   - TransactionStore
   - TransakNetworkMapper
   - PriceService
   - RequestQueueService

2. **Integration Tests** (Key flows)
   - Buy transaction flow
   - Transaction history display
   - Wallet balance updates

3. **Manual Tests** (All user flows)
   - Complete buy transactions
   - Verify transaction display
   - Verify error handling

---

## 📝 Manual Testing Checklist

### 1. Buy Transaction Flow

#### Test Case: Buy ETH (Ethereum)
- [ ] Open Buy tab
- [ ] Select ETH
- [ ] Enter amount
- [ ] Complete purchase
- [ ] Verify transaction appears in History tab
- [ ] Verify token symbol is "ETH"
- [ ] Verify network is "Ethereum" (not "Sepolia")
- [ ] Verify amount is correct
- [ ] Verify transaction appears in Wallet tab

#### Test Case: Buy BTC (Bitcoin)
- [ ] Open Buy tab
- [ ] Select BTC
- [ ] Enter amount
- [ ] Complete purchase
- [ ] Verify transaction appears in History tab
- [ ] Verify token symbol is "BTC"
- [ ] Verify network is "Bitcoin"
- [ ] Verify amount is correct
- [ ] Verify transaction appears in Wallet tab

#### Test Case: Buy MATIC (Polygon)
- [ ] Open Buy tab
- [ ] Select MATIC
- [ ] Enter amount
- [ ] Complete purchase
- [ ] Verify transaction appears in History tab
- [ ] Verify token symbol is "MATIC"
- [ ] Verify network is "Polygon"
- [ ] Verify amount is correct

#### Test Case: Buy USDC (Ethereum)
- [ ] Open Buy tab
- [ ] Select USDC
- [ ] Enter amount
- [ ] Complete purchase
- [ ] Verify transaction appears in History tab
- [ ] Verify token symbol is "USDC"
- [ ] Verify network is "Ethereum"
- [ ] Verify amount is correct

### 2. Transaction History

#### Test Case: View All Transactions
- [ ] Open History tab
- [ ] Verify all transactions display
- [ ] Verify no duplicate transactions
- [ ] Verify transactions sorted by date (newest first)
- [ ] Verify transaction details are correct

#### Test Case: Filter Transactions
- [ ] Filter by BUY transactions
- [ ] Filter by SELL transactions
- [ ] Filter by SEND transactions
- [ ] Filter by RECEIVE transactions
- [ ] Verify filters work correctly

#### Test Case: Transaction Details
- [ ] Verify token symbol is correct
- [ ] Verify network name is correct (not "Sepolia" for non-testnet)
- [ ] Verify amount is correct
- [ ] Verify currency is correct
- [ ] Verify date/time is correct

### 3. Wallet Balance

#### Test Case: View All Balances
- [ ] Open Wallet tab
- [ ] Verify all tokens display
- [ ] Verify no "UNKNOWN" tokens
- [ ] Verify balances are correct
- [ ] Verify USD values are correct
- [ ] Verify local currency values are correct

#### Test Case: Balance Updates
- [ ] Complete a buy transaction
- [ ] Return to Wallet tab
- [ ] Verify balance updated correctly
- [ ] Verify USD value updated correctly

### 4. Error Handling

#### Test Case: Network Failure
- [ ] Turn off internet
- [ ] Try to view transactions
- [ ] Verify graceful error message
- [ ] Verify cached data displays (if available)
- [ ] Turn on internet
- [ ] Verify data refreshes

#### Test Case: API Rate Limiting
- [ ] Make multiple rapid requests
- [ ] Verify rate limiting works
- [ ] Verify requests are queued
- [ ] Verify requests complete after delay

#### Test Case: Transaction with Missing Data
- [ ] View transaction with missing orderId
- [ ] Verify transaction still displays
- [ ] Verify retry mechanism updates data
- [ ] Verify transaction eventually has complete data

---

## 🔍 Debugging Guide

### Check Logs

**Transaction Capture:**
```javascript
// Look for these logs in Buy.tsx
"Buy tab - 🔔 TRANSACTION COMPLETION DETECTED!"
"Buy tab - ✅ OrderId extracted from DOM"
"Buy tab - 💾 ABOUT TO SAVE TRANSACTION"
```

**Transaction Store:**
```javascript
// Look for these logs in useTransactionStore.ts
"TransactionStore: ✅ Transaction saved"
"TransactionStore: 🔄 Syncing incomplete transactions"
"TransactionStore: ✅ Transaction updated"
```

**Price Service:**
```javascript
// Look for these logs in PriceService.ts
"PriceService: Fetching from CoinGecko"
"PriceService: CoinGecko failed, trying CoinPaprika"
"PriceService: Using cached prices"
```

**Request Queue:**
```javascript
// Look for these logs in RequestQueueService.ts
"RequestQueueService: Enqueued request"
"RequestQueueService: API rate limited"
"RequestQueueService: ✅ Request completed successfully"
```

### Common Issues

#### Issue: Transaction Not Appearing
**Debug Steps:**
1. Check if orderId was extracted (look for "OrderId extracted" logs)
2. Check if transaction was saved (look for "Transaction saved" logs)
3. Check wallet address matches (normalized to lowercase)
4. Check if transaction is in AsyncStorage

#### Issue: Wrong Token Symbol
**Debug Steps:**
1. Check network detection logs
2. Check if API data was fetched
3. Check if URL inference was used
4. Check if retry mechanism updated data

#### Issue: Rate Limit Errors
**Debug Steps:**
1. Check RequestQueueService logs
2. Check rate limit status
3. Verify API key rotation is working
4. Check if fallback providers are being used

---

## 📊 Test Results Template

### Test Run: [Date]

**Build:** [Version/Build Number]  
**Device:** [Device Name/Model]  
**Android Version:** [Version]  
**Environment:** [Staging/Production]

#### Results:
- ✅ Buy ETH: PASS
- ✅ Buy BTC: PASS
- ✅ Buy MATIC: PASS
- ⚠️ Buy USDC: PARTIAL (minor display issue)
- ✅ Transaction History: PASS
- ✅ Wallet Balance: PASS
- ✅ Error Handling: PASS

#### Issues Found:
1. [Issue description]
   - Severity: [HIGH/MEDIUM/LOW]
   - Status: [FIXED/OPEN]
   - Notes: [Additional notes]

#### Overall Status: ✅ PASS / ⚠️ PASS WITH ISSUES / ❌ FAIL

---

## 🚀 Next Steps After Testing

1. **Fix Issues**
   - Address HIGH severity issues immediately
   - Address MEDIUM severity issues before launch
   - Document LOW severity issues for post-launch

2. **Re-test**
   - Re-test all failing test cases
   - Verify fixes don't introduce regressions

3. **Documentation**
   - Update release notes
   - Document any known issues
   - Update user guide

---

**Last Updated:** January 2025  
**Version:** 1.0.0
