/**
 * Central capability map per Covalent chain key.
 * true  = use Covalent for that data class
 * false = skip Covalent; use RPC/explorer fallbacks
 *
 * Notes:
 * - Your probes showed 200 OK on: eth-mainnet, bsc-mainnet, matic-mainnet, eth-sepolia, bsc-testnet.
 * - Polygon Amoy (matic-amoy) returned 501 for both balances_v2 and transactions_v3.
 *   Keep Amoy = false,false (dev/testnet only; Transak focuses on mainnets).
 */

export type DataClass = "balances" | "txs";

const MATRIX: Record<string, { balances: boolean; txs: boolean }> = {
  "eth-mainnet":   { balances: true,  txs: true  },
  "bsc-mainnet":   { balances: true,  txs: true  },
  "matic-mainnet": { balances: true,  txs: true  },

  "eth-sepolia":   { balances: true,  txs: true  },
  "bsc-testnet":   { balances: true,  txs: true  },

  "matic-amoy":    { balances: false, txs: false }, // 501 on your key/plan; use RPC & explorer
};

export function isCovalentSupported(kind: DataClass, covalentChainId?: string): boolean {
  if (!covalentChainId) return false;
  const row = MATRIX[covalentChainId];
  if (!row) return true; // default to true for unknown chains (mainnet-first bias)
  return row[kind];
}
