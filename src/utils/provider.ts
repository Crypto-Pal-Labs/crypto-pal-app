import { JsonRpcProvider } from "ethers";

// ⚠️ Replace these with your preferred RPCs (e.g., Alchemy/Infura/QuickNode)
// Public RPCs are fine for dev; use reliable ones for production.
const RPC_BY_CHAIN: Record<number, string> = {
  1:  "https://rpc.ankr.com/eth",   // Ethereum
  56: "https://rpc.ankr.com/bsc"    // BNB Smart Chain
};

export function getProvider(chainId: number) {
  const url = RPC_BY_CHAIN[chainId];
  if (!url) throw new Error(`Unsupported chainId: ${chainId}`);
  return new JsonRpcProvider(url);
}
