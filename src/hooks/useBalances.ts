// src/hooks/useBalances.ts
import { useEffect } from 'react';
import { ethers } from 'ethers';
import Constants from 'expo-constants';
import { useWalletStore } from '../store/useWalletStore';

// Read your Infura key from app.json
const INFURA_KEY = Constants.expoConfig?.extra?.infuraKey as string;
// USDC contract on Ethereum mainnet
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

export function useBalances() {
  const { address, setBalances } = useWalletStore();

  useEffect(() => {
    if (!address) return;

    (async () => {
      // Connect to Ethereum via Infura
      const provider = new ethers.providers.InfuraProvider('homestead', INFURA_KEY);

      // Fetch ETH balance in wei
      const ethWei = await provider.getBalance(address);

      // Fetch USDC balance via ERC-20 “balanceOf” call
      const usdcData = await provider.call({
        to: USDC_ADDRESS,
        data:
          // function selector for balanceOf(address) + padded address
          '0x70a08231000000000000000000000000' +
          address.replace(/^0x/, ''),
      });

      // Format and store balances
      setBalances(
        ethers.utils.formatEther(ethWei),            // ETH as decimal
        ethers.utils.formatUnits(usdcData, 6)        // USDC has 6 decimals
      );
    })();
  }, [address]);
}
