// src/utils/eth.ts
import { ethers } from 'ethers';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native'; // For user alerts on errors

export type ChainId = 'eth' | 'bsc' | 'polygon'; // String keys for currentChain

export async function getProvider(chainId: ChainId) { // Marked as async for await
  const extra = Constants.expoConfig?.extra || {}; // Safe access in standalone
  let rpcUrl = extra.ETH_RPC_URL || 'https://rpc.sepolia.org'; // Default fallback, no process.env (undefined in builds)
  if (chainId === 'bsc') rpcUrl = extra.BSC_RPC_URL || 'https://bsc-testnet.publicnode.com';
  if (chainId === 'polygon') rpcUrl = extra.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';

  console.log('getProvider called with chainId:', chainId); // Debug
  console.log('RPC URL from Constants.extra:', rpcUrl ? `Set (length: ${rpcUrl.length})` : 'Missing - using fallback'); // Redacted full for security

  // Validate key if Infura/Alchemy (32 chars, no invalid prefixes)
  if ((rpcUrl.includes('infura.io') || rpcUrl.includes('alchemy.com')) && rpcUrl.split('/').pop()?.length !== 32) {
    console.warn('Invalid key (expected 32 chars)—switching to public fallback');
    rpcUrl = chainId === 'eth' ? 'https://rpc.sepolia.org' : (chainId === 'bsc' ? 'https://bsc-testnet.publicnode.com' : 'https://rpc-amoy.polygon.technology');
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    // Test detection with try-catch/timeout (prevents noNetwork throw)
    const networkPromise = provider.detectNetwork();
    const network = await Promise.race<ethers.providers.Network>([ // Type as Network
      networkPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Detection timeout')), 5000))
    ]);
    console.log('Network detected:', network.chainId, network.name); // Success
    return provider;
  } catch (err) {
    console.error('Provider failed:', (err as Error).message); // Log
    Alert.alert('Network Error', 'Could not detect network - using public fallback.');
    return new ethers.providers.JsonRpcProvider('https://rpc.sepolia.org'); // Ultimate fallback
  }
}

export async function getSigner(chainId: ChainId) {
  const phrase = await SecureStore.getItemAsync('mnemonic');
  if (!phrase) throw new Error('No wallet found. Please create or restore.');
  const wallet = ethers.Wallet.fromMnemonic(phrase);
  return wallet.connect(await getProvider(chainId)); // Await for async
}

export function isEthAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export const parseUnits = ethers.utils.parseUnits;
export const formatUnits = ethers.utils.formatUnits;

export async function estimateNativeSend(
  chainId: ChainId,
  to: string,
  valueWei: ethers.BigNumber
): Promise<{ feeWei: ethers.BigNumber; gas: ethers.BigNumber }> {
  const signer = await getSigner(chainId);
  const from = await signer.getAddress();
  const provider = signer.provider!;
  const gas = await provider.estimateGas({ to, value: valueWei, from });
  const feeData = await provider.getFeeData();
  const price = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!price) throw new Error('Unable to fetch gas price.');
  return { feeWei: gas.mul(price), gas };
}

export async function sendNative(
  chainId: ChainId,
  to: string,
  valueWei: ethers.BigNumber
): Promise<string> {
  const signer = await getSigner(chainId);
  const tx = await signer.sendTransaction({ to, value: valueWei });
  return tx.hash;
}

const erc20Abi = [
  'function transfer(address to, uint256 value) returns (bool)',
];

export async function sendErc20(
  chainId: ChainId,
  tokenAddr: string,
  to: string,
  amountWei: ethers.BigNumber
): Promise<string> {
  const signer = await getSigner(chainId);
  const c = new ethers.Contract(tokenAddr, erc20Abi, signer);
  const tx = await c.transfer(to, amountWei);
  return tx.hash;
}

export function scannerTxUrl(chainId: ChainId, hash: string) {
  switch (chainId) {
    case 'bsc':
      return `https://testnet.bscscan.com/tx/${hash}`;
    case 'polygon':
      return `https://amoy.polygonscan.com/tx/${hash}`;
    default:
      return `https://sepolia.etherscan.io/tx/${hash}`;
  }
}