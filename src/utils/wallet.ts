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
    
    console.log('getMnemonic: Attempting to retrieve mnemonic from SecureStore...');
    const phrase = await SecureStore.getItemAsync('mnemonic'); // Removed requireAuthentication for dev
    console.log('getMnemonic: Retrieved mnemonic:', phrase ? 'exists' : 'null');
    
    if (!phrase) {
      console.error('getMnemonic: Mnemonic not found in SecureStore.');
      Alert.alert('Error', 'Mnemonic not found. Please restore your wallet.');
      return null;
    }
    
    // Validate mnemonic format
    if (phrase.split(' ').length !== 12) {
      console.error('getMnemonic: Invalid mnemonic format - not 12 words');
      Alert.alert('Error', 'Invalid mnemonic format. Please restore your wallet.');
      return null;
    }
    
    return phrase;
  } catch (error: any) {
    console.error('getMnemonic: Failed to get mnemonic:', error);
    
    // Handle specific Samsung device issues
    if (error.message.includes('canceled') || error.message.includes('Authenticate')) {
      console.log('getMnemonic: Authentication issue detected, retrying without authentication...');
      try {
        // Retry without authentication requirement
        const phrase = await SecureStore.getItemAsync('mnemonic');
        if (phrase && phrase.split(' ').length === 12) {
          console.log('getMnemonic: Successfully retrieved mnemonic on retry');
          return phrase;
        }
      } catch (retryError: any) {
        console.error('getMnemonic: Retry also failed:', retryError);
      }
      
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
  try {
    console.log('getWalletAddress: Starting wallet address generation...');
    const phrase = await getMnemonic();
    if (!phrase) {
      console.error('getWalletAddress: No mnemonic found - wallet not set up');
      return null;
    }
    
    console.log('getWalletAddress: Mnemonic retrieved, generating wallet...');
    console.log('getWalletAddress: Mnemonic length:', phrase.split(' ').length, 'words');
    console.log('getWalletAddress: Mnemonic first 3 words:', phrase.split(' ').slice(0, 3).join(' '));
    
    const wallet = ethers.Wallet.fromMnemonic(phrase);
    const address = wallet.address;
    
    console.log('getWalletAddress: Generated address:', {
      address,
      length: address.length,
      isValid: /^0x[0-9a-fA-F]{40}$/.test(address),
      checksummed: ethers.utils.isAddress(address)
    });
    
    // Additional validation
    if (!address || address.length !== 42 || !address.startsWith('0x')) {
      console.error('getWalletAddress: Generated invalid address:', address);
      return null;
    }
    
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      console.error('getWalletAddress: Address contains invalid characters:', address);
      return null;
    }
    
    console.log('getWalletAddress: ✅ Successfully generated valid address');
    return address;
  } catch (error: any) {
    console.error('getWalletAddress: Error generating wallet:', error);
    console.error('getWalletAddress: Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return null;
  }
}

export async function clearWallet() {
  await SecureStore.deleteItemAsync('mnemonic');
  await SecureStore.deleteItemAsync('pin'); // Standardized
  console.log('Wallet cleared.');
}