// src/navigation/AppTabs.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import Wallet     from '../screens/Wallet';
import Buy        from '../screens/Buy';
import PayTabs    from '../screens/Pay/PayTabs';
import HistoryTab from '../screens/HistoryTab';

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Wallet"  component={Wallet} />
      <Tab.Screen name="Buy"     component={Buy} />
      <Tab.Screen name="Pay"     component={PayTabs} />
      <Tab.Screen name="History" component={HistoryTab} />
    </Tab.Navigator>
  );
}


