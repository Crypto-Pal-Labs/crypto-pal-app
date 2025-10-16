// App.js — single entry point for Crypto Pal

import "react-native-get-random-values";
import "@ethersproject/shims";
import { Buffer } from "buffer";
if (!global.Buffer) global.Buffer = Buffer;

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";

import { useAuthStore } from "./src/store/useAuthStore";
import { useWalletStore } from "./src/store/useWalletStore";
import { useSettingsStore } from "./src/store/useSettingsStore";
import AppNavigator from "./src/navigation/AppNavigator";
import { getWalletAddress, clearWallet } from "./src/utils/wallet";
import { getExtra } from "./src/config/extra";
import { canUseBiometrics, promptBiometric } from "./src/lib/biometrics";

export default function App() {
  const { setAuthenticated, setHasMnemonic, setHasPin } = useAuthStore();
  const setAddress = useWalletStore((s) => s.setAddress);
  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);

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
            const res = await promptBiometric("Unlock Crypto Pal");
            if (res.success) {
              // Skip PIN and go straight to the app
              const currentAddress = await getWalletAddress();
              if (currentAddress) setAddress(currentAddress);
              setInitialRoute({ name: "AppTabs" });
            } else {
              // Fallback to PIN
              const currentAddress = await getWalletAddress();
              if (currentAddress) setAddress(currentAddress);
              setInitialRoute({ name: "Pin", params: { isSetup: false } });
            }
          } else {
            // No biometrics (or disabled) → PIN as before
            const currentAddress = await getWalletAddress();
            if (currentAddress) setAddress(currentAddress);
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
