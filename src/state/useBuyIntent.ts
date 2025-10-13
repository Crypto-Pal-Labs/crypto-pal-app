// src/state/useBuyIntent.ts
import { create } from 'zustand';

export type BuyIntent = {
  assetSymbol: string;   // e.g., 'BTC'
  assetName: string;     // e.g., 'Bitcoin'
  coingeckoId?: string;  // e.g., 'bitcoin'
  network?: string;      // e.g., 'ethereum'
};

type Store = {
  intent: BuyIntent | null;
  setIntent: (i: BuyIntent) => void;
  clearIntent: () => void;
};

export const useBuyIntent = create<Store>((set) => ({
  intent: null,
  setIntent: (i) => set({ intent: i }),
  clearIntent: () => set({ intent: null }),
}));
