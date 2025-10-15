// src/store/useChainStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type ChainState = {
  activeChainId: number;
  setActiveChainId: (id: number) => void;
};

export const useChainStore = create<ChainState>()(
  persist(
    (set) => ({
      activeChainId: 11155111, // Sepolia as the default boot chain
      setActiveChainId: (id) => set({ activeChainId: id }),
    }),
    { name: "cp-active-chain" }
  )
);
