import React from 'react';
import { WalletConnectModal } from '@walletconnect/modal-react-native';
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { WagmiConfig } from 'wagmi';
import { Chain, sepolia } from 'wagmi/chains';  // Import Chain type

const projectId = process.env.WALLET_CONNECT_PROJECT_ID || '';  // Fallback if undefined

const metadata = {
  name: 'Crypto Pal',
  description: 'Crypto Wallet App',
  url: 'https://cryptopal.app',
  icons: ['https://avatars.githubusercontent.com/u/37784886'],
};

// Define your chains with type
const bscTestnet: Chain = {
  id: 97,
  name: 'BSC Testnet',
  nativeCurrency: { name: 'Binance Coin', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: [process.env.BSC_RPC_URL || 'https://bsc-testnet.publicnode.com'] } },
  blockExplorers: { default: { name: 'BscScan', url: process.env.BSCSCAN_BASE || 'https://testnet.bscscan.com' } },
};

const polygonAmoy: Chain = {
  id: 80002,
  name: 'Polygon Amoy',
  nativeCurrency: { name: 'Matic', symbol: 'MATIC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology'] } },
  blockExplorers: { default: { name: 'PolygonScan', url: 'https://amoy.polygonscan.com' } },
};

const chains = [sepolia, bscTestnet, polygonAmoy] as const;  // Fix: as const for readonly tuple

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

createWeb3Modal({
  wagmiConfig,
  projectId,
});  // Fix: Removed 'chains' as it's not in WagmiAppKitOptions

export const WalletConnectProvider = ({ children }: { children: React.ReactNode }) => {
  return <WagmiConfig config={wagmiConfig}>{children}</WagmiConfig>;
};