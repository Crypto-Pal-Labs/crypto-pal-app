// src/navigation/AppTabs.tsx
import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import WalletScreen  from '../screens/Wallet';
import BuyScreen     from '../screens/Buy';
import PayTabs       from '../screens/Pay/PayTabs';
import HistoryScreen from '../screens/HistoryTab';

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  const [ipRegion, setIpRegion] = useState('UNKNOWN'); // IP region
  const [showBuy, setShowBuy] = useState(true); // Show by default for testing; hide if not NZ

  useEffect(() => {
    const fetchIpRegion = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const region = data.country_code || 'UNKNOWN';
        console.log('Detected IP region:', region);
        setIpRegion(region);
      } catch {
        setIpRegion('UNKNOWN');
      }
    };
    fetchIpRegion();
  }, []);

  useEffect(() => {
    // Hide Buy if IP is not NZ (for compliance); fallback to show if unknown for testing
    if (ipRegion !== 'NZ' && ipRegion !== 'UNKNOWN') {
      setShowBuy(false);
    }
  }, [ipRegion]);

  return (
    <Tab.Navigator initialRouteName="Wallet" screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Wallet"  component={WalletScreen}  />
      {showBuy && <Tab.Screen name="Buy" component={BuyScreen} />}
      <Tab.Screen name="Pay"     component={PayTabs}       />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
};