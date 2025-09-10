export const chains = {
  eth: {
    name: 'Sepolia',
    chainId: '11155111',
    nativeCurrency: 'ETH',
    rpc: process.env.ETH_RPC_URL,
    explorer: process.env.ETHERSCAN_BASE,
  },
  bsc: {
    name: 'BSC Testnet',
    chainId: '97',
    nativeCurrency: 'BNB',
    rpc: process.env.BSC_RPC_URL,
    explorer: process.env.BSCSCAN_BASE,
  },
  polygon: {
    name: 'Polygon Amoy',
    chainId: '80002',
    nativeCurrency: 'POL',
    rpc: process.env.POLYGON_RPC_URL,
    explorer: 'https://amoy.polygonscan.com/',
  },
};

export type ChainKey = keyof typeof chains;