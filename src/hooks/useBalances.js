// src/hooks/useBalances.js
import { useEffect, useState } from 'react';
import { COVALENT_KEY } from '@env';
import { useWalletStore } from '../store/useWalletStore';

export function useBalances() {
  const { address, chainId } = useWalletStore();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!address) return;

    fetch(
      `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/` +
      `?quote-currency=nzd&no-nft=true&key=${COVALENT_KEY}`
    )
      .then(r => r.json())
      .then(({ data }) => {
        setItems(data.items.filter(i => +i.balance));
      })
      .catch(console.error);
  }, [address, chainId]);

  return items; // [{ contract_ticker_symbol, balance, quote, logo_url, … }, …]
}

