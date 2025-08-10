// src/navigation/AppNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { rootNavRef } from './RootNavigation';

import WelcomeScreen        from '../screens/WelcomeScreen';
import PinSetupScreen       from '../screens/PinSetupScreen';
import CreateWalletScreen   from '../screens/CreateWalletScreen';
import MnemonicBackupScreen from '../screens/MnemonicBackupScreen';
import RestoreWalletScreen from '../screens/RestoreWalletScreen';
import AppTabs              from './AppTabs';          // bottom tabs

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer ref={rootNavRef}>
      <Stack.Navigator
        initialRouteName="Welcome"
        screenOptions={{ headerShown: false }}
      >
        {/* On-boarding */}
        <Stack.Screen name="Welcome"        component={WelcomeScreen} />
        <Stack.Screen name="PinSetup"       component={PinSetupScreen} />
        <Stack.Screen name="CreateWallet"   component={CreateWalletScreen} />
        <Stack.Screen name="MnemonicBackup" component={MnemonicBackupScreen} />
        <Stack.Screen name="RestoreWallet" component={RestoreWalletScreen} options={{ headerShown: false }} />

        {/* Main app (tabs)*/}
        <Stack.Screen name="WalletRoot" component={AppTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}


