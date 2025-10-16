// src/store/useSettingsStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SettingsState = {
  biometricEnabled: boolean;
  hydrate: () => Promise<void>;
  setBiometricEnabled: (v: boolean) => Promise<void>;
};

const KEY = 'settings_biometric_enabled';

export const useSettingsStore = create<SettingsState>((set, get) => ({
  biometricEnabled: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ biometricEnabled: raw === 'true' });
    } catch {
      // ignore
    }
  },
  setBiometricEnabled: async (v: boolean) => {
    set({ biometricEnabled: v });
    try {
      await AsyncStorage.setItem(KEY, v ? 'true' : 'false');
    } catch {
      // ignore
    }
  },
}));
