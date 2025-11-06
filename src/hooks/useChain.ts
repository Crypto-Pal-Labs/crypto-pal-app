// src/hooks/useChain.ts
import { useEffect, useMemo } from "react";
import { CHAINS, getDefaultChain, EvmChain } from "../config/chainRegistry";
import { useChainStore } from "../store/useChainStore";

function hasRpc(c: EvmChain) {
  const hasValidRpc = Boolean(c.rpcUrls && c.rpcUrls[0] && c.rpcUrls[0]!.trim().length > 0);
  // Removed verbose logging - only log errors
  return hasValidRpc;
}

export function useChain() {
  const activeChainId = useChainStore((s) => s.activeChainId);
  const setActiveChainId = useChainStore((s) => s.setActiveChainId);

  // Show only chains that actually have an RPC url configured
  const enabledChains = useMemo(() => {
    const filtered = CHAINS.filter(hasRpc);
    // Removed verbose logging - only log if no chains enabled (error case)
    if (filtered.length === 0) {
      console.warn('useChain: No chains enabled - check RPC configuration');
    }
    return filtered;
  }, []);

  // Pick the chain: prefer active if enabled; else fall back to first enabled; else default
  // Special case: if activeChainId is 0 (All Networks), return null to indicate "all networks"
  const chain = useMemo(() => {
    // If activeChainId is 0 (All Networks), return null to indicate "all networks"
    if (activeChainId === 0) return null;
    
    const fromActive = enabledChains.find((c) => c.chainId === activeChainId);
    if (fromActive) return fromActive;
    if (enabledChains.length > 0) return enabledChains[0];
    return getDefaultChain();
  }, [activeChainId, enabledChains]);

  // Self-heal: if the stored activeChainId isn't available, reset it to a valid one
  // BUT allow 0 (All Networks) to pass through
  useEffect(() => {
    if (enabledChains.length === 0) return;
    // Allow 0 (All Networks) to pass through without self-healing
    if (activeChainId === 0) return;
    const ok = enabledChains.some((c) => c.chainId === activeChainId);
    if (!ok) setActiveChainId(enabledChains[0].chainId);
  }, [activeChainId, enabledChains, setActiveChainId]);

  // Expose an array for pickers; if none enabled, expose full list (so UI isn't empty)
  const chains = enabledChains.length > 0 ? enabledChains : CHAINS;

  // Removed verbose Ethereum Classic debugging logs

  return {
    chain,              // current chain object (null for All Networks)
    chains,             // array for network picker
    activeChainId: activeChainId, // Use the actual activeChainId, not chain.chainId
    setActiveChainId,   // setter
  };
}
