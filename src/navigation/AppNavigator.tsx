import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import WelcomeScreen from '../screens/WelcomeScreen';
import PinSetupScreen from '../screens/PinSetupScreen';
import CreateWalletScreen from '../screens/CreateWalletScreen';
import RestoreWalletScreen from '../screens/RestoreWalletScreen';
import MnemonicBackupScreen from '../screens/MnemonicBackupScreen';
import WalletScreen from '../screens/Wallet'; // Import Wallet.tsx (adjust if path differs)
import AppTabs from './AppTabs';
import { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator({ initialRouteName = 'Welcome' as keyof RootStackParamList }) {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}><Stack.Screen name="Welcome" component={WelcomeScreen} /><Stack.Screen name="Pin" component={PinSetupScreen} initialParams={{ isSetup: true }} /><Stack.Screen name="CreateWallet" component={CreateWalletScreen} /><Stack.Screen name="RestoreWallet" component={RestoreWalletScreen} /><Stack.Screen name="MnemonicBackup" component={MnemonicBackupScreen} /><Stack.Screen name="WalletRoot" component={WalletScreen} /><Stack.Screen name="AppTabs" component={AppTabs} /></Stack.Navigator>
    </NavigationContainer>
  );
}