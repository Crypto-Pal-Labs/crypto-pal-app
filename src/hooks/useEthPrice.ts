// src/hooks/useEthPrice.ts
import { useTokenPrice } from './useTokenPrice';

/**
 * Convenience hook for ETH→NZD price only.
 */
export function useEthPrice() {
  return useTokenPrice('ETH');
}

