import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Wallet from '../screens/Wallet';
import Buy from '../screens/Buy';
import PayTabs from '../screens/Pay/PayTabs';
import HistoryTab from '../screens/HistoryTab';
import { Ionicons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

const AppTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Wallet') iconName = 'wallet';
          if (route.name === 'Buy') iconName = 'cart';
          if (route.name === 'Pay') iconName = 'swap-horizontal';
          if (route.name === 'History') iconName = 'time';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#0A84FF',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: { backgroundColor: '#fff', borderTopWidth: 0, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
        headerShown: false,
      })}>
      <Tab.Screen name="Wallet" component={Wallet} />
      <Tab.Screen name="Buy" component={Buy} />
      <Tab.Screen name="Pay" component={PayTabs} />
      <Tab.Screen name="History" component={HistoryTab} />
    </Tab.Navigator>
  );
};

export default AppTabs;