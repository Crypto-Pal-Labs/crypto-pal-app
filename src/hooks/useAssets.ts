import { useState, useEffect } from 'react';
import * as ethers from 'ethers';

// Inline chain configs (simple, no new files)
export const chains = {
  eth: {
    chainId: '11155111', // Sepolia
    nativeCurrency: 'ETH',
    rpc: process.env.ETH_RPC_URL,
  },
  polygon: {
    chainId: '80002', // Amoy
    nativeCurrency: 'POL',
    rpc: process.env.POLYGON_RPC_URL,
  },
};

export type ChainKey = keyof typeof chains;

const useAssets = (chain: ChainKey = 'eth', walletAddress: string) => {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBalances = async () => {
      setLoading(true);
      setError(null);
      if (!walletAddress) {
        setError('Wallet address not found');
        setLoading(false);
        return;
      }
      try {
        const config = chains[chain];
        const covalentUrl = `https://api.covalenthq.com/v1/${config.chainId}/address/${walletAddress}/balances_v2/?key=${process.env.COVALENT_KEY}`;
        const response = await fetch(covalentUrl);
        const data = await response.json();
        let items = data.data?.items || [];

        console.log(`Covalent response for ${chain}:`, items); // Debug

        if (items.length === 0) {
          console.log(`Fallback to provider for ${chain}`);
          const provider = new ethers.JsonRpcProvider(config.rpc);
          const balance = await provider.getBalance(walletAddress);
          items = [{
            contract_name: config.nativeCurrency,
            balance: ethers.formatEther(balance),
            quote_rate: 0, // NZD/USD stubs in Wallet.tsx
          }];
        }

        setBalances(items);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    loadBalances();
  }, [chain, walletAddress]);

  return { balances, loading, error };
};

export default useAssets;