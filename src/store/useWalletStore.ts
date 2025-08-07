// src/store/useWalletStore.ts
import { create } from 'zustand';

type WalletState = {
  address: string;
  ethBalance?: string;
  usdcBalance?: string;
  setAddress: (addr: string) => void;
  setBalances: (eth: string, usdc: string) => void;
};

export const useWalletStore = create<WalletState>((set) => ({
  address: '',
  ethBalance: undefined,
  usdcBalance: undefined,

  setAddress: (addr) => set({ address: addr }),
  setBalances: (eth, usdc) => set({ ethBalance: eth, usdcBalance: usdc }),
}));
