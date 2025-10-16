// src/hooks/useProvider.ts
import { useMemo } from "react";
import { ethers } from "ethers";
import { useChain } from "./useChain";

export const useProvider = () => {
  const { chain } = useChain();
  const url = chain.rpcUrls[0] || "";
  return useMemo(() => {
    // StaticJsonRpcProvider avoids network polling churn
    return new ethers.providers.StaticJsonRpcProvider(url, {
      chainId: chain.chainId,
      name: chain.name,
    });
  }, [url, chain.chainId, chain.name]);
};
