import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Wallet from '../screens/Wallet';
import Buy from '../screens/Buy';
import PayTabs from '../screens/Pay/PayTabs';
import StableHistoryTab from '../screens/StableHistoryTab';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization'; // For device region detection

const Tab = createBottomTabNavigator();

const AppTabs = () => {
  // CRITICAL: Memoize region check to prevent re-computation on every tab switch
  // This was causing "Maximum update depth exceeded" error on Samsung A24
  const showBuyTab = React.useMemo(() => {
    // List of country codes with full bans/severe restrictions on crypto trading (as of Sep 10, 2025)
    const restrictedCountries = ['AF', 'DZ', 'BD', 'BO', 'CN', 'EG', 'MA', 'NP', 'PK', 'TN'];
    
    // Get device region code (e.g., 'NZ', 'US')—uppercase for matching
    const country = (Localization.getLocales()[0]?.regionCode || 'UNKNOWN').toUpperCase();
    
    // Default to show Buy tab; hide only if in restricted list
    return !restrictedCountries.includes(country);
  }, []); // Empty dependency array - region doesn't change during session

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          switch (route.name) {
            case 'Wallet':
              iconName = 'wallet';
              break;
            case 'Buy':
              iconName = 'cart';
              break;
            case 'Pay':
              iconName = 'swap-horizontal';
              break;
            case 'History':
              iconName = 'time';
              break;
            default:
              iconName = 'help-circle'; // Fallback for any unexpected route
          }
          return <Ionicons name={iconName as 'wallet' | 'cart' | 'swap-horizontal' | 'time' | 'help-circle'} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#0A84FF',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: { backgroundColor: '#e9f3f8ff', borderTopWidth: 0, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
        headerShown: false,
        // CRITICAL: Performance optimizations for instant tab switching
        lazy: true, // Lazy load tabs for faster initial render
        unmountOnBlur: false, // Keep tabs mounted to preserve state and cache
      })}>
      <Tab.Screen name="Wallet" component={Wallet} />
      {showBuyTab && <Tab.Screen name="Buy" component={Buy} />}
      <Tab.Screen name="Pay" component={PayTabs} />
      <Tab.Screen name="History" component={StableHistoryTab} />
    </Tab.Navigator>
  );
};

export default AppTabs;