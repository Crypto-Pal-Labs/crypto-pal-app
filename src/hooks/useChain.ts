// src/hooks/useChain.ts
import { useEffect, useMemo } from "react";
import { CHAINS, getDefaultChain, EvmChain } from "../config/chainRegistry";
import { useChainStore } from "../store/useChainStore";

function hasRpc(c: EvmChain) {
  return Boolean(c.rpcUrls && c.rpcUrls[0] && c.rpcUrls[0]!.trim().length > 0);
}

export function useChain() {
  const activeChainId = useChainStore((s) => s.activeChainId);
  const setActiveChainId = useChainStore((s) => s.setActiveChainId);

  // Show only chains that actually have an RPC url configured
  const enabledChains = useMemo(() => CHAINS.filter(hasRpc), []);

  // Pick the chain: prefer active if enabled; else fall back to first enabled; else default
  const chain = useMemo(() => {
    const fromActive = enabledChains.find((c) => c.chainId === activeChainId);
    if (fromActive) return fromActive;
    if (enabledChains.length > 0) return enabledChains[0];
    return getDefaultChain();
  }, [activeChainId, enabledChains]);

  // Self-heal: if the stored activeChainId isn't available, reset it to a valid one
  useEffect(() => {
    if (enabledChains.length === 0) return;
    const ok = enabledChains.some((c) => c.chainId === activeChainId);
    if (!ok) setActiveChainId(enabledChains[0].chainId);
  }, [activeChainId, enabledChains, setActiveChainId]);

  // Expose an array for pickers; if none enabled, expose full list (so UI isn't empty)
  const chains = enabledChains.length > 0 ? enabledChains : CHAINS;

  return {
    chain,              // current chain object
    chains,             // array for network picker
    activeChainId: chain.chainId,
    setActiveChainId,   // setter
  };
}
