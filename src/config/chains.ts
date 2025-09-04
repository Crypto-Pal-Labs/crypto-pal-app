import { ethers } from 'ethers';

export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;  // From your .env
  covalentChainId: number;  // For Covalent API (different from EVM chainId)
  nativeCurrency: { name: string; symbol: string; decimals: number };
  explorerBase: string;  // For tx links
}

export const chains: Record<string, ChainConfig> = {
  eth: {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: process.env.ETH_RPC_URL || '',
    covalentChainId: 11155111,  // Sepolia on Covalent
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerBase: process.env.ETHERSCAN_BASE || 'https://sepolia.etherscan.io',
  },
  bsc: {
    name: 'BSC Testnet',
    chainId: 97,
    rpcUrl: process.env.BSC_RPC_URL || '',
    covalentChainId: 97,  // BSC testnet on Covalent
    nativeCurrency: { name: 'Binance Coin', symbol: 'BNB', decimals: 18 },
    explorerBase: process.env.BSCSCAN_BASE || 'https://testnet.bscscan.com',
  },
};

export type ChainKey = keyof typeof chains;

// Helper to get provider for a chain
export function getProvider(chainKey: ChainKey): ethers.providers.JsonRpcProvider {
  const chain = chains[chainKey];
  if (!chain) throw new Error('Invalid chain');
  return new ethers.providers.JsonRpcProvider(chain.rpcUrl);
}