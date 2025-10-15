// src/hooks/useChain.ts
import { useMemo } from "react";
import { CHAINS, getChainById, getDefaultChain } from "../config/chainRegistry";
import { useChainStore } from "../store/useChainStore";

export function useChain() {
  const activeChainId = useChainStore((s) => s.activeChainId);
  const setActiveChainId = useChainStore((s) => s.setActiveChainId);

  const chain = useMemo(
    () => getChainById(activeChainId) ?? getDefaultChain(),
    [activeChainId]
  );

  return {
    chain,              // <- normalized chain object used by useAssets / useHistory
    chains: CHAINS,     // array for pickers
    activeChainId,      // number
    setActiveChainId,   // setter
  };
}
