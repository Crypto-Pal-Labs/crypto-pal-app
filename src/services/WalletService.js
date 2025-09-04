// src/services/WalletService.js
import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import { getProvider } from '../config/chains';  // Import the helper for chain-specific providers

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

/**
 * Get the connected wallet for a specific chain.
 * Fetches the stored private key, creates the wallet, and connects it to the chain's provider.
 * This is useful for signing transactions or querying on a specific chain.
 */
export async function getConnectedWallet(chainKey) {
  const privateKey = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (!privateKey) {
    throw new Error('No wallet stored');
  }
  const provider = getProvider(chainKey);
  const wallet = new ethers.Wallet(privateKey).connect(provider);
  return wallet;
}