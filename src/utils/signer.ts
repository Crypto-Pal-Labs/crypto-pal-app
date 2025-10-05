// src/utils/signer.ts
import { Wallet } from 'ethers';
import { saveMnemonic } from '../utils/wallet';
import { getProvider } from '../utils/provider';
import * as SecureStore from 'expo-secure-store';

export async function getConnectedWallet(chainId: number) {
  const phrase = await SecureStore.getItemAsync('mnemonic'); // Direct get, no function needed if saveMnemonic is set.
  if (!phrase) throw new Error('No wallet found. Please create/restore first.');
  const provider = getProvider(chainId);
  return Wallet.fromMnemonic(phrase).connect(provider);
}