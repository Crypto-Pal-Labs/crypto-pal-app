// src/screens/CreateWalletScreen.tsx

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ethers } from 'ethers';

export default function CreateWalletScreen() {
  const navigation = useNavigation();

  const handleCreate = () => {
    const wallet = ethers.Wallet.createRandom();
    navigation.replace('MnemonicBackup', {
      mnemonic: wallet.mnemonic.phrase,
    });
  };

  const handleRestore = () => {
    // Placeholder for future restore flow
    navigation.replace('MnemonicBackup', {
      mnemonic: 'restore-flow-not-implemented-yet',
    });
  };

  return (
    <View className="flex-1 bg-white px-6 pt-16">
      <Text className="text-center text-3xl font-bold text-teal-600 mb-12">
        Welcome to Crypto Pal
      </Text>

      {/* Two blue (teal) buttons */}
      <TouchableOpacity
        onPress={handleCreate}
        className="bg-teal-600 rounded-2xl py-4 mb-4"
      >
        <Text className="text-center text-white text-lg font-semibold">
          Create New Wallet
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleRestore}
        className="bg-teal-600 rounded-2xl py-4"
      >
        <Text className="text-center text-white text-lg font-semibold">
          Restore From Backup
        </Text>
      </TouchableOpacity>
    </View>
  );
}
