// src/types/navigation.ts

// Where to go after the biometrics opt-in screen
export type OnboardingNext = 'CreateWallet' | 'RestoreWallet';

export type RootStackParamList = {
  Welcome: undefined;

  // PIN is used both for setup and unlock
  // 🔧 Add optional autoPrompt so the PIN screen can auto-trigger biometrics on return
  Pin: { isSetup: boolean; autoPrompt?: boolean } | undefined;

  // NEW: biometrics opt-in (optional step after PIN setup)
  EnableBiometrics: { next: OnboardingNext } | undefined;

  // Wallet onboarding
  CreateWallet: undefined;
  RestoreWallet: undefined;

  // IMPORTANT: this screen accepts params
  MnemonicBackup:
    | {
        isRestore?: boolean;
        phrase?: string;
      }
    | undefined;

  // Main app
  AppTabs: undefined;
};
