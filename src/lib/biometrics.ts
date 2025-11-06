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
  try {
    // Check if we're in a valid activity context
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Use PIN instead',
      disableDeviceFallback: false, // allow device credential on Android
      // requireConfirmation: true, // optional
    });
    return result;
  } catch (error: any) {
    console.log('Biometric prompt error:', error);
    // Return a failed result instead of throwing
    return {
      success: false,
      error: error.message || 'Biometric authentication failed'
    };
  }
}
