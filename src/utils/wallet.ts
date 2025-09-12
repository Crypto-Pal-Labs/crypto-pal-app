// src/utils/wallet.ts
import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import { ETH_RPC_URL, BSC_RPC_URL } from '@env';

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
export async function getWalletAddress(): Promise<string> {
  try {
    const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
    if (!mnemonic) {
      console.warn('No mnemonic found in SecureStore');
      return ''; // Or throw error if preferred
    }
    const wallet = ethers.Wallet.fromMnemonic(mnemonic);
    return wallet.address; // Derives main ETH/BSC address
  } catch (e) {
    console.error('Failed to derive address from mnemonic:', e);
    return '';
  }
}

/**
 * Get the wallet signer connected to a provider for transactions.
 * @param chain The chain to use ('ETH' or 'BSC').
 * @returns The connected wallet signer.
 */
export async function getWalletSigner(chain = 'ETH') {
  try {
    const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY);
    if (!mnemonic) {
      throw new Error('No wallet found. Please create or restore a wallet.');
    }
    const wallet = ethers.Wallet.fromMnemonic(mnemonic);
    const rpcUrl = chain === 'BSC' ? BSC_RPC_URL : ETH_RPC_URL;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl); // Fix: v5 syntax - ethers.providers.JsonRpcProvider
    return wallet.connect(provider);
  } catch (e) {
    console.error('Failed to get wallet signer:', e);
    throw new Error('Unable to connect wallet to provider.');
  }
}

/**
 * Estimate gas for a transaction.
 * @param to Recipient address.
 * @param amount Amount in token units.
 * @param tokenAddress Optional ERC20 contract address (null for native).
 * @param chain Chain ('ETH' or 'BSC').
 * @returns Estimated fee in ETH/BNB.
 */
export async function estimateGas(to: string, amount: string, tokenAddress: string | null, chain = 'ETH') {
  try {
    const signer = await getWalletSigner(chain);
    let tx: any = { to, value: ethers.utils.parseEther(amount) }; // Fix: v5 syntax - ethers.utils.parseEther
    if (tokenAddress) {
      const abi = ['function transfer(address to, uint256 value)'];
      const contract = new ethers.Contract(tokenAddress, abi, signer);
      tx = await contract.populateTransaction.transfer(to, ethers.utils.parseUnits(amount, 18)); // Fix: v5 syntax - ethers.utils.parseUnits
    }
    const gasLimit = await signer.estimateGas(tx);
    const gasPrice = await signer.provider.getGasPrice();
    const gasFee = gasLimit.mul(gasPrice); // Fix: v5 BigNumber .mul() for multiplication
    return ethers.utils.formatEther(gasFee); // v5 syntax
  } catch (e) {
    console.error('Failed to estimate gas:', e);
    throw new Error('Gas estimation failed.');
  }
}

/**
 * Send transaction and wait for confirmation.
 * @param to Recipient address.
 * @param amount Amount in token units.
 * @param tokenAddress Optional ERC20 contract address (null for native).
 * @param chain Chain ('ETH' or 'BSC').
 * @returns Tx hash.
 */
export async function sendTransaction(to: string, amount: string, tokenAddress: string | null, chain = 'ETH') {
  try {
    const signer = await getWalletSigner(chain);
    let txResponse;
    if (tokenAddress) {
      const abi = ['function transfer(address to, uint256 value)'];
      const contract = new ethers.Contract(tokenAddress, abi, signer);
      txResponse = await contract.transfer(to, ethers.utils.parseUnits(amount, 18)); // Fix: v5 syntax - ethers.utils.parseUnits
    } else {
      txResponse = await signer.sendTransaction({ to, value: ethers.utils.parseEther(amount) }); // Fix: v5 syntax - ethers.utils.parseEther
    }
    await txResponse.wait();
    return txResponse.hash;
  } catch (e) {
    console.error('Failed to send transaction:', e);
    throw new Error('Transaction failed.');
  }
}