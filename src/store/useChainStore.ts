// src/store/useChainStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import AsyncStorage from '@react-native-async-storage/async-storage';

type ChainState = {
  activeChainId: number;
  setActiveChainId: (id: number) => void;
};

export const useChainStore = create<ChainState>()(
  persist(
    (set) => ({
      activeChainId: 0, // All Networks as the default
      setActiveChainId: (id) => {
        console.log('useChainStore: Setting activeChainId to', id);
        set({ activeChainId: id });
      },
    }),
    { 
      name: "cp-active-chain",
      storage: {
        getItem: async (name) => {
          try {
            const value = await AsyncStorage.getItem(name);
            console.log('useChainStore: Getting item from storage:', value);
            // Only return null if no value exists, otherwise use stored value
            return value ? JSON.parse(value) : null;
          } catch (error) {
            console.warn('Failed to get item from AsyncStorage:', error);
            return null;
          }
        },
        setItem: async (name, value) => {
          try {
            console.log('useChainStore: Setting item in storage:', value);
            await AsyncStorage.setItem(name, JSON.stringify(value));
          } catch (error) {
            console.warn('Failed to set item in AsyncStorage:', error);
          }
        },
        removeItem: async (name) => {
          try {
            await AsyncStorage.removeItem(name);
          } catch (error) {
            console.warn('Failed to remove item from AsyncStorage:', error);
          }
        },
      }
    }
  )
);
