import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Welcome: undefined;
  Pin: { isSetup?: boolean };
  CreateWallet: undefined;
  RestoreWallet: undefined;
  MnemonicBackup: undefined;
  WalletRoot: undefined; // If still needed
  AppTabs: undefined; // Change to undefined—no params for stack entry
};

// Keep AppTabParamList for tabs if needed
export type AppTabParamList = {
  Wallet: undefined;
  Buy: undefined;
  Pay: undefined;
  History: undefined;
};