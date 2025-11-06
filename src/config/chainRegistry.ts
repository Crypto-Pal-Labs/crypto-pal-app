// src/config/chainRegistry.ts
export type EvmChain = {
  chainId: number;
  name: string;
  shortName: string;
  covalentChainId: string;        // e.g. "eth-sepolia", "bsc-mainnet", "matic-mainnet"
  rpcUrls: string[];
  explorerBase: string;
  nativeSymbol: "ETH" | "ETC" | "BNB" | "MATIC" | "AVAX" | "ARB" | "OP" | "BASE" | "SOL" | "TRX" | "ADA" | "DOT" | "LINK" | "UNI" | "ATOM" | "NEAR" | "FTM" | "ALGO" | "CELO" | "XDAI" | "GLMR" | "MOVR" | "CRO" | "ZKSYNC" | "SCROLL" | "MNT" | "BLAST" | "OKB" | "ONE" | "TON" | "XLM" | "DOGE" | "LTC" | "BCH" | "XMR" | "KAS" | "XRB" | "XTZ";
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
      "https://rpc.sepolia.org", // Most reliable public RPC
      "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // Infura backup
      process.env.EXPO_PUBLIC_ETH_RPC_URL ?? "https://eth-sepolia.g.alchemy.com/v2/alcht_uv4juP2GrHsvgb63E8yNXAhCWicWBj", // Alchemy last
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
    covalentSupported: false, // Polygon Amoy is not supported by Covalent
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
    chainId: 61,
    name: "Ethereum Classic",
    shortName: "ETC · Mainnet",
    covalentChainId: "etc-mainnet", // Covalent may not support ETC, will use RPC fallback
    covalentSupported: false, // ETC is not widely supported by Covalent
    rpcUrls: [
      "https://etc.blockscout.com/api/eth-rpc",
      "https://ethereumclassic.network",
      "https://www.ethercluster.com/etc",
      "https://rpc.ankr.com/etc",
      "https://ethereumclassic.network",
      "https://etc.blockscout.com/api/eth-rpc",
      "https://etc.rpcpool.com",
      "https://ethereumclassic.network"
    ],
    explorerBase: "https://blockscout.com/etc/mainnet",
    nativeSymbol: "ETC",
    decimals: 18,
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
  {
    chainId: 250,
    name: "Fantom",
    shortName: "Fantom · Opera",
    covalentChainId: "fantom-mainnet",
    rpcUrls: [
      "https://rpc.ankr.com/fantom",
      "https://rpc.fantom.network",
      "https://fantom-mainnet.public.blastapi.io"
    ],
    explorerBase: "https://ftmscan.com",
    nativeSymbol: "FTM",
    decimals: 18,
    covalentSupported: true,
  },
  // ===== ADDITIONAL TRANSAK-SUPPORTED EVM CHAINS =====
  {
    chainId: 42220,
    name: "Celo",
    shortName: "Celo · Mainnet",
    covalentChainId: "celo-mainnet",
    rpcUrls: [
      "https://forno.celo.org",
      "https://rpc.ankr.com/celo",
      "https://celo-mainnet.public.blastapi.io"
    ],
    explorerBase: "https://celoscan.io",
    nativeSymbol: "CELO",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 100,
    name: "Gnosis",
    shortName: "Gnosis · Mainnet",
    covalentChainId: "gnosis-mainnet",
    rpcUrls: [
      "https://rpc.gnosischain.com",
      "https://rpc.ankr.com/gnosis",
      "https://gnosis-mainnet.public.blastapi.io"
    ],
    explorerBase: "https://gnosisscan.io",
    nativeSymbol: "XDAI",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 1284,
    name: "Moonbeam",
    shortName: "Moonbeam · Mainnet",
    covalentChainId: "moonbeam-mainnet",
    rpcUrls: [
      "https://rpc.api.moonbeam.network",
      "https://moonbeam.public.blastapi.io",
      "https://rpc.ankr.com/moonbeam"
    ],
    explorerBase: "https://moonscan.io",
    nativeSymbol: "GLMR",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 1285,
    name: "Moonriver",
    shortName: "Moonriver · Mainnet",
    covalentChainId: "moonriver-mainnet",
    rpcUrls: [
      "https://rpc.api.moonriver.moonbeam.network",
      "https://moonriver.public.blastapi.io",
      "https://rpc.ankr.com/moonriver"
    ],
    explorerBase: "https://moonriver.moonscan.io",
    nativeSymbol: "MOVR",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 25,
    name: "Cronos",
    shortName: "Cronos · Mainnet",
    covalentChainId: "cronos-mainnet",
    rpcUrls: [
      "https://evm.cronos.org",
      "https://cronos.blockpi.network/v1/rpc/public",
      "https://rpc.ankr.com/cronos"
    ],
    explorerBase: "https://cronoscan.com",
    nativeSymbol: "CRO",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 324,
    name: "zkSync Era",
    shortName: "zkSync · Era",
    covalentChainId: "zksync-mainnet",
    rpcUrls: [
      "https://mainnet.era.zksync.io",
      "https://zksync-mainnet.blockpi.network/v1/rpc/public",
      "https://rpc.ankr.com/zksync_era"
    ],
    explorerBase: "https://explorer.zksync.io",
    nativeSymbol: "ETH",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 534352,
    name: "Scroll",
    shortName: "Scroll · Mainnet",
    covalentChainId: "scroll-mainnet",
    rpcUrls: [
      "https://rpc.scroll.io",
      "https://rpc.ankr.com/scroll",
      "https://scroll-mainnet.public.blastapi.io"
    ],
    explorerBase: "https://scrollscan.com",
    nativeSymbol: "ETH",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 5000,
    name: "Mantle",
    shortName: "Mantle · Mainnet",
    covalentChainId: "mantle-mainnet",
    rpcUrls: [
      "https://rpc.mantle.xyz",
      "https://mantle-mainnet.public.blastapi.io",
      "https://rpc.ankr.com/mantle"
    ],
    explorerBase: "https://explorer.mantle.xyz",
    nativeSymbol: "MNT",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 81457,
    name: "Blast",
    shortName: "Blast · Mainnet",
    covalentChainId: "blast-mainnet",
    rpcUrls: [
      "https://rpc.blast.io",
      "https://blast-mainnet.public.blastapi.io",
      "https://rpc.ankr.com/blast"
    ],
    explorerBase: "https://blastscan.io",
    nativeSymbol: "ETH",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 66,
    name: "OKC",
    shortName: "OKX Chain",
    covalentChainId: "okc-mainnet",
    rpcUrls: [
      "https://exchainrpc.okex.org",
      "https://okc-mainnet.public.blastapi.io",
      "https://rpc.ankr.com/okc"
    ],
    explorerBase: "https://www.oklink.com/en/okc",
    nativeSymbol: "OKB",
    decimals: 18,
    covalentSupported: true,
  },
  {
    chainId: 1666600000,
    name: "Harmony",
    shortName: "Harmony · Mainnet",
    covalentChainId: "harmony-mainnet",
    rpcUrls: [
      "https://api.harmony.one",
      "https://harmony-mainnet.public.blastapi.io",
      "https://rpc.ankr.com/harmony"
    ],
    explorerBase: "https://explorer.harmony.one",
    nativeSymbol: "ONE",
    decimals: 18,
    covalentSupported: true,
  },
  // Add more Arbitrum and Optimism variants
  {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    shortName: "Arbitrum · Sepolia",
    covalentChainId: "arbitrum-sepolia",
    rpcUrls: [
      "https://sepolia-rollup.arbitrum.io/rpc",
      "https://arbitrum-sepolia.blockpi.network/v1/rpc/public"
    ],
    explorerBase: "https://sepolia.arbiscan.io",
    nativeSymbol: "ETH",
    decimals: 18,
    testnet: true,
    covalentSupported: true,
  },
  {
    chainId: 11155420,
    name: "Optimism Sepolia",
    shortName: "Optimism · Sepolia",
    covalentChainId: "optimism-sepolia",
    rpcUrls: [
      "https://sepolia.optimism.io",
      "https://optimism-sepolia.blockpi.network/v1/rpc/public"
    ],
    explorerBase: "https://sepolia-optimistic.etherscan.io",
    nativeSymbol: "ETH",
    decimals: 18,
    testnet: true,
    covalentSupported: true,
  },
  {
    chainId: 84532,
    name: "Base Sepolia",
    shortName: "Base · Sepolia",
    covalentChainId: "base-sepolia",
    rpcUrls: [
      "https://sepolia.base.org",
      "https://base-sepolia.blockpi.network/v1/rpc/public"
    ],
    explorerBase: "https://sepolia.basescan.org",
    nativeSymbol: "ETH",
    decimals: 18,
    testnet: true,
    covalentSupported: true,
  },
];

export const getChainById = (id: number) => CHAINS.find((c) => c.chainId === id);
export const getDefaultChain = () => getChainById(11155111)!; // Sepolia default
