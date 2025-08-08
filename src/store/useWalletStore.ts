// src/store/useWalletStore.ts
import { create } from 'zustand';

export type BalanceItem = {
  contract_ticker_symbol: string;
  balance: string;         // raw on-chain balance (in token’s smallest unit)
  quote: number;           // fiat value (NZD)
  logo_url: string;
};

type WalletState = {
  address: string;
  chainId: number;                   // ← current chain (1 = ETH, 56 = BSC)
  balances: BalanceItem[];
  setAddress: (addr: string) => void;
  setChainId: (chain: number) => void;            // ← new setter
  setBalances: (balances: BalanceItem[]) => void;
};

export const useWalletStore = create<WalletState>((set) => ({
  address: '',
  chainId: 1,                        // ← default to Ethereum
  balances: [],

  setAddress: (addr) => set({ address: addr }),
  setChainId: (chain) => set({ chainId: chain }),  // ← implement setter
  setBalances: (balances) => set({ balances }),
}));

