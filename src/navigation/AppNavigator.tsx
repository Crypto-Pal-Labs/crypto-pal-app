import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import WelcomeScreen from '../screens/WelcomeScreen';
import PinSetupScreen from '../screens/PinSetupScreen';
import CreateWalletScreen from '../screens/CreateWalletScreen';
import RestoreWalletScreen from '../screens/RestoreWalletScreen';
import MnemonicBackupScreen from '../screens/MnemonicBackupScreen';
import AppTabs from './AppTabs';
import { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

type InitialRouteProp = {
  name: keyof RootStackParamList;
  params?: { isSetup: boolean };
};

export default function AppNavigator({ initialRoute = { name: 'Welcome' } as InitialRouteProp }) {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute.name} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen
          name="Pin"
          component={PinSetupScreen}
          initialParams={initialRoute.params || { isSetup: true }}
        />
        <Stack.Screen name="CreateWallet" component={CreateWalletScreen} />
        <Stack.Screen name="RestoreWallet" component={RestoreWalletScreen} />
        <Stack.Screen name="MnemonicBackup" component={MnemonicBackupScreen} />
        <Stack.Screen name="AppTabs" component={AppTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}