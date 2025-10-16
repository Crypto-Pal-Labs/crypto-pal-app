// src/types/navigation.ts

// Where to go after the biometrics opt-in screen
export type OnboardingNext = 'CreateWallet' | 'RestoreWallet';

export type RootStackParamList = {
  Welcome: undefined;

  // PIN used for setup and unlock
  Pin: { isSetup: boolean } | undefined;

  // NEW: biometrics opt-in (optional step after PIN setup)
  EnableBiometrics: { next: OnboardingNext } | undefined;

  // Wallet onboarding
  CreateWallet: undefined;
  RestoreWallet: undefined;

  // IMPORTANT: this screen accepts params
  MnemonicBackup: {
    isRestore?: boolean;
    phrase?: string;
  } | undefined;

  // Main app
  AppTabs: undefined;
};
