// src/utils/reauth.ts
import { resetTo } from '../navigation/navigationRef';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLockStore } from '../store/useLockStore';
import { canUseBiometrics } from '../lib/biometrics';

/**
 * Lock the app and route to the PIN screen.
 * If biometrics are enabled and available, the PIN screen will auto-prompt once.
 */
export async function triggerReauth() {
  try {
    const { isLocked } = useLockStore.getState();

    // No store "lock()" method needed — set Zustand state directly.
    if (!isLocked) {
      useLockStore.setState({ isLocked: true });
      // If your store tracks a timestamp, you can also include: lockedAt: Date.now()
    }

    const biometricsOn = useSettingsStore.getState().biometricEnabled;
    const canBio = biometricsOn && (await canUseBiometrics());

    // Route to PIN; screen will auto-prompt once if allowed.
    resetTo('Pin', { isSetup: false, autoPrompt: !!canBio });
  } catch {
    // last-resort: just route to PIN
    resetTo('Pin', { isSetup: false, autoPrompt: false });
  }
}
