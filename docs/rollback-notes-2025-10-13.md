# Rollback Notes – 2025-10-13

**Git**
- Branch: apk-stable-2025-10-13
- Tag: v0.7.0-apk-stable-2025-10-13
- Commit: 58f4ef0d

**Expo / EAS**
- Expo SDK(s): (from package.json)  ← see below snapshot
- EAS Environments where key is enabled: development, preview, production
- app.config.js: using precomputed COVALENT_AUTH_B64 in extra
- ETHERSCAN_BASE: (e.g.) https://sepolia.etherscan.io
- ETH_RPC_URL: (e.g.) https://rpc.sepolia.org

**Keys (redacted)**
- EXPO_PUBLIC_COVALENT_KEY = cqt_…[REDACTED]
- COVALENT_AUTH_B64 (derived) = [REDACTED]
- Other EXPO_PUBLIC_* present: WALLET_CONNECT_PROJECT_ID, ONE_INCH_API_KEY, etc (see env-snapshot below)

**Key Code Files (at this point)**
- src/lib/covalent.ts  (single helper, Authorization: Basic <b64>)
- src/hooks/useAssets.ts (no ?key=; uses covalentGet)
- src/hooks/useHistory.ts (no ?key=; uses covalentGet)
- src/hooks/useTransactions.ts (no ?key=; uses covalentGet)
- src/screens/SendTab.tsx (fast fee, token-only fee confirm)
- src/screens/HistoryTab.tsx (feeEth consistency, blue cards, status color)

**Notes**
- APK verified stable; fee in Send == fee in History (using feeEth).
- ExpoGo still OK.
