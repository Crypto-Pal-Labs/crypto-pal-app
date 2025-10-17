// App.js — single entry point for Crypto Pal

import "react-native-get-random-values";
import "@ethersproject/shims";
import { Buffer } from "buffer";
if (!global.Buffer) global.Buffer = Buffer;

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View, AppState } from "react-native";
import * as SecureStore from "expo-secure-store";

import AppNavigator from "./src/navigation/AppNavigator";

import { useAuthStore } from "./src/store/useAuthStore";
import { useWalletStore } from "./src/store/useWalletStore";
import { useSettingsStore } from "./src/store/useSettingsStore";
import { useLockStore } from "./src/store/useLockStore";

import { getWalletAddress } from "./src/utils/wallet";
import { getExtra } from "./src/config/extra";
import { canUseBiometrics } from "./src/lib/biometrics";
import { triggerReauth } from "./src/utils/reauth";

export default function App() {
  const { setAuthenticated, setHasMnemonic, setHasPin } = useAuthStore();
  const setAddress = useWalletStore((s) => s.setAddress);

  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---- AUTH / BOOTSTRAP ----
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Hydrate settings (biometricEnabled)
        if (typeof useSettingsStore.getState().hydrate === "function") {
          await useSettingsStore.getState().hydrate();
        }
        const biometricEnabled = !!useSettingsStore.getState().biometricEnabled;

        // --- migrate old keys (legacy key names) ---
        try {
          const oldMnemonic = await SecureStore.getItemAsync("user_mnemonic");
          if (oldMnemonic) {
            await SecureStore.setItemAsync("mnemonic", oldMnemonic);
            await SecureStore.deleteItemAsync("user_mnemonic");
            console.log("Migrated old mnemonic key.");
          }
        } catch {}
        try {
          const oldPin = await SecureStore.getItemAsync("user_pin");
          if (oldPin) {
            await SecureStore.setItemAsync("pin", oldPin);
            await SecureStore.deleteItemAsync("user_pin");
            console.log("Migrated old pin key.");
          }
        } catch {}

        // --- read current auth facts ---
        const [mnemonic, pin] = await Promise.all([
          SecureStore.getItemAsync("mnemonic"),
          SecureStore.getItemAsync("pin"),
        ]);

        const hasMn = !!mnemonic;
        const hasP = !!pin;

        setHasMnemonic(hasMn);
        setHasPin(hasP);
        setAuthenticated(hasMn && hasP);

        if (hasMn && hasP) {
          // Returning user: set address and go to PIN.
          // If biometrics are enabled and available, tell the PIN screen to auto-prompt.
          const currentAddress = await getWalletAddress().catch(() => null);
          if (currentAddress) setAddress(currentAddress);

          const autoPrompt = biometricEnabled && (await canUseBiometrics());
          setInitialRoute({ name: "Pin", params: { isSetup: false, autoPrompt } });
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
    try {
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
    } catch {}
  }, []);

  // ---- AUTO-LOCK: background + idle ----
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "background") {
        try {
          // record when we left the app
          useLockStore.getState().wentBackground?.();
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
          // Check idle while foreground
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
        if (st.isLocked) return;
        const idle = Date.now() - st.lastInteractionAt;
        if (idle >= st.inactivityMs) {
          await triggerReauth();
        }
      } catch {}
    }, 15000);

    return () => {
      sub.remove();
      clearInterval(timer);
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
