// src/lib/biometrics.ts
import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricStatus = 'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_ENROLLED';

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return 'NOT_AVAILABLE';
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) return 'NOT_ENROLLED';
  return 'AVAILABLE';
}

export async function canUseBiometrics() {
  return (await getBiometricStatus()) === 'AVAILABLE';
}

/** Shows the system biometric dialog. */
export async function promptBiometric(promptMessage = 'Unlock Crypto Pal') {
  return LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Use PIN instead',
    disableDeviceFallback: false, // allow device credential on Android
    // requireConfirmation: true, // optional
  });
}
