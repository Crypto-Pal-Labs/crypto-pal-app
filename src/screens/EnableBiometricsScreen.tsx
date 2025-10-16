// src/screens/EnableBiometricsScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getBiometricStatus, promptBiometric } from '../lib/biometrics';
import { useSettingsStore } from '../store/useSettingsStore';

type Props = NativeStackScreenProps<RootStackParamList, 'EnableBiometrics'>;

export default function EnableBiometricsScreen({ navigation, route }: Props) {
  const next = route?.params?.next ?? 'CreateWallet';
  const [status, setStatus] = useState<'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_ENROLLED'>('NOT_AVAILABLE');
  const setBiometricEnabled = useSettingsStore(s => s.setBiometricEnabled);

  useEffect(() => {
    getBiometricStatus().then(setStatus);
  }, []);

  const goNext = () => navigation.reset({ index: 0, routes: [{ name: next as any }] });

  const onEnable = async () => {
    if (status !== 'AVAILABLE') {
      Alert.alert('Biometrics not available', 'You can enable biometrics later in Settings.');
      return goNext();
    }
    const res = await promptBiometric('Enable biometric unlock');
    if (res.success) {
      await setBiometricEnabled(true);
      goNext();
    } else {
      Alert.alert('Biometric setup canceled', 'You can turn this on later in Settings.');
      goNext();
    }
  };

  const onSkip = async () => {
    await setBiometricEnabled(false);
    goNext();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Use fingerprint/face to unlock?</Text>
      <Text style={styles.subtitle}>
        It’s faster and keeps your wallet safe. You can still use your PIN anytime.
      </Text>

      <TouchableOpacity style={styles.button} onPress={onEnable}>
        <Text style={styles.buttonText}>Enable</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.outline]} onPress={onSkip}>
        <Text style={[styles.buttonText, styles.outlineText]}>Not now</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Status: {status === 'AVAILABLE' ? 'Supported' : status === 'NOT_ENROLLED' ? 'Not enrolled on this device' : 'No biometric hardware'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F5F5F5', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#0A84FF', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#0A84FF', paddingVertical: 16, borderRadius: 12, marginBottom: 12 },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#0A84FF' },
  buttonText: { textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
  outlineText: { color: '#0A84FF' },
  hint: { textAlign: 'center', opacity: 0.7, marginTop: 8 },
});
