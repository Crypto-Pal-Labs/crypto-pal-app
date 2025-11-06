// App.js — single entry point for Crypto Pal

import "react-native-get-random-values";
import "@ethersproject/shims";
import { Buffer } from "buffer";
if (!global.Buffer) global.Buffer = Buffer;

// Polyfill for Node.js modules (required by bitcoinjs-lib and its dependencies)
// These need to be available before any modules that depend on them are loaded
try {
  // Events polyfill (needed by stream-browserify)
  if (typeof global.events === 'undefined') {
    const events = require('events');
    global.events = events;
  }
  
  // Stream polyfill (needed by bitcoinjs-lib dependencies)
  if (typeof global.stream === 'undefined') {
    try {
      const stream = require('stream-browserify');
      global.stream = stream;
    } catch (e) {
      // Fallback if stream-browserify fails to load
      global.stream = {};
    }
  }
} catch (e) {
  // Ignore errors during polyfill setup - app will gracefully degrade
  console.warn('Node.js polyfills setup warning (non-critical):', e.message);
}

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View, AppState } from "react-native";
import * as SecureStore from "expo-secure-store";

import { useAuthStore } from "./src/store/useAuthStore";
import { useWalletStore } from "./src/store/useWalletStore";
import { useSettingsStore } from "./src/store/useSettingsStore";
import AppNavigator from "./src/navigation/AppNavigator";
import { getWalletAddress } from "./src/utils/wallet";
import { getExtra } from "./src/config/extra";
import { canUseBiometrics, promptBiometric } from "./src/lib/biometrics";

// Step 6: auto-lock imports
import { useLockStore } from "./src/store/useLockStore";
import { triggerReauth } from "./src/utils/reauth";
import { TransactionDetectionService } from "./src/services/TransactionDetectionService";

export default function App() {
  const { setAuthenticated, setHasMnemonic, setHasPin } = useAuthStore();
  const setAddress = useWalletStore((s) => s.setAddress);
  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---- EXISTING AUTH / BOOTSTRAP ----
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Hydrate settings (biometricEnabled)
        await useSettingsStore.getState().hydrate();
        const biometricEnabled = useSettingsStore.getState().biometricEnabled;

        // --- migrate old keys ---
        const oldMnemonic = await SecureStore.getItemAsync("user_mnemonic");
        if (oldMnemonic) {
          await SecureStore.setItemAsync("mnemonic", oldMnemonic);
          await SecureStore.deleteItemAsync("user_mnemonic");
          console.log("Migrated old mnemonic key.");
        }
        const oldPin = await SecureStore.getItemAsync("user_pin");
        if (oldPin) {
          await SecureStore.setItemAsync("pin", oldPin);
          await SecureStore.deleteItemAsync("user_pin");
          console.log("Migrated old pin key.");
        }

        // --- read current auth facts ---
        const mnemonic = await SecureStore.getItemAsync("mnemonic");
        const pin = await SecureStore.getItemAsync("pin");
        const hasMn = !!mnemonic;
        const hasP = !!pin;

        setHasMnemonic(hasMn);
        setHasPin(hasP);
        setAuthenticated(hasMn && hasP); // preserve your semantics

        if (hasMn && hasP) {
          // Returning user → try biometric if enabled
          if (biometricEnabled && (await canUseBiometrics())) {
            try {
              // Add a small delay to ensure the activity is ready
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              const res = await promptBiometric("Unlock Crypto Pal");
              if (res.success) {
                // Skip PIN and go straight to the app
                const currentAddress = await getWalletAddress();
                if (currentAddress) {
                  setAddress(currentAddress);
                  // Start monitoring for incoming transactions
                  TransactionDetectionService.startMonitoring(currentAddress);
                }
                setInitialRoute({ name: "AppTabs" });
              } else {
                // Fallback to PIN
                const currentAddress = await getWalletAddress();
                if (currentAddress) {
                  setAddress(currentAddress);
                  // Start monitoring for incoming transactions
                  TransactionDetectionService.startMonitoring(currentAddress);
                }
                setInitialRoute({ name: "Pin", params: { isSetup: false } });
              }
            } catch (biometricError) {
              console.log("Biometric authentication failed, falling back to PIN:", biometricError);
              // Fallback to PIN on any biometric error
              const currentAddress = await getWalletAddress();
              if (currentAddress) {
                setAddress(currentAddress);
                // Start monitoring for incoming transactions
                TransactionDetectionService.startMonitoring(currentAddress);
              }
              setInitialRoute({ name: "Pin", params: { isSetup: false } });
            }
          } else {
            // No biometrics (or disabled) → PIN as before
            const currentAddress = await getWalletAddress();
            if (currentAddress) {
              setAddress(currentAddress);
              // Start monitoring for incoming transactions
              TransactionDetectionService.startMonitoring(currentAddress);
            }
            setInitialRoute({ name: "Pin", params: { isSetup: false } });
          }
        } else {
          // New user path
          setInitialRoute({ name: "Welcome" });
        }
      } catch (error) {
        console.error("Auth check error:", error);
        Alert.alert("Error", "Failed to check authentication. Redirecting to Welcome.");
        setInitialRoute({ name: "Welcome" });
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // ---- Diagnostics (safe) ----
    const EXTRA = getExtra();
    const rawKey = EXTRA?.COVALENT_KEY || "";
    const authLen = EXTRA?.COVALENT_AUTH_B64?.length || 0;
    const keyPrefix = typeof rawKey === "string" ? rawKey.slice(0, 4) : "";
    const dbg = String(process.env.EXPO_PUBLIC_DEBUG_AUTH || EXTRA?.EXPO_PUBLIC_DEBUG_AUTH || "");

    if (__DEV__) {
      console.log("[ENV_CHECK]", {
        keyPrefix,
        keyLen: (rawKey || "").length,
        b64Len: authLen,
        ethRpc: EXTRA?.ETH_RPC_URL || null,
        bscRpc: EXTRA?.BSC_RPC_URL || null,
        etherscan: EXTRA?.ETHERSCAN_BASE || null,
        bscscan: EXTRA?.BSCSCAN_BASE || null,
      });
    }

    if (!__DEV__ && dbg === "1") {
      setTimeout(() => {
        Alert.alert(
          "DEBUG",
          `COVALENT_KEY len=${(rawKey || "").length} prefix=${keyPrefix}\n` +
            `COVALENT_AUTH_B64 len=${authLen}`
        );
      }, 400);
    }
    // ----------------------------
  }, []);

  // ---- STEP 6: AUTO-LOCK (background + idle) ----
  useEffect(() => {
    // Track app state transitions (background/foreground)
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "background") {
        // record when we left the app
        try {
          useLockStore.getState().wentBackground();
        } catch {}
      }

      if (state === "active") {
        try {
          const st = useLockStore.getState();
          const sinceBG = st.lastBackgroundAt ? Date.now() - st.lastBackgroundAt : 0;
          if (sinceBG >= st.inactivityMs) {
            await triggerReauth();
            return;
          }
          // Also check idle time accrued while foreground (e.g., no touches)
          const idle = Date.now() - st.lastInteractionAt;
          if (idle >= st.inactivityMs) {
            await triggerReauth();
          }
        } catch {}
      }
    });

    // Lightweight idle checker while app is active
    const timer = setInterval(async () => {
      try {
        const st = useLockStore.getState();
        if (st.isLocked) return; // already locked
        const idle = Date.now() - st.lastInteractionAt;
        if (idle >= st.inactivityMs) {
          await triggerReauth();
        }
      } catch {}
    }, 15000); // check every 15s

    return () => {
      sub.remove();
      clearInterval(timer);
      // Stop transaction monitoring when app is closed
      TransactionDetectionService.stopMonitoring();
    };
  }, []);

  if (loading || !initialRoute) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  return <AppNavigator initialRoute={initialRoute} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
