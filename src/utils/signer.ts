import { Wallet } from 'ethers';
import { getSavedMnemonic } from '../utils/wallet';
import { getProvider } from './provider';

export async function getConnectedWallet(chainId: number) {
  const phrase = await getSavedMnemonic();
  if (!phrase) throw new Error('No wallet found. Please create/restore first.');
  const provider = getProvider(chainId);
  return Wallet.fromPhrase(phrase).connect(provider);
}
