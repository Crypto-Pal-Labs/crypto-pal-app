// app.config.js
const fs = require("fs");
const path = require("path");

// Detect EAS cloud build vs local dev
const isEas = !!process.env.EAS_BUILD;

// Load .env only on local/dev (never needed on EAS where EXPO_PUBLIC_* are injected)
if (!isEas) {
  const devEnvPath = path.resolve(__dirname, ".env.development");
  if (fs.existsSync(devEnvPath)) {
    try { require("dotenv").config({ path: devEnvPath }); } catch {}
  } else {
    try { require("dotenv").config(); } catch {}
  }
}

// Helper to read EXPO_PUBLIC_* first, then plain env (for local .env fallback)
const getPublic = (name, fallback = "") =>
  process.env[`EXPO_PUBLIC_${name}`] || process.env[name] || fallback;

// --- Required public vars (safe to embed in app) ---
const COVALENT_KEY = getPublic("COVALENT_KEY", "");
const looksPlaceholder = /^\s*(\$\(|\$\{)/.test(COVALENT_KEY) || COVALENT_KEY.length < 20;
if (!COVALENT_KEY.startsWith("cqt_") || looksPlaceholder) {
  throw new Error(
    `[BUILD] Invalid COVALENT_KEY. Got "${String(COVALENT_KEY).slice(0, 12)}..." ` +
    `It must start with "cqt_" and not be a placeholder like $(COVALENT_KEY).`
  );
}
const COVALENT_AUTH_B64 = Buffer.from(`${COVALENT_KEY}:`).toString("base64");

const ETH_RPC_URL = getPublic("ETH_RPC_URL", "https://sepolia.infura.io/v3/<your-infura-id>");
if (!/^https?:\/\//.test(ETH_RPC_URL)) {
  throw new Error("[BUILD] ETH_RPC_URL must be a full URL (e.g. https://...).");
}

module.exports = ({ config }) => ({
  ...config,
  name: "Crypto Pal",
  slug: "crypto-pal-app",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  assetBundlePatterns: ["**/*"],

  ios: {
    supportsTablet: true,
    // TODO: set this to the same value you choose for Android below (once, permanently)
    bundleIdentifier: "trade.cryptopal.app",
    infoPlist: {
      NSCameraUsageDescription: "Used to scan QR codes for addresses and payments."
    }
  },

  android: {
    // TODO: choose your permanent package before first Play upload (e.g. trade.cryptopal.app)
    package: "trade.cryptopal.app",
    permissions: ["CAMERA"],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    softwareKeyboardLayoutMode: "pan"
  },

  web: { favicon: "./assets/favicon.png" },

  plugins: [
    "expo-secure-store",
    "expo-build-properties",
    "expo-localization",
    "expo-camera"
  ],

  extra: {
    eas: {
      // Keep your existing EAS projectId here
      projectId: "6c753f76-cdce-4f42-8301-4b22267269c4"
    },
    // Precomputed Basic token for Covalent (server expects "Basic <b64(key:)>")
    COVALENT_KEY,
    COVALENT_AUTH_B64,

    // Optional/feature flags (public only)
    TRANSAK_API_KEY: getPublic("TRANSAK_API_KEY", ""),
    ONE_INCH_API_KEY: getPublic("ONE_INCH_API_KEY", ""),

    ETHERSCAN_BASE: getPublic("ETHERSCAN_BASE", ""),
    ETH_RPC_URL,
    BSC_RPC_URL: getPublic("BSC_RPC_URL", "https://bsc-testnet.publicnode.com"),
    BSCSCAN_BASE: getPublic("BSCSCAN_BASE", ""),

    WALLET_CONNECT_PROJECT_ID: getPublic("WALLET_CONNECT_PROJECT_ID", ""),

    ONE_INCH_API_BASE: getPublic("ONE_INCH_API_BASE", ""),
    UNISWAP_ROUTER_ADDRESS: getPublic("UNISWAP_ROUTER_ADDRESS", ""),
    USDC_ADDRESS: getPublic("USDC_ADDRESS", ""),
    WETH_ADDRESS: getPublic("WETH_ADDRESS", ""),
    CONTRACT_ADDRESS: getPublic("CONTRACT_ADDRESS", ""),

    ALCHEMY_KEY: getPublic("ALCHEMY_KEY", ""),
    POLYGON_RPC_URL: getPublic("POLYGON_RPC_URL", "https://rpc-amoy.polygon.technology")
  }
});
