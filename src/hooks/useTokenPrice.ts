// src/hooks/useTokenPrice.ts
import { useState, useEffect } from 'react';
import * as Localization from 'expo-localization';

// Map your token symbols to CoinGecko IDs
const COINGECKO_IDS: Record<string, string> = {
  ETH:  'ethereum',
  USDC: 'usd-coin',
  BNB:  'binancecoin',
  // add more tokens here as needed, e.g. DAI: 'dai'
};

/**
 * Returns the latest prices for the given token symbol in multiple currencies.
 * @param token  One of the keys in COINGECKO_IDS (e.g. 'ETH', 'USDC')
 */
export function useTokenPrice(token: keyof typeof COINGECKO_IDS) {
  const [prices, setPrices] = useState<{ [currency: string]: number | null }>({ usd: null, nzd: null });
  const [localCurrency, setLocalCurrency] = useState<string>('usd'); // Default USD

  useEffect(() => {
    const initLocalCurrency = async () => {
      const { currency: userCurrency } = await Localization.getLocalizationAsync();
      setLocalCurrency(userCurrency?.toLowerCase() || 'usd');
    };
    initLocalCurrency();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = COINGECKO_IDS[token];
    const vsCurrencies = ['usd', 'nzd', localCurrency].filter((c, i, a) => a.indexOf(c) === i).join(',');

    async function fetchPrice() {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${vsCurrencies}`
        );
        const json = await res.json();
        const tokenPrices = json[id] || {};
        if (!cancelled) {
          setPrices((prev) => ({ ...prev, ...tokenPrices }));
        }
      } catch (err) {
        console.error(`Failed to fetch ${token} prices`, err);
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000); // refresh every minute
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, localCurrency]);

  return { prices, localCurrency };
}