// src/hooks/useTokenPrice.ts
import { useState, useEffect } from 'react';

// Map your token symbols to CoinGecko IDs for NZD pricing
const COINGECKO_IDS: Record<string, string> = {
  ETH:  'ethereum',
  USDC: 'usd-coin',
  BNB:  'binancecoin',
  // add more tokens here as needed, e.g. DAI: 'dai'
};

/**
 * Returns the latest NZD price for the given token symbol.
 * @param token  One of the keys in COINGECKO_IDS (e.g. 'ETH', 'USDC')
 */
export function useTokenPrice(token: keyof typeof COINGECKO_IDS) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = COINGECKO_IDS[token];

    async function fetchPrice() {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=nzd`
        );
        const json = await res.json();
        const p = json[id]?.nzd;
        if (!cancelled && typeof p === 'number') {
          setPrice(p);
        }
      } catch (err) {
        console.error(`Failed to fetch ${token} price`, err);
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000); // refresh every minute
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  return price;
}
