# Implementation Plan: World-Class Crypto Wallet Architecture

## Overview

This document outlines the systematic implementation of a robust, event-driven architecture to replace the current patchwork system.

---

## Phase 1: TransactionStore Foundation ✅ (IN PROGRESS)

### Status: TransactionStore created

**What We Built:**
- Centralized Zustand store for all transactions
- Automatic persistence to AsyncStorage
- Event-driven updates (components auto-refresh)
- Optimistic updates with rollback
- Automatic retry for incomplete transactions

**Next Steps:**
1. Migrate `Buy.tsx` to use TransactionStore
2. Migrate `StableHistoryTab.tsx` to use TransactionStore
3. Remove old `TransactionStorageService` direct calls
4. Test end-to-end transaction flow

---

## Phase 2: Component Migration (NEXT)

### 2.1 Migrate Buy.tsx

**Current Issues:**
- Direct calls to `TransactionCaptureService`
- Manual refresh triggers
- Inconsistent tokenSymbol capture

**New Approach:**
```typescript
// Old (Buy.tsx):
await TransactionCaptureService.captureBuyTransaction(data, address);
await TransactionCaptureService.updateTransaction(id, updates, address);
TransactionStorageService.triggerHistoryRefresh();
await AsyncStorage.setItem('recent_transak_purchase', ...);

// New (Buy.tsx):
const { addTransaction, updateTransaction } = useTransactionStore();
const txId = await addTransaction(buyData, address);
// If API fetch needed:
await updateTransaction(txId, apiData, address);
// No manual refresh needed - components auto-update!
```

**Benefits:**
- Guaranteed tokenSymbol capture
- No manual refresh needed
- Automatic retry for missing data
- All components see updates instantly

### 2.2 Migrate StableHistoryTab.tsx

**Current Issues:**
- Manual polling every 30 seconds
- `useFocusEffect` subscriptions
- Manual refresh calls

**New Approach:**
```typescript
// Old:
const [transactions, setTransactions] = useState([]);
useFocusEffect(() => {
  fetchTransactions();
  const unsubscribe = TransactionStorageService.onTransactionUpdate(...);
  // Polling interval...
});

// New:
const transactions = useTransactions(address, { type: filterType });
// That's it! Auto-updates when store changes
```

**Benefits:**
- No manual polling needed
- No refresh buttons needed
- Real-time updates
- Automatic filtering

### 2.3 Migrate Wallet.tsx

**Current Issues:**
- Checks `recent_transak_purchase` flag
- Manual cache clearing
- Force refresh on purchase

**New Approach:**
```typescript
// Subscribe to transaction store
const buyTransactions = useTransactions(address, { type: 'BUY' });

// useAssets hook automatically includes purchased tokens
// No manual refresh needed
```

---

## Phase 3: AssetStore Creation

### Goal: Centralized balance management

**Structure:**
```typescript
interface AssetStore {
  balances: Record<string, BalanceItem[]>;
  prices: Record<string, number>;
  loading: boolean;
  
  fetchBalances: (address: string) => Promise<void>;
  updatePrices: (symbols: string[]) => Promise<void>;
  addPurchasedToken: (symbol: string, walletAddress: string) => void;
}
```

**Integration:**
- Coordinate with TransactionStore (purchased tokens)
- Automatic price updates
- Cache management

---

## Phase 4: Remove Legacy Code

### Cleanup Checklist:
- [ ] Remove `TransactionStorageService.triggerHistoryRefresh()`
- [ ] Remove `recent_transak_purchase` AsyncStorage flag
- [ ] Remove manual polling in HistoryTab
- [ ] Remove manual refresh calls
- [ ] Remove `TransactionCaptureService.updateTransaction()` (keep only for backward compat)
- [ ] Consolidate transaction capture logic

---

## Phase 5: Testing & Validation

### Test Scenarios:
1. **Buy Transaction Flow:**
   - Complete purchase
   - Verify appears in History immediately (no refresh)
   - Verify appears in Wallet immediately (no refresh)
   - Verify tokenSymbol always present

2. **Incomplete Transaction Recovery:**
   - Create transaction without tokenSymbol
   - Verify automatic retry fetches it
   - Verify UI updates when retry completes

3. **Multiple Tabs Open:**
   - Open History and Wallet tabs
   - Complete purchase
   - Verify both tabs update simultaneously

4. **Offline/Online:**
   - Complete transaction offline
   - Verify saved locally
   - Come online
   - Verify sync completes

---

## Success Criteria

✅ **Zero Manual Refresh Needed**
- All updates propagate automatically
- No "pull to refresh" needed for transactions

✅ **100% Data Completeness**
- No missing tokenSymbol
- All transactions have complete data
- Automatic retry ensures completion

✅ **Sub-Second UI Updates**
- Transactions appear instantly (<500ms)
- No loading spinners for local data

✅ **Consistent State**
- All tabs show same data
- No race conditions
- No stale data

---

## Timeline Estimate

- **Week 1:** Phase 1 complete ✅, Phase 2 migration starts
- **Week 2:** Phase 2 complete, Phase 3 starts
- **Week 3:** Phase 3 complete, Phase 4 cleanup
- **Week 4:** Phase 5 testing, bug fixes, polish

---

## Risk Mitigation

1. **Backward Compatibility:**
   - Keep old services during migration
   - Gradual migration (component by component)
   - Feature flags for new vs old

2. **Data Migration:**
   - Existing transactions loaded into store on first use
   - No data loss
   - Smooth transition

3. **Testing:**
   - Comprehensive testing at each phase
   - E2E tests before moving to next phase
   - User acceptance testing

---

## Next Immediate Steps

1. ✅ Create TransactionStore (DONE)
2. ⏳ Fix lint errors in TransactionStore
3. ⏳ Create migration guide for Buy.tsx
4. ⏳ Test TransactionStore in isolation
5. ⏳ Migrate Buy.tsx to use TransactionStore

