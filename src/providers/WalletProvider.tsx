// src/providers/WalletProvider.tsx
import React, { useEffect } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { getWalletAddress } from '../utils/wallet';

const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const setAddress = useWalletStore((state) => state.setAddress);

  useEffect(() => {
    const loadAddress = async () => {
      const currentAddress = await getWalletAddress();
      if (currentAddress) setAddress(currentAddress);
    };
    loadAddress();
  }, [setAddress]);

  return children;
};

export default WalletProvider;