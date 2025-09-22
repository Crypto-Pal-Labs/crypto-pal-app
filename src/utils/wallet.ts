// src/utils/wallet.ts
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import * as bip39 from 'bip39'; // If used for generateMnemonic

export async function generateMnemonic() {
  return bip39.generateMnemonic();
}

export async function saveMnemonic(phrase: string) {
  try {
    await SecureStore.setItemAsync('user_mnemonic', phrase);
    console.log('Mnemonic saved successfully.');
  } catch (error) {
    console.error('Failed to save mnemonic:', error);
    throw new Error('Failed to save mnemonic.');
  }
}

export async function getSavedMnemonic() {
  try {
    const phrase = await SecureStore.getItemAsync('user_mnemonic');
    console.log('Retrieved mnemonic:', phrase ? 'exists' : 'null');
    return phrase;
  } catch (error) {
    console.error('Failed to get mnemonic:', error);
    return null;
  }
}

export async function getWalletAddress() {
  const phrase = await getSavedMnemonic();
  if (!phrase) return null;
  const wallet = ethers.Wallet.fromMnemonic(phrase);
  return wallet.address;
}

export async function clearWallet() {
  await SecureStore.deleteItemAsync('user_mnemonic');
  await SecureStore.deleteItemAsync('user_pin');
  console.log('Wallet cleared.');
}