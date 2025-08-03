// src/services/WalletService.js
import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';

const MNEMONIC_KEY = 'mnemonic';
const PRIVATE_KEY = 'privateKey';

/**
 * Generate a new Ethereum wallet (12-word phrase),
 * store mnemonic & private key securely, and return the address + phrase.
 */
export async function generateAndStoreWallet() {
  const wallet = ethers.Wallet.createRandom();               // 12-word
  const mnemonic = wallet.mnemonic.phrase;
  const privateKey = wallet.privateKey;

  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);
  await SecureStore.setItemAsync(PRIVATE_KEY, privateKey);

  return { address: wallet.address, mnemonic };
}

/**
 * Restore from a user-entered mnemonic, store it,
 * and return its address.
 */
export async function restoreAndStoreWallet(mnemonicPhrase) {
  const wallet = ethers.Wallet.fromMnemonic(mnemonicPhrase.trim());
  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonicPhrase.trim());
  await SecureStore.setItemAsync(PRIVATE_KEY, wallet.privateKey);
  return wallet.address;
}

/** Get the stored wallet address (if any) */
export async function getStoredAddress() {
  const privateKey = await SecureStore.getItemAsync(PRIVATE_KEY);
  return privateKey ? new ethers.Wallet(privateKey).address : null;
}

/** Get the stored mnemonic phrase (if any) */
export async function getStoredMnemonic() {
  return await SecureStore.getItemAsync(MNEMONIC_KEY);
}
