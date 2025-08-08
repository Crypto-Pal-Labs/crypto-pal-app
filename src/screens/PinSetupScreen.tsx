// src/screens/PinSetupScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';

export default function PinSetupScreen() {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const navigation = useNavigation();

  const savePin = async () => {
    if (pin.length !== 6 || pin !== confirm) {
      return Alert.alert('Error', 'PINs must match and be exactly 6 digits.');
    }

    // store PIN
    await SecureStore.setItemAsync('userPin', pin);

    // go to Create/Restore screen (#4)
    navigation.replace('CreateWallet');
  };

  return (
    <View className="flex-1 bg-white px-6 pt-16">
      <Text className="text-center text-2xl font-bold text-teal-600 mb-8">
        Create a 6-digit PIN
      </Text>

      <TextInput
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        placeholder="Enter PIN"
        value={pin}
        onChangeText={setPin}
        className="border border-gray-300 rounded-2xl p-4 text-xl mb-4"
      />

      <TextInput
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        placeholder="Confirm PIN"
        value={confirm}
        onChangeText={setConfirm}
        className="border border-gray-300 rounded-2xl p-4 text-xl mb-8"
      />

      <TouchableOpacity
        onPress={savePin}
        className="bg-teal-600 rounded-2xl py-4"
      >
        <Text className="text-center text-white text-lg font-semibold">
          Continue
        </Text>
      </TouchableOpacity>
    </View>
  );
}


