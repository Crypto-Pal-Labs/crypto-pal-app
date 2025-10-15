// src/config/chainRegistry.ts
export type EvmChain = {
  chainId: number;
  name: string;
  shortName: string;
  covalentChainId: string;        // e.g. "eth-sepolia", "bsc-mainnet", "matic-mainnet"
  rpcUrls: string[];
  explorerBase: string;
  nativeSymbol: "ETH" | "BNB" | "MATIC";
  decimals: number;
  testnet?: boolean;
};

// Keep to the networks you actually want visible for Phase 2A.
// Testnets first (default = Sepolia), then mainnets.
export const CHAINS: EvmChain[] = [
  // Ethereum
  {
    chainId: 11155111,
    name: "Sepolia",
    shortName: "ETH · Sepolia",
    covalentChainId: "eth-sepolia",
    rpcUrls: [process.env.EXPO_PUBLIC_ETH_RPC_URL ?? ""],
    explorerBase: process.env.EXPO_PUBLIC_ETHERSCAN_BASE ?? "https://sepolia.etherscan.io",
    nativeSymbol: "ETH",
    decimals: 18,
    testnet: true,
  },
  {
    chainId: 1,
    name: "Ethereum",
    shortName: "ETH · Mainnet",
    covalentChainId: "eth-mainnet",
    rpcUrls: [process.env.EXPO_PUBLIC_ETH_MAINNET_RPC_URL ?? ""],
    explorerBase: "https://etherscan.io",
    nativeSymbol: "ETH",
    decimals: 18,
  },

  // BSC
  {
    chainId: 97,
    name: "BSC Testnet",
    shortName: "BSC · Testnet",
    covalentChainId: "bsc-testnet",
    rpcUrls: [process.env.EXPO_PUBLIC_BSC_RPC_URL ?? ""],
    explorerBase: process.env.EXPO_PUBLIC_BSCSCAN_BASE ?? "https://testnet.bscscan.com",
    nativeSymbol: "BNB",
    decimals: 18,
    testnet: true,
  },
  {
    chainId: 56,
    name: "BSC",
    shortName: "BSC · Mainnet",
    covalentChainId: "bsc-mainnet",
    rpcUrls: [process.env.EXPO_PUBLIC_BSC_MAINNET_RPC_URL ?? ""],
    explorerBase: "https://bscscan.com",
    nativeSymbol: "BNB",
    decimals: 18,
  },

  // Polygon
  {
    chainId: 80002,
    name: "Polygon Amoy",
    shortName: "Polygon · Amoy",
    covalentChainId: "matic-amoy",
    rpcUrls: [process.env.EXPO_PUBLIC_POLYGON_RPC_URL ?? ""],
    explorerBase: "https://www.oklink.com/amoy",
    nativeSymbol: "MATIC",
    decimals: 18,
    testnet: true,
  },
  {
    chainId: 137,
    name: "Polygon",
    shortName: "Polygon · Mainnet",
    covalentChainId: "matic-mainnet",
    rpcUrls: [process.env.EXPO_PUBLIC_POLYGON_MAINNET_RPC_URL ?? ""],
    explorerBase: "https://polygonscan.com",
    nativeSymbol: "MATIC",
    decimals: 18,
  },
];

export const getChainById = (id: number) => CHAINS.find((c) => c.chainId === id);
export const getDefaultChain = () => getChainById(11155111)!; // Sepolia default
