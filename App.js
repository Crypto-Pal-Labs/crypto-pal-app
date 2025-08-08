// App.js — entry point for Crypto Pal

// 1. Log Covalent API key from .env
import { COVALENT_KEY } from '@env';
console.log('⛓️ Covalent key is:', COVALENT_KEY);

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



