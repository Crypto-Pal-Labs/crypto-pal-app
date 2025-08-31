// src/navigation/AppTabs.tsx
import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import Wallet from '../screens/Wallet';
import BuyScreen from '../screens/Buy';
import PayTabs from '../screens/Pay/PayTabs';
import HistoryTab from '../screens/HistoryTab';

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  const [ipRegion, setIpRegion] = useState('UNKNOWN'); // IP region
  const [showBuy, setShowBuy] = useState(true); // Default ON; hide only for restricted countries

  useEffect(() => {
    const fetchIpRegion = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const region = data.country_code || 'UNKNOWN';
        console.log('Detected IP region:', region);
        setIpRegion(region);
      } catch {
        setIpRegion('UNKNOWN'); // Fallback to show if fetch fails
      }
    };
    fetchIpRegion();
  }, []);

  useEffect(() => {
    // Restricted countries where crypto buying is banned (e.g., CN, EG, etc.)
    const restrictedCountries = ['CN', 'EG', 'IQ', 'QA', 'OM', 'MA', 'DZ', 'TN', 'BD', 'BO'];
    // Hide Buy only if in restricted country; show default for all others/unknown
    setShowBuy(!restrictedCountries.includes(ipRegion));
  }, [ipRegion]);

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