// src/config/extra.ts
import Constants from "expo-constants";
// expo-updates may not be installed, so import type-safely
let Updates: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Updates = require("expo-updates");
} catch (_) {}

export function getExtra<T extends Record<string, any> = Record<string, any>>(): T {
  // Order: expoConfig.extra (SDK 49+ dev/preview), updates.manifest.extra (prod),
  // old Constants.manifest.extra fallback.
  const fromExpo = (Constants as any)?.expoConfig?.extra;
  const fromUpdates = Updates?.manifest?.extra;
  const fromLegacy = (Constants as any)?.manifest?.extra;
  return (fromExpo || fromUpdates || fromLegacy || {}) as T;
}
