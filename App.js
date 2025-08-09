// App.js — single entry point for Crypto Pal
import 'react-native-get-random-values';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { COVALENT_KEY } from '@env';

import AppNavigator from './src/navigation/AppNavigator';   // root stack + tabs

console.log('⛓️ Covalent key is:', COVALENT_KEY);

export default function App() {
  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}


