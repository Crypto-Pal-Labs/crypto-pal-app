// src/utils/env.ts - Safe static env reader for dev/builds
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Runtime extra fallback (for APKs if inlining fails)
const runtimeExtra =
  (Updates as any)?.manifest?.extra ||
  (Constants as any)?.expoConfig?.extra ||
  {};

export const ENV = {
  // Static references for Expo compile-time inlining (EAS/APK bundling) with trim for whitespace
  COVALENT_KEY: (process.env.EXPO_PUBLIC_COVALENT_KEY || runtimeExtra.COVALENT_KEY || '').trim(),
  // Add other keys if needed
} as const;