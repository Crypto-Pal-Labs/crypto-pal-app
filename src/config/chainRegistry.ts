// src/config/chainRegistry.ts
export type EvmChain = {
  chainId: number;
  name: string;
  shortName: string;
  covalentChainId: string;        // e.g. "eth-sepolia", "bsc-mainnet", "matic-mainnet"
  rpcUrls: string[];
  explorerBase: string;
  nativeSymbol: "ETH" | "BNB" | "MATIC" | "AVAX" | "ARB" | "OP" | "BASE";
  decimals: number;
  testnet?: boolean;
  covalentSupported?: boolean;    // if false, skip Covalent and use fallbacks
};

// All Transak-supported networks for comprehensive crypto purchase support
// Testnets first, then mainnets
export const CHAINS: EvmChain[] = [
  // ===== TESTNETS =====
  {
    chainId: 11155111,
    name: "Sepolia",
    shortName: "ETH · Sepolia",
    covalentChainId: "eth-sepolia",
    rpcUrls: [
      process.env.EXPO_PUBLIC_ETH_RPC_URL ?? "https://eth-sepolia.g.alchemy.com/v2/alcht_uv4juP2GrHsvgb63E8yNXAhCWicWBj",
      "https://rpc.sepolia.org",
      "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"
    ],
    explorerBase: process.env.EXPO_PUBLIC_ETHERSCAN_BASE ?? "https://sepolia.etherscan.io",
    nativeSymbol: "ETH",
    decimals: 18,
    testnet: true,
    covalentSupported: true,
  },
  {
    chainId: 97,
    name: "BSC Testnet",
    shortName: "BSC · Testnet",
    covalentChainId: "bsc-testnet",
    rpcUrls: [
      process.env.EXPO_PUBLIC_BSC_RPC_URL ?? "https://bsc-testnet.publicnode.com",
      "https://data-seed-prebsc-1-s1.binance.org:8545",
      "https://data-seed-prebsc-2-s1.binance.org:8545"
    ],
    explorerBase: process.env.EXPO_PUBLIC_BSCSCAN_BASE ?? "https://testnet.bscscan.com",
    nativeSymbol: "BNB",
    decimals: 18,
    testnet: true,
    covalentSupported: true,
  },
  {
    chainId: 80002,
    name: "Polygon Amoy",
    shortName: "Polygon · Amoy",
    covalentChainId: "matic-amoy", // Not supported by Covalent, will use RPC fallback
    rpcUrls: [
      "https://rpc-amoy.polygon.technology",
      "https://polygon-amoy.drpc.org",
      "https://polygon-amoy.blockpi.network/v1/rpc/public",
      "https://polygon-amoy.gateway.tenderly.co",
      "https://polygon-amoy.publicnode.com"
    ],
    explorerBase: "https://amoy.polygonscan.com",
    nativeSymbol: "MATIC",
    decimals: 18,
    testnet: true,
    covalentSupported: false, // Disable Covalent, use RPC + Explorer fallback
  },

  // ===== MAINNETS =====
  {
    chainId: 1,
    name: "Ethereum",
    shortName: "ETH · Mainnet",
    covalentChainId: "eth-mainnet",
    rpcUrls: [
      process.env.EXPO_PUBLIC_ETH_MAINNET_RPC_URL ?? "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
      "https://rpc.ankr.com/eth",
      "https://eth-mainnet.public.blastapi.io"
    ],
    explorerBase: "https://etherscan.io",
    nativeSymbol: "ETH",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 56,
    name: "BSC",
    shortName: "BSC · Mainnet",
    covalentChainId: "bsc-mainnet",
    rpcUrls: [
      process.env.EXPO_PUBLIC_BSC_MAINNET_RPC_URL ?? "https://bsc-dataseed.binance.org",
      "https://bsc-dataseed1.binance.org",
      "https://bsc-dataseed2.binance.org"
    ],
    explorerBase: "https://bscscan.com",
    nativeSymbol: "BNB",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 137,
    name: "Polygon",
    shortName: "Polygon · Mainnet",
    covalentChainId: "matic-mainnet",
    rpcUrls: [
      process.env.EXPO_PUBLIC_POLYGON_MAINNET_RPC_URL ?? "https://polygon-rpc.com",
      "https://rpc.ankr.com/polygon",
      "https://polygon-mainnet.public.blastapi.io"
    ],
    explorerBase: "https://polygonscan.com",
    nativeSymbol: "MATIC",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 42161,
    name: "Arbitrum",
    shortName: "Arbitrum · One",
    covalentChainId: "arbitrum-mainnet",
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    explorerBase: "https://arbiscan.io",
    nativeSymbol: "ARB",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 10,
    name: "Optimism",
    shortName: "Optimism · Mainnet",
    covalentChainId: "optimism-mainnet",
    rpcUrls: ["https://mainnet.optimism.io"],
    explorerBase: "https://optimistic.etherscan.io",
    nativeSymbol: "OP",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 43114,
    name: "Avalanche",
    shortName: "Avalanche · C-Chain",
    covalentChainId: "avalanche-mainnet",
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
    explorerBase: "https://snowtrace.io",
    nativeSymbol: "AVAX",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 8453,
    name: "Base",
    shortName: "Base · Mainnet",
    covalentChainId: "base-mainnet",
    rpcUrls: ["https://mainnet.base.org"],
    explorerBase: "https://basescan.org",
    nativeSymbol: "BASE",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 59144,
    name: "Linea",
    shortName: "Linea · Mainnet",
    covalentChainId: "linea-mainnet",
    rpcUrls: ["https://rpc.linea.build"],
    explorerBase: "https://lineascan.build",
    nativeSymbol: "ETH",
    decimals: 18,
    covalentSupported: true,
  },
];

export const getChainById = (id: number) => CHAINS.find((c) => c.chainId === id);
export const getDefaultChain = () => getChainById(11155111)!; // Sepolia default
