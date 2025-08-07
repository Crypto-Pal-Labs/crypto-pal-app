// App.js — entry point for Crypto Pal
import 'react-native-get-random-values';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';

import AppTabs from './src/navigation/AppTabs';

export default function App() {
  return (
    <NavigationContainer>
      <AppTabs />
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}


