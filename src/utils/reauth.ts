import { canUseBiometrics, promptBiometric } from '../lib/biometrics';
import { useSettingsStore } from '../store/useSettingsStore';
import { resetTo } from '../navigation/navigationRef';
import { useLockStore } from '../store/useLockStore';

export async function triggerReauth() {
  // Mark as locked (so UI knows)
  useLockStore.getState().lockNow();

  const biometricEnabled = useSettingsStore.getState().biometricEnabled;
  if (biometricEnabled && (await canUseBiometrics())) {
    const res = await promptBiometric('Unlock Crypto Pal');
    if (res.success) {
      useLockStore.getState().unlock();
      return; // stay where you are
    }
  }
  // Biometric not enabled/unavailable/canceled → PIN fallback
  resetTo('Pin', { isSetup: false });
}
