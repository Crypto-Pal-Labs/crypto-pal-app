// src/hooks/useBalances.js
import { useCallback, useEffect, useState } from 'react';
import { COVALENT_KEY } from '@env';
import { useWalletStore } from '../store/useWalletStore';

// INTERNAL: core fetcher used by both hooks
function useBalancesCore() {
  const { address, chainId } = useWalletStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

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
        `?quote-currency=nzd&no-nft=true&key=${COVALENT_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      const arr = Array.isArray(json?.data?.items) ? json.data.items : [];
      // keep only non-zero
      setItems(arr.filter(i => Number(i?.balance || '0') > 0));
    } catch (e) {
      console.error('[useBalances] fetch error', e);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

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
}

