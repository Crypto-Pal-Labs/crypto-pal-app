// src/navigation/AppTabs.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import Icon                           from 'react-native-vector-icons/Ionicons';
import 'react-native-get-random-values';
import '@ethersproject/shims';

import Wallet   from '../screens/Wallet';
import Buy      from '../screens/Buy';
import PayTabs  from '../screens/Pay/PayTabs';

const Tab = createBottomTabNavigator();

export default function AppTabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color, size }) => {
            let iconName: string;

            switch (route.name) {
              case 'Wallet':
                iconName = 'wallet-outline';
                break;
              case 'Buy':
                iconName = 'card-outline';
                break;
              case 'Pay':
                iconName = 'qr-code-outline';
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
        <Tab.Screen
          name="Pay"
          component={PayTabs}
          // you can also override options per-screen:
          // options={{ tabBarLabel: 'Scan/Receive' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

