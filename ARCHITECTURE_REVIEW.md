# Crypto Pal - Comprehensive Architecture Review & Refactoring Plan
**Date:** 2025-11-02  
**Purpose:** Deep analysis and systematic refactoring to create a world-class, reliable crypto wallet

---

## Executive Summary

After reviewing the entire codebase and conversation history, I've identified **critical architectural issues** that explain why the app requires constant patching. The current architecture lacks:

1. **Single Source of Truth** - Data scattered across AsyncStorage, Zustand stores, and component state
2. **Event-Driven Updates** - Components don't coordinate refreshes properly
3. **Transaction Flow Integrity** - Transaction capture → storage → UI updates is unreliable
4. **Proper State Synchronization** - Multiple refresh mechanisms compete instead of coordinate

---

## Current Architecture Issues

### 1. **Fragmented State Management**

**Problem:**
- Zustand stores (`useWalletStore`, `useChainStore`, `useAuthStore`) for UI state
- AsyncStorage for persistence
- Component-level state for transactions
- No centralized transaction state manager

**Impact:**
- Data inconsistency between Wallet, History, and Buy tabs
- Race conditions when updating data
- No way to ensure all components see the same data

### 2. **Transaction Flow is Broken**

**Current Flow:**
```
Buy.tsx → TransactionCaptureService → TransactionStorageService → AsyncStorage
                                                    ↓
                                    (no reliable trigger) → History Tab (manual refresh)
                                    (no reliable trigger) → Wallet Tab (manual refresh)
```

**Problems:**
- Transaction saved but UI not notified
- Multiple refresh mechanisms (`triggerHistoryRefresh`, `recent_transak_purchase` flag, polling)
- No guarantee that updates propagate
- `tokenSymbol` often missing because of timing issues

### 3. **Refresh Mechanism Chaos**

**Multiple Competing Systems:**
1. `TransactionStorageService.triggerHistoryRefresh()` - event emitter
2. `recent_transak_purchase` AsyncStorage flag - polling
3. `useFocusEffect` hooks - navigation-based
4. Manual polling in History tab (30s intervals)
5. Force refresh in Wallet tab
6. Cache invalidation with timestamps

**Problem:** These don't coordinate, leading to:
- Duplicate refreshes
- Missed refreshes
- Race conditions
- Inconsistent UI state

---

## Recommended Architecture (Based on Industry Best Practices)

### Industry Research Findings:

1. **MetaMask, Trust Wallet, Coinbase Wallet** use:
   - Centralized transaction store with event emitters
   - Single source of truth for all wallet data
   - Optimistic updates with rollback on failure
   - WebSocket/SSE for real-time updates

2. **React Native Crypto Wallet Patterns:**
   - Use Redux/Zustand for global state
   - Event-driven architecture for updates
   - Service layer abstraction for API calls
   - Consistent error handling and retry logic

### Proposed Architecture:

```
┌─────────────────────────────────────────────────────────┐
│                   APP LAYER (React)                      │
├─────────────────────────────────────────────────────────┤
│  Screens (Buy, Wallet, History) → React Components       │
│       ↓                                                  │
│  Custom Hooks (useAssets, useTransactions)              │
│       ↓                                                  │
├─────────────────────────────────────────────────────────┤
│              STATE MANAGEMENT LAYER                     │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐  │
│  │  TransactionStore (Zustand)                      │  │
│  │  - Single source of truth for all transactions    │  │
│  │  - Event emitters for updates                    │  │
│  │  - Optimistic updates with rollback             │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  AssetStore (Zustand)                            │  │
│  │  - Single source of truth for balances          │  │
│  │  - Cache management                             │  │
│  │  - Price updates                                │  │
│  └──────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│              SERVICE LAYER                              │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐  │
│  │  TransactionService                              │  │
│  │  - Capture transactions                         │  │
│  │  - Update transactions                         │  │
│  │  - Sync with APIs                               │  │
│  │  - Emit events to TransactionStore              │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  AssetService                                    │  │
│  │  - Fetch balances                                │  │
│  │  - Update prices                                │  │
│  │  - Emit events to AssetStore                     │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  TransakService                                  │  │
│  │  - Handle Transak integration                   │  │
│  │  - Fetch order details                          │  │
│  │  - Retry logic                                  │  │
│  └──────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│              PERSISTENCE LAYER                          │
├─────────────────────────────────────────────────────────┤
│  AsyncStorage (encrypted)                               │
│  - Transaction cache                                    │
│  - Asset cache                                          │
│  - User preferences                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Refactoring Plan

### Phase 1: Create Centralized Transaction Store (HIGH PRIORITY)

**Goal:** Single source of truth for all transactions

**Steps:**
1. Create `src/store/useTransactionStore.ts` (Zustand)
2. Move all transaction logic from services to store
3. Implement event system for real-time updates
4. Replace all `TransactionStorageService` direct calls with store actions

**Benefits:**
- All components automatically see updates
- No manual refresh needed
- Guaranteed consistency

### Phase 2: Implement Event-Driven Updates

**Goal:** Components react to data changes automatically

**Steps:**
1. Use Zustand subscriptions for reactive updates
2. Remove all manual refresh calls
3. Implement optimistic updates
4. Add proper error handling with rollback

### Phase 3: Refactor Transaction Capture Flow

**Goal:** Reliable, atomic transaction capture with immediate UI updates

**Steps:**
1. Refactor `Buy.tsx` to use TransactionStore actions
2. Ensure `tokenSymbol` is captured correctly from start
3. Implement retry logic at store level, not component level
4. Remove all AsyncStorage flags and polling

### Phase 4: Consolidate Asset Management

**Goal:** Single source of truth for balances

**Steps:**
1. Create `src/store/useAssetStore.ts`
2. Move asset fetching logic to store
3. Implement proper caching strategy
4. Coordinate with TransactionStore for purchased tokens

---

## Implementation Details

### TransactionStore Structure:

```typescript
interface TransactionStore {
  // State
  transactions: Record<string, Transaction[]>; // keyed by wallet address
  pendingTransactions: string[]; // transaction IDs being processed
  
  // Actions
  addTransaction: (tx: Transaction) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  fetchTransactions: (address: string) => Promise<void>;
  syncPendingTransactions: () => Promise<void>; // Retry failed/missing data
  
  // Computed
  getTransactions: (address: string, filter?: Filter) => Transaction[];
  
  // Events (internal)
  onTransactionUpdate: (callback: () => void) => () => void;
}
```

### Key Principles:

1. **Immediate Updates:** Store updates trigger component re-renders automatically
2. **Optimistic Updates:** UI updates immediately, rollback on error
3. **Automatic Retry:** Store-level retry for missing data (tokenSymbol, etc.)
4. **No Manual Refreshes:** Components subscribe to store, no pull needed

---

## Migration Strategy

### Step-by-Step:

1. **Week 1:** Create TransactionStore, migrate transaction read operations
2. **Week 2:** Migrate transaction write operations (capture, update)
3. **Week 3:** Remove old TransactionStorageService direct calls
4. **Week 4:** Create AssetStore, migrate balance management
5. **Week 5:** Testing, bug fixes, polish

### Backward Compatibility:

- Keep old services during migration
- Gradually replace calls
- Maintain old APIs until all components migrated

---

## Testing Strategy

1. **Unit Tests:** Test store actions in isolation
2. **Integration Tests:** Test transaction flow end-to-end
3. **E2E Tests:** Test complete user flows (buy → see in wallet → see in history)

---

## Success Metrics

- ✅ No manual refresh needed - transactions appear immediately
- ✅ 100% transaction capture rate - no missing tokenSymbol
- ✅ Consistent UI state across all tabs
- ✅ No race conditions or data inconsistencies
- ✅ Sub-second UI updates after transaction completion

---

## Next Steps

I will now implement Phase 1: Create the TransactionStore as the foundation for a reliable, world-class crypto wallet.

