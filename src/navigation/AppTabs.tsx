import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';

import Wallet from '../screens/Wallet';
import BuyScreen from '../screens/Buy';
import PayTabs from '../screens/Pay/PayTabs';
import HistoryTab from '../screens/HistoryTab';

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  const [userRegion, setUserRegion] = useState('UNKNOWN');
  const [showBuy, setShowBuy] = useState(true); // Show by default

  useEffect(() => {
    // @ts-ignore
    const detectedRegion = Localization.region?.toUpperCase() || 'UNKNOWN';
    console.log('Detected device region:', detectedRegion);
    setUserRegion(detectedRegion);
  }, []);

  useEffect(() => {
    const restrictedCountries = ['AF', 'DZ', 'BD', 'BO', 'CN', 'EC', 'EG', 'ET', 'GH', 'IQ', 'MK', 'MA', 'NP', 'PK', 'QA', 'SA', 'TN', 'VU'];
    if (restrictedCountries.includes(userRegion) && userRegion !== 'UNKNOWN') {
      setShowBuy(false);
    }
  }, [userRegion]);

  return (
    <Tab.Navigator initialRouteName="Wallet" screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name="Wallet"
        component={Wallet}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      {showBuy && (
        <Tab.Screen
          name="Buy"
          component={BuyScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" size={size} color={color} />,
          }}
        />
      )}
      <Tab.Screen
        name="Pay"
        component={PayTabs}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryTab}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}