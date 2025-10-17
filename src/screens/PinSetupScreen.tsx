import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLockStore } from '../store/useLockStore';
import { RootStackParamList } from '../types/navigation';
import { canUseBiometrics, promptBiometric } from '../lib/biometrics';

type Props = NativeStackScreenProps<RootStackParamList, 'Pin'>;

// Helper to read current secrets from SecureStore
async function readSecrets() {
  const [mnemonic, pin] = await Promise.all([
    SecureStore.getItemAsync('mnemonic'),
    SecureStore.getItemAsync('pin'),
  ]);
  return { hasMnemonic: !!mnemonic, hasPin: !!pin };
}

export default function PinSetupScreen({ route, navigation }: Props) {
  // Stores
  const { setAuthenticated, setHasPin } = useAuthStore();
  const biometricEnabled = useSettingsStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useSettingsStore((s) => s.setBiometricEnabled);
  const unlockLockState = useLockStore((s) => s.unlock); // clear lock on success

  // Mode resolution (setup vs unlock)
  const [modeResolved, setModeResolved] = useState<'LOADING' | 'SETUP' | 'UNLOCK'>('LOADING');

  // PIN fields
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');

  // Biometrics availability on this device
  const [bioAvailable, setBioAvailable] = useState(false);

  // Ensure we only auto-prompt once per focus
  const [autoPrompted, setAutoPrompted] = useState(false);

  // Resolve mode based on route params or stored secrets
  useEffect(() => {
    (async () => {
      if (typeof route.params?.isSetup === 'boolean') {
        setModeResolved(route.params.isSetup ? 'SETUP' : 'UNLOCK');
      } else {
        const { hasMnemonic, hasPin } = await readSecrets();
        setModeResolved(hasMnemonic && hasPin ? 'UNLOCK' : 'SETUP');
      }
      setBioAvailable(await canUseBiometrics());
    })();
  }, [route.params?.isSetup]);

  const isSetup = useMemo(() => modeResolved === 'SETUP', [modeResolved]);
  const pinsMatch = isSetup ? pin.length === 6 && pin === confirm : pin.length === 6;

  // Try biometrics (shared)
  const tryBiometric = useCallback(async () => {
    if (!bioAvailable) return;
    const res = await promptBiometric(isSetup ? 'Confirm biometrics' : 'Unlock with biometrics');
    if (res.success) {
      // enable toggle silently if not set yet
      if (!biometricEnabled) {
        try { await setBiometricEnabled(true); } catch {}
      }
      setAuthenticated(true);
      unlockLockState();
      navigation.reset({ index: 0, routes: [{ name: 'AppTabs' }] });
    }
  }, [bioAvailable, biometricEnabled, isSetup, navigation, setAuthenticated, setBiometricEnabled, unlockLockState]);

  // Auto-prompt once when screen gains focus (unlock mode, allowed, and requested)
  useFocusEffect(
    useCallback(() => {
      const shouldAuto =
        !isSetup &&
        biometricEnabled &&
        bioAvailable &&
        route.params?.autoPrompt === true &&
        !autoPrompted;

      if (shouldAuto) {
        setAutoPrompted(true);
        // fire-and-forget; button remains visible if user cancels
        tryBiometric();
      }
      return () => {};
    }, [isSetup, biometricEnabled, bioAvailable, route.params?.autoPrompt, autoPrompted, tryBiometric])
  );

  if (modeResolved === 'LOADING') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.container, { alignItems: 'center' }]}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  // --- Handlers ---

  // Continue/Unlock with PIN
  const handleSubmit = async () => {
    if (isSetup) {
      try {
        await SecureStore.setItemAsync('pin', pin);
        setHasPin(true);
        // After PIN setup, offer biometrics
        navigation.reset({
          index: 0,
          routes: [{ name: 'EnableBiometrics', params: { next: 'CreateWallet' } }],
        });
      } catch {
        Alert.alert('Error', 'Failed to save PIN.');
      }
    } else {
      try {
        const storedPin = await SecureStore.getItemAsync('pin');
        if (pin === storedPin) {
          setAuthenticated(true);
          unlockLockState();
          navigation.reset({ index: 0, routes: [{ name: 'AppTabs' }] });
        } else {
          Alert.alert('Invalid PIN', 'Try again.');
          setPin('');
        }
      } catch {
        Alert.alert('Error', 'Failed to verify PIN.');
      }
    }
  };

  // Manual biometric button
  const handleTryBiometric = async () => {
    await tryBiometric();
  };

  // --- UI ---

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Ionicons name="lock-closed-outline" size={64} color="#0A84FF" style={styles.icon} />
        <Text style={styles.title}>{isSetup ? 'Create a 6-digit PIN' : 'Enter your PIN'}</Text>
        <Text style={styles.subtitle}>
          {isSetup
            ? 'Your PIN protects your wallet on this device. Keep it secret and never share it.'
            : 'Enter your PIN to unlock.'}
        </Text>

        <TextInput
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          placeholder={isSetup ? 'Enter PIN' : 'Enter your PIN'}
          value={pin}
          onChangeText={setPin}
          style={styles.input}
        />

        {isSetup && (
          <TextInput
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            placeholder="Confirm PIN"
            value={confirm}
            onChangeText={setConfirm}
            style={styles.input}
          />
        )}

        <TouchableOpacity
          style={[styles.button, { opacity: pinsMatch ? 1 : 0.4 }]}
          activeOpacity={0.8}
          disabled={!pinsMatch}
          onPress={handleSubmit}
        >
          <Text style={styles.buttonText}>{isSetup ? 'Continue' : 'Unlock'}</Text>
        </TouchableOpacity>

        {/* Show biometric option on the unlock view when hardware is available */}
        {!isSetup && bioAvailable && (
          <TouchableOpacity style={{ padding: 12 }} onPress={handleTryBiometric}>
            <Text style={{ textAlign: 'center', color: '#0A84FF', fontWeight: '600' }}>
              Use fingerprint/face instead
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  icon: { marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#0A84FF', marginBottom: 16, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    marginBottom: 16,
  },
  button: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 12, marginTop: 8 },
  buttonText: { textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
});
