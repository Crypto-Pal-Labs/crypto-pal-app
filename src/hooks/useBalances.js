// src/hooks/useBalances.js
import { useCallback, useEffect, useState } from 'react';
import { COVALENT_KEY } from '@env';
import { useWalletStore } from '../store/useWalletStore';

// INTERNAL: core fetcher used by both hooks
function useBalancesCore() {
  const { address, chainId } = useWalletStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [usdToNzd, setUsdToNzd] = useState(1.6); // Default fallback

  const fetchRate = useCallback(async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usdt&vs_currencies=nzd');
      const data = await response.json();
      setUsdToNzd(data.usdt.nzd || 1.6);
    } catch (e) {
      console.error('USD to NZD rate fetch error:', e);
      setUsdToNzd(1.6); // Fallback
    }
  }, []);

  const fetchBalances = useCallback(async () => {
    if (!address) {
      setItems([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const url =
        `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/` +
        `?quote-currency=usd&no-nft=true&key=${COVALENT_KEY}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Network request failed: ' + res.status);
      }
      const json = await res.json();
      const arr = Array.isArray(json?.data?.items) ? json.data.items : [];
      // Convert USD quote to NZD locally
      const arrWithNzd = arr.map(item => ({
        ...item,
        quote_nzd: (item.quote || 0) * usdToNzd,
      }));
      // keep only non-zero
      setItems(arrWithNzd.filter(i => Number(i?.balance || '0') > 0));
    } catch (e) {
      console.error('[useBalances] fetch error', e);
      setError(e.message || 'Failed to load balances. Check internet or API key.');
    } finally {
      setLoading(false);
    }
  }, [address, chainId, usdToNzd]);

  useEffect(() => {
    fetchRate(); // Fetch rate first
    fetchBalances(); // Initial fetch
  }, [fetchRate, fetchBalances]);

  return { items, fetchBalances, loading, error };
}

/**
 * Old behavior (BACK-COMPAT):
 *   useBalances() -> items (array)
 * This keeps Wallet/other screens working without any changes.
 */
export function useBalances() {
  const { items } = useBalancesCore();
  return items;
}

/**
 * New behavior (ENHANCED):
 *   useBalancesEx() -> [items, refresh, { loading, error }]
 * Use this in new code (e.g., Send screen) when you need refresh + status.
 */
export function useBalancesEx() {
  const { items, fetchBalances, loading, error } = useBalancesCore();
  return [items, fetchBalances, { loading, error }];
};