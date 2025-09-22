import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  hasMnemonic: boolean;
  hasPin: boolean;
  setAuthenticated: (value: boolean) => void;
  setHasMnemonic: (value: boolean) => void;
  setHasPin: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  hasMnemonic: false,
  hasPin: false,
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setHasMnemonic: (value) => set({ hasMnemonic: value }),
  setHasPin: (value) => set({ hasPin: value }),
}));