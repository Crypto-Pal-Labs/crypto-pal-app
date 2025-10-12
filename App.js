// App.js — single entry point for Crypto Pal

import "react-native-get-random-values";
import "@ethersproject/shims";
import { Buffer } from "buffer";
if (!(global).Buffer) (global).Buffer = Buffer;

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";

import { useAuthStore } from "./src/store/useAuthStore";
import { useWalletStore } from "./src/store/useWalletStore";
import AppNavigator from "./src/navigation/AppNavigator";
import { getWalletAddress, clearWallet } from "./src/utils/wallet";
import { getExtra } from "./src/config/extra";

export default function App() {
  const { setAuthenticated, setHasMnemonic, setHasPin } = useAuthStore();
  const setAddress = useWalletStore((s) => s.setAddress);
  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
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

        const mnemonic = await SecureStore.getItemAsync("mnemonic");
        const pin = await SecureStore.getItemAsync("pin");
        const hasMn = !!mnemonic;
        const hasP = !!pin;

        setHasMnemonic(hasMn);
        setHasPin(hasP);
        setAuthenticated(hasMn && hasP);
        console.log("Auth check:", { hasMnemonic: hasMn, hasPin: hasP });

        if (hasMn && hasP) {
          if (!mnemonic) {
            console.error("Mismatch: hasMnemonic true but mnemonic null—resetting.");
            Alert.alert("Error", "Wallet data inconsistent. Clearing storage and redirecting to setup.");
            await clearWallet();
            setHasMnemonic(false);
            setHasPin(false);
            setAuthenticated(false);
            setInitialRoute({ name: "Welcome" });
          } else {
            const currentAddress = await getWalletAddress();
            if (currentAddress) setAddress(currentAddress);
            setInitialRoute({ name: "Pin", params: { isSetup: false } });
          }
        } else {
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
    // declare dbg ONCE here
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

    // One-time alert in release if EXPO_PUBLIC_DEBUG_AUTH=1
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
