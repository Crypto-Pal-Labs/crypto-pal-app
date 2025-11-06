// src/hooks/useAssets.ts
// DISABLED: This hook was causing ETH duplication
// Wallet.tsx now uses useAssetsSimplified instead

import { BalanceItem, NFTItem } from "./useAssetsSimplified";

// ---------- Hook ----------
export const useAssets = () => {
  // DISABLED: This hook is causing ETH duplication
  // Wallet.tsx now uses useAssetsSimplified instead
  console.log('useAssets: DISABLED - returning empty data to prevent ETH duplication');
  
  return {
    balances: [] as BalanceItem[],
    nfts: [] as NFTItem[],
    loading: false,
    error: null,
    refresh: () => Promise.resolve(),
    forceRefresh: () => Promise.resolve(),
    loadCgPrices: () => Promise.resolve({})
  };
};

// Export loadCgPrices for compatibility
export const loadCgPrices = (symbols?: string[], localCurrency?: string) => Promise.resolve({});