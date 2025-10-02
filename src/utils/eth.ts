// src/utils/eth.ts
import { ethers } from 'ethers';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export type ChainId = 1 | 56;

const RPC: Record<ChainId, string> = {
  1: Constants.expoConfig?.extra?.EXPO_PUBLIC_ETH_RPC_URL || process.env.EXPO_PUBLIC_ETH_RPC_URL || 'https://ethereum.publicnode.com',
  56: 'https://bsc.publicnode.com',
};

export function getProvider(chainId: ChainId) {
  const rpcUrl = RPC[chainId];
  console.log('Using RPC for chain', chainId, ':', rpcUrl);
  return new ethers.providers.JsonRpcProvider(rpcUrl);
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
  return chainId === 56
    ? `https://bscscan.com/tx/${hash}`
    : `https://etherscan.io/tx/${hash}`;
}