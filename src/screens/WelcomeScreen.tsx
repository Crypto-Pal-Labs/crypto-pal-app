// src/screens/WelcomeScreen.tsx

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function WelcomeScreen() {
  const navigation = useNavigation();

  return (
    <View className="flex-1 justify-center items-center bg-white p-4">
      <Text className="text-3xl font-bold mb-6">Welcome to Crypto Pal</Text>
      <Text className="text-center mb-8">
        Crypto Pal is your self-custody wallet. Secure your PIN, then back up your recovery phrase.
      </Text>

      <TouchableOpacity
        onPress={() => navigation.replace('PinSetup')}
        className="bg-teal-600 rounded-lg py-3 px-6"
      >
        <Text className="text-white font-medium text-lg">Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}
