import { create } from 'zustand';

type LockState = {
  isLocked: boolean;
  inactivityMs: number;      // default 5 minutes
  lastInteractionAt: number; // timestamp (ms)
  lastBackgroundAt: number | null;

  setInactivityMinutes: (mins: number) => void;
  touch: () => void;           // record user activity
  wentBackground: () => void;  // record background time
  lockNow: () => void;         // manual lock
  unlock: () => void;          // clear lock flag after successful auth
};

export const useLockStore = create<LockState>((set, get) => ({
  isLocked: false,
  inactivityMs: 5 * 60 * 1000,
  lastInteractionAt: Date.now(),
  lastBackgroundAt: null,

  setInactivityMinutes: (mins) => set({ inactivityMs: Math.max(1, mins) * 60 * 1000 }),
  touch: () => set({ lastInteractionAt: Date.now() }),
  wentBackground: () => set({ lastBackgroundAt: Date.now() }),
  lockNow: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false, lastInteractionAt: Date.now() }),
}));
