// src/navigation/AppTabs.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import Wallet from '../screens/Wallet';
import Buy    from '../screens/Buy';

import Icon from 'react-native-vector-icons/Ionicons';   // <== needs react-native-vector-icons

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color, size }) => {
            // pick an icon name based on the route
            let iconName: string;
            switch (route.name) {
              case 'Wallet':
                iconName = 'wallet-outline';
                break;
              case 'Buy':
                iconName = 'card-outline';
                break;
              default:
                iconName = 'ellipse-outline';
            }
            return <Icon name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Wallet" component={Wallet} />
        <Tab.Screen name="Buy"    component={Buy} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
