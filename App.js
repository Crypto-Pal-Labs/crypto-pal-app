// App.js — entry point for Crypto Pal

// 1. Log Covalent API key from .env
import { COVALENT_KEY } from '@env';
console.log('⛓️ Covalent key is:', COVALENT_KEY);

import 'react-native-get-random-values';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator'; // From remote backup for scan feature

export default function App() {
  return (
    <AppNavigator />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
