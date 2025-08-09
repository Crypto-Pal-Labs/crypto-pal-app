// src/navigation/AppTabs.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import WalletScreen  from '../screens/Wallet';
import BuyScreen     from '../screens/Buy';
import PayTabs       from '../screens/Pay/PayTabs';
import HistoryScreen from '../screens/HistoryTab';

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Wallet"
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Wallet"  component={WalletScreen}  />
      <Tab.Screen name="Buy"     component={BuyScreen}     />
      <Tab.Screen name="Pay"     component={PayTabs}       />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}



