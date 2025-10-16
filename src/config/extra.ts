// src/config/extra.ts
import Constants from "expo-constants";
import { Buffer } from "buffer";

type Extra = Record<string, any>;
const expoExtra: Extra = (Constants.expoConfig?.extra ?? {}) as Extra;

// Read from Expo extra first (what app.config.js exposes), then process.env (dev)
const read = (...keys: string[]) => {
  for (const k of keys) {
    const v = (expoExtra[k] ?? (process.env as any)[k]) as string | undefined;
    if (typeof v === "string" && v.length) return v;
  }
  return "";
};

const build = () => {
  // Core key (support both names)
  const COVALENT_KEY = read("EXPO_PUBLIC_COVALENT_KEY", "COVALENT_KEY");
  const HAS_COVALENT = /^cqt_/i.test(COVALENT_KEY);

  // Prefer any env-provided b64; else compute from key
  const COVALENT_AUTH_B64 =
    read("COVALENT_AUTH_B64", "COVALENT_BASIC_B64", "EXPO_PUBLIC_COVALENT_BASIC_B64") ||
    (HAS_COVALENT ? Buffer.from(`${COVALENT_KEY}:`).toString("base64") : "");

  // Some call sites use an X-API-Key header
  const COVALENT_X_API_KEY = read("COVALENT_X_API_KEY", "EXPO_PUBLIC_COVALENT_KEY", "COVALENT_KEY") || "";

  // RPC / explorers (support either naming style)
  const ETHERSCAN_BASE = read("EXPO_PUBLIC_ETHERSCAN_BASE", "ETHERSCAN_BASE");
  const ETH_RPC_URL = read("EXPO_PUBLIC_ETH_RPC_URL", "ETH_RPC_URL");
  const BSC_RPC_URL = read("EXPO_PUBLIC_BSC_RPC_URL", "BSC_RPC_URL");
  const BSCSCAN_BASE = read("EXPO_PUBLIC_BSCSCAN_BASE", "BSCSCAN_BASE");
  const POLYGON_RPC_URL = read("EXPO_PUBLIC_POLYGON_RPC_URL", "POLYGON_RPC_URL");

  // Convenience header for Covalent clients
  const COVALENT_HEADERS: Record<string, string> =
    HAS_COVALENT
      ? (COVALENT_AUTH_B64
          ? { Authorization: `Basic ${COVALENT_AUTH_B64}` }
          : { "X-API-Key": COVALENT_X_API_KEY || COVALENT_KEY })
      : {};

  if (__DEV__) {
    console.log("[ENV_CHECK]", {
      keyLen: COVALENT_KEY.length,
      keyPrefix: COVALENT_KEY.slice(0, 4),
      b64Len: COVALENT_AUTH_B64?.length || 0,
      ethRpc: ETH_RPC_URL || null,
      bscRpc: BSC_RPC_URL || null,
      polygonRpc: POLYGON_RPC_URL || null,
      etherscan: ETHERSCAN_BASE || null,
      bscscan: BSCSCAN_BASE || null,
    });
  }

  return {
    // what your hooks use:
    COVALENT_AUTH_B64,
    COVALENT_X_API_KEY,
    COVALENT_HEADERS,

    // keep commonly-used values available (non-breaking)
    EXPO_PUBLIC_COVALENT_KEY: COVALENT_KEY,
    COVALENT_KEY,
    ETHERSCAN_BASE,
    ETH_RPC_URL,
    BSC_RPC_URL,
    BSCSCAN_BASE,
    POLYGON_RPC_URL,
  };
};

// 👉 Named export exactly as your hooks import
export const getExtra = () => build();

// (Optional) default export, in case any legacy code does a default import
export default getExtra;
