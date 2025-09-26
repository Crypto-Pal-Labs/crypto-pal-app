// src/utils/wallet.ts
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import * as bip39 from 'bip39'; // If used for generateMnemonic
import { Alert } from 'react-native'; // Added for user alerts

export async function generateMnemonic() {
  return bip39.generateMnemonic();
}

export async function saveMnemonic(phrase: string) {
  try {
    await SecureStore.setItemAsync('mnemonic', phrase); // Removed requireAuthentication for dev
    console.log('Mnemonic saved successfully.');
  } catch (error) {
    console.error('Failed to save mnemonic:', error);
    throw new Error('Failed to save mnemonic.');
  }
}

export async function getMnemonic(): Promise<string | null> {
  try {
    // Add delay to mitigate async lag (common Expo issue)
    await new Promise(resolve => setTimeout(resolve, 500));
    const phrase = await SecureStore.getItemAsync('mnemonic'); // Removed requireAuthentication for dev
    console.log('Retrieved mnemonic:', phrase ? 'exists' : 'null');
    if (!phrase) {
      console.error('Mnemonic not found in SecureStore.');
      Alert.alert('Error', 'Mnemonic not found. Please restore your wallet.');
      return null;
    }
    return phrase;
  } catch (error: any) {
    console.error('Failed to get mnemonic:', error);
    if (error.message.includes('canceled') || error.message.includes('Authenticate')) {
      Alert.alert('Authentication Failed', 'User canceled or authentication error. Please try again.', [
        { text: 'Retry', onPress: () => getMnemonic() }, // Recursive retry—careful not to loop
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Error', 'Failed to retrieve mnemonic: ' + error.message);
    }
    return null;
  }
}

export async function getWalletAddress() {
  const phrase = await getMnemonic();
  if (!phrase) return null;
  const wallet = ethers.Wallet.fromMnemonic(phrase);
  return wallet.address;
}

export async function clearWallet() {
  await SecureStore.deleteItemAsync('mnemonic');
  await SecureStore.deleteItemAsync('pin'); // Standardized
  console.log('Wallet cleared.');
}