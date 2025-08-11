// src/utils/wallet.ts
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';

const MNEMONIC_KEY = 'mnemonic';

/**
 * Save a 12-word mnemonic phrase to secure storage.
 * @param mnemonic The wallet’s backup phrase.
 */
export async function saveMnemonic(mnemonic: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic);
  } catch (e) {
    console.error('Failed to save mnemonic', e);
    throw new Error('Unable to save wallet backup.');
  }
}

/**
 * Load the saved mnemonic from secure storage.
 * @returns The 12-word phrase, or null if none found.
 */
export async function getSavedMnemonic(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(MNEMONIC_KEY);
  } catch (e) {
    console.error('Failed to load mnemonic', e);
    return null;
  }
}

/**
 * Remove the stored mnemonic (logout/reset).
 */
export async function clearMnemonic(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(MNEMONIC_KEY);
  } catch (e) {
    console.error('Failed to clear mnemonic', e);
    throw new Error('Unable to clear wallet data.');
  }
}

/**
 * Derive the wallet address from the stored mnemonic.
 * @returns The derived address (ETH/BSC main account), or empty string if no mnemonic.
 */
export const getWalletAddress = (): string => {
  const mnemonic = SecureStore.getItem(MNEMONIC_KEY); // Synchronous get for simplicity; use async if needed
  if (!mnemonic) {
    console.warn('No mnemonic found in SecureStore');
    return ''; // Or throw error if preferred
  }
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return wallet.address; // Derives main ETH/BSC address
};