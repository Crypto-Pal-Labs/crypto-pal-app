// src/utils/eth.ts
import { ethers } from 'ethers';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export type ChainId = 'eth' | 'bsc' | 'polygon'; // String keys for currentChain

const RPC: Record<ChainId, string> = {
  'eth': Constants.expoConfig?.extra?.ETH_RPC_URL || process.env.ETH_RPC_URL || 'https://rpc.sepolia.org', // Public Sepolia fallback
  'bsc': Constants.expoConfig?.extra?.BSC_RPC_URL || process.env.BSC_RPC_URL || 'https://bsc-testnet.publicnode.com', // BSC Testnet fallback
  'polygon': Constants.expoConfig?.extra?.POLYGON_RPC_URL || process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology', // Amoy fallback
};

export function getProvider(chainId: ChainId) {
  let rpcUrl = RPC[chainId];
  console.log('getProvider called with chainId:', chainId); // Debug
  console.log('RPC URL from RPC map:', rpcUrl ? `Set (length: ${rpcUrl.length}, full: ${rpcUrl})` : 'Missing'); // Full URL log

  // Safeguard: Check if Alchemy URL has valid key (32 chars)
  if (rpcUrl.includes('alchemy.com') && rpcUrl.split('/').pop()?.length !== 32) {
    console.warn('Invalid Alchemy key detected (expected 32 chars)—switching to public fallback');
    switch (chainId) {
      case 'eth':
        rpcUrl = 'https://rpc.sepolia.org';
        break;
      case 'bsc':
        rpcUrl = 'https://bsc-testnet.publicnode.com';
        break;
      case 'polygon':
        rpcUrl = 'https://rpc-amoy.polygon.technology';
        break;
    }
    console.log('Switched to fallback RPC:', rpcUrl); // Debug
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    // Force network detection with timeout to catch early errors
    setTimeout(async () => {
      try {
        const network = await provider.detectNetwork();
        console.log('Network detected successfully:', network.chainId, network.name); // Debug success
      } catch (detectErr) {
        console.error('Network detection failed:', (detectErr as Error).message); // Detailed error
      }
    }, 1000);
    return provider;
  } catch (err) {
    console.error('Provider init failed:', (err as Error).message); // Detailed
    // Ultimate fallback to a reliable public node
    return new ethers.providers.JsonRpcProvider('https://rpc.sepolia.org'); // Default to Sepolia as primary
  }
}

export async function getSigner(chainId: ChainId) {
  const phrase = await SecureStore.getItemAsync('mnemonic');
  if (!phrase) throw new Error('No wallet found. Please create or restore.');
  const wallet = ethers.Wallet.fromMnemonic(phrase);
  return wallet.connect(getProvider(chainId));
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