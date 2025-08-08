// src/screens/MnemonicBackupScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function MnemonicBackupScreen() {
  const navigation = useNavigation();
  const { mnemonic } = useRoute().params as { mnemonic: string };

  return (
    <View className="flex-1 bg-white px-6 pt-12">
      <Text className="text-2xl font-bold text-teal-700 mb-6 text-center">
        Your Recovery Phrase
      </Text>

      <ScrollView 
        contentContainerStyle={{ padding: 16, backgroundColor: '#F6F6F6', borderRadius: 16 }}
        className="mb-8"
      >
        <Text className="text-lg text-gray-800 text-center leading-relaxed">
          {mnemonic}
        </Text>
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.replace('Main')}
        className="bg-teal-600 rounded-2xl py-4"
      >
        <Text className="text-center text-white text-lg font-semibold">
          I’ve backed it up
        </Text>
      </TouchableOpacity>
    </View>
  );
}

