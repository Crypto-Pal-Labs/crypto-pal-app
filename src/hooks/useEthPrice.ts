// src/hooks/useEthPrice.ts
import { useTokenPrice } from './useTokenPrice';

/**
 * Convenience hook for ETH prices only.
 */
export function useEthPrice() {
  return useTokenPrice('ETH');
}