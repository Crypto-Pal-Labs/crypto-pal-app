import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Welcome: undefined;
  Pin: { isSetup?: boolean };
  CreateWallet: undefined;
  RestoreWallet: undefined;
  MnemonicBackup: undefined;
  AppTabs: undefined;
};

export type AppTabParamList = {
  Wallet: undefined;
  Buy: undefined;
  Pay: undefined;
  History: undefined;
};