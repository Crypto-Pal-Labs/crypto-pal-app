// src/utils/wallet.ts

import { HDNodeWallet, providers, parseEther, parseUnits } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const MNEMONIC_KEY = 'user-mnemonic';

/**
 * Generate a new 12-word phrase, save it securely,
 * and return the derived wallet address.
 */
export async function createWallet(): Promise<{ address: string }> {
  const hdNode = HDNodeWallet.createRandom();           // 12-word mnemonic
  const phrase = hdNode.mnemonic.phrase;
  await SecureStore.setItemAsync(MNEMONIC_KEY, phrase);
  return { address: hdNode.address };
}

/**
 * Restore from a 12-word phrase, save it securely,
 * and return the associated address.
 */
export async function restoreWallet(
  mnemonic: string
): Promise<{ address: string }> {
  const phrase = mnemonic.trim();
  const hdNode = HDNodeWallet.fromPhrase(phrase);
  await SecureStore.setItemAsync(MNEMONIC_KEY, phrase);
  return { address: hdNode.address };
}

/**
 * Retrieve the saved backup phrase (if any).
 */
export async function getSavedMnemonic(): Promise<string | null> {
  return SecureStore.getItemAsync(MNEMONIC_KEY);
}

/**
 * Send an on-chain ETH transfer.
 * @param to     The recipient address (0x…)
 * @param amount The amount in ETH (e.g. "0.1")
 * @returns      The transaction hash
 */
export async function sendTransaction(
  to: string,
  amount: string
): Promise<string> {
  // 1. Load saved phrase
  const phrase = await SecureStore.getItemAsync(MNEMONIC_KEY);
  if (!phrase) throw new Error('No wallet found. Please create or restore one.');

  // 2. Derive wallet and connect to Infura
  const hdNode = HDNodeWallet.fromPhrase(phrase);
  const infuraKey = Constants.expoConfig?.extra?.infuraKey as string;
  const provider = new providers.InfuraProvider('homestead', infuraKey);
  const wallet = hdNode.connect(provider);

  // 3. Build & send transaction
  const txResponse = await wallet.sendTransaction({
    to,
    value: parseEther(amount),
  });

  // 4. Return the transaction hash
  return txResponse.hash;
}

/**
 * Send an ERC-20 token transfer.
 *
 * @param tokenAddress The contract address of the token (e.g. USDC)
 * @param to           The recipient address (0x…)
 * @param amount       The token amount as a string (in whole tokens)
 * @param decimals     The token decimals (6 for USDC, 18 for most others)
 * @returns            The transaction hash
 */
export async function sendERC20Transaction(
  tokenAddress: string,
  to: string,
  amount: string,
  decimals: number
): Promise<string> {
  // 1. Load saved phrase
  const phrase = await SecureStore.getItemAsync(MNEMONIC_KEY);
  if (!phrase) throw new Error('No wallet found. Please create or restore one.');

  // 2. Derive wallet and connect to Infura
  const hdNode = HDNodeWallet.fromPhrase(phrase);
  const infuraKey = Constants.expoConfig?.extra?.infuraKey as string;
  const provider = new providers.InfuraProvider('homestead', infuraKey);
  const wallet = hdNode.connect(provider);

  // 3. Prepare ERC-20 contract
  const ERC20_ABI = ['function transfer(address to, uint amount) returns (bool)'];
  const contract = new providers.Contract(tokenAddress, ERC20_ABI, wallet);

  // 4. Parse token amount into smallest unit
  const unitAmount = parseUnits(amount, decimals);

  // 5. Send the transfer
  const txResponse = await contract.transfer(to, unitAmount);

  return txResponse.hash;
}
