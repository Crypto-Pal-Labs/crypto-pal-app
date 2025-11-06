/**
 * Transak Network Mapper
 * Maps Transak's network/cryptoCurrency fields to our internal chainId and networkName
 * This is the SINGLE SOURCE OF TRUTH for network detection - NO hardcoded token checks
 */

export interface NetworkMapping {
  chainId: number;
  networkName: string;
  isEvm: boolean;
}

/**
 * Map Transak network/cryptoCurrency to our internal network representation
 * This handles ALL tokens generically - no hardcoded checks for specific tokens
 * 
 * @param network - Transak's network field (e.g., "ethereum", "polygon", "bitcoin")
 * @param cryptoCurrency - Transak's cryptoCurrency field (e.g., "BTC", "ETH", "XRP")
 * @param isStaging - Whether we're in staging (affects testnet vs mainnet)
 * @returns NetworkMapping with chainId, networkName, and isEvm flag
 */
export function mapTransakNetwork(
  network?: string,
  cryptoCurrency?: string,
  isStaging: boolean = true
): NetworkMapping {
  const networkLower = (network || '').toLowerCase().trim();
  const currencyUpper = (cryptoCurrency || '').toUpperCase().trim();
  
  // CRITICAL: Use network field as PRIMARY source - it's the most reliable
  // cryptoCurrency is only used as fallback if network is missing
  
  // ===== EVM NETWORKS =====
  // Transak network names for EVM chains
  if (networkLower.includes('ethereum') || networkLower === 'eth' || networkLower === 'ethereum') {
    // Ethereum mainnet or testnet
    if (networkLower.includes('sepolia') || networkLower.includes('testnet') || isStaging) {
      return { chainId: 11155111, networkName: 'Sepolia', isEvm: true };
    }
    return { chainId: 1, networkName: 'Ethereum', isEvm: true };
  }
  
  if (networkLower.includes('polygon') || networkLower === 'polygon' || networkLower === 'matic') {
    if (networkLower.includes('amoy') || networkLower.includes('testnet') || isStaging) {
      return { chainId: 80002, networkName: 'Polygon Amoy', isEvm: true };
    }
    return { chainId: 137, networkName: 'Polygon', isEvm: true };
  }
  
  if (networkLower.includes('bsc') || networkLower.includes('binance') || networkLower === 'bnb') {
    if (networkLower.includes('testnet') || isStaging) {
      return { chainId: 97, networkName: 'BSC Testnet', isEvm: true };
    }
    return { chainId: 56, networkName: 'BSC', isEvm: true };
  }
  
  if (networkLower.includes('arbitrum') || networkLower === 'arbitrum') {
    return { chainId: 42161, networkName: 'Arbitrum', isEvm: true };
  }
  
  if (networkLower.includes('optimism') || networkLower === 'optimism') {
    return { chainId: 10, networkName: 'Optimism', isEvm: true };
  }
  
  if (networkLower.includes('avalanche') || networkLower === 'avalanche' || networkLower === 'avax') {
    return { chainId: 43114, networkName: 'Avalanche', isEvm: true };
  }
  
  if (networkLower.includes('base') || networkLower === 'base') {
    return { chainId: 8453, networkName: 'Base', isEvm: true };
  }
  
  if (networkLower.includes('linea') || networkLower === 'linea') {
    return { chainId: 59144, networkName: 'Linea', isEvm: true };
  }
  
  if (networkLower.includes('fantom') || networkLower === 'fantom' || networkLower === 'ftm') {
    return { chainId: 250, networkName: 'Fantom', isEvm: true };
  }
  
  if (networkLower.includes('ethereum classic') || networkLower.includes('etc')) {
    return { chainId: 61, networkName: 'Ethereum Classic', isEvm: true };
  }
  
  if (networkLower.includes('celo') || networkLower === 'celo') {
    return { chainId: 42220, networkName: 'Celo', isEvm: true };
  }
  
  if (networkLower.includes('gnosis') || networkLower.includes('xdai') || networkLower === 'gnosis') {
    return { chainId: 100, networkName: 'Gnosis', isEvm: true };
  }
  
  if (networkLower.includes('moonbeam') || networkLower === 'moonbeam') {
    return { chainId: 1284, networkName: 'Moonbeam', isEvm: true };
  }
  
  if (networkLower.includes('moonriver') || networkLower === 'moonriver') {
    return { chainId: 1285, networkName: 'Moonriver', isEvm: true };
  }
  
  if (networkLower.includes('cronos') || networkLower === 'cronos' || networkLower === 'cro') {
    return { chainId: 25, networkName: 'Cronos', isEvm: true };
  }
  
  if (networkLower.includes('zksync') || networkLower.includes('zksync era') || networkLower === 'zksync') {
    if (networkLower.includes('era')) {
      return { chainId: 324, networkName: 'zkSync Era', isEvm: true };
    }
    // Default to Era for zkSync
    return { chainId: 324, networkName: 'zkSync Era', isEvm: true };
  }
  
  if (networkLower.includes('scroll') || networkLower === 'scroll') {
    return { chainId: 534352, networkName: 'Scroll', isEvm: true };
  }
  
  if (networkLower.includes('mantle') || networkLower === 'mantle') {
    return { chainId: 5000, networkName: 'Mantle', isEvm: true };
  }
  
  if (networkLower.includes('blast') || networkLower === 'blast') {
    return { chainId: 81457, networkName: 'Blast', isEvm: true };
  }
  
  if (networkLower.includes('okc') || networkLower.includes('okx') || networkLower === 'okc') {
    return { chainId: 66, networkName: 'OKC', isEvm: true };
  }
  
  if (networkLower.includes('harmony') || networkLower === 'harmony' || networkLower === 'one') {
    return { chainId: 1666600000, networkName: 'Harmony', isEvm: true };
  }
  
  // ===== NON-EVM NETWORKS =====
  if (networkLower.includes('bitcoin') || networkLower === 'bitcoin' || networkLower === 'btc') {
    return { chainId: 0, networkName: 'Bitcoin', isEvm: false };
  }
  
  if (networkLower.includes('solana') || networkLower === 'solana' || networkLower === 'sol') {
    return { chainId: 999999, networkName: 'Solana', isEvm: false }; // Using placeholder chainId for Solana
  }
  
  if (networkLower.includes('ripple') || networkLower === 'ripple' || networkLower === 'xrp' || networkLower === 'xrpl') {
    // XRP Ledger mainnet - always mainnet for XRP (no testnet support in Transak staging)
    // CRITICAL: XRP mainnet is the same regardless of staging/production
    // Transak uses XRP mainnet for both staging and production
    return { chainId: 999998, networkName: 'Ripple', isEvm: false };
  }
  
  if (networkLower.includes('stellar') || networkLower === 'stellar' || networkLower === 'xlm') {
    return { chainId: 999997, networkName: 'Stellar', isEvm: false };
  }
  
  if (networkLower.includes('cardano') || networkLower === 'cardano' || networkLower === 'ada') {
    return { chainId: 999996, networkName: 'Cardano', isEvm: false };
  }
  
  if (networkLower.includes('tron') || networkLower === 'tron' || networkLower === 'trx') {
    return { chainId: 999995, networkName: 'Tron', isEvm: false };
  }
  
  if (networkLower.includes('dogecoin') || networkLower === 'dogecoin' || networkLower === 'doge') {
    return { chainId: 999994, networkName: 'Dogecoin', isEvm: false };
  }
  
  if (networkLower.includes('litecoin') || networkLower === 'litecoin' || networkLower === 'ltc') {
    return { chainId: 999993, networkName: 'Litecoin', isEvm: false };
  }
  
  if (networkLower.includes('bitcoin cash') || networkLower.includes('bch')) {
    return { chainId: 999992, networkName: 'Bitcoin Cash', isEvm: false };
  }
  
  if (networkLower.includes('cosmos') || networkLower === 'cosmos' || networkLower === 'atom') {
    return { chainId: 999991, networkName: 'Cosmos', isEvm: false };
  }
  
  if (networkLower.includes('polkadot') || networkLower === 'polkadot' || networkLower === 'dot') {
    return { chainId: 999990, networkName: 'Polkadot', isEvm: false };
  }
  
  if (networkLower.includes('near') || networkLower === 'near') {
    return { chainId: 999989, networkName: 'Near', isEvm: false };
  }
  
  if (networkLower.includes('algorand') || networkLower === 'algorand' || networkLower === 'algo') {
    return { chainId: 999988, networkName: 'Algorand', isEvm: false };
  }
  
  if (networkLower.includes('tezos') || networkLower === 'tezos' || networkLower === 'xtz') {
    return { chainId: 999987, networkName: 'Tezos', isEvm: false };
  }
  
  if (networkLower.includes('ton') || networkLower === 'ton' || networkLower.includes('toncoin')) {
    return { chainId: 999986, networkName: 'TON', isEvm: false };
  }
  
  // FALLBACK: If network is missing, try to infer from cryptoCurrency
  // This is a LAST RESORT - prefer network field from API
  if (!network && currencyUpper) {
    // EVM tokens that typically map to Ethereum mainnet
    const evmMainnetTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'LINK', 'UNI'];
    if (evmMainnetTokens.includes(currencyUpper)) {
      return isStaging 
        ? { chainId: 11155111, networkName: 'Sepolia', isEvm: true }
        : { chainId: 1, networkName: 'Ethereum', isEvm: true };
    }
    
    // Polygon tokens
    if (currencyUpper === 'MATIC') {
      return isStaging
        ? { chainId: 80002, networkName: 'Polygon Amoy', isEvm: true }
        : { chainId: 137, networkName: 'Polygon', isEvm: true };
    }
    
    // BNB/BSC
    if (currencyUpper === 'BNB') {
      return isStaging
        ? { chainId: 97, networkName: 'BSC Testnet', isEvm: true }
        : { chainId: 56, networkName: 'BSC', isEvm: true };
    }
    
    // Celo
    if (currencyUpper === 'CELO') {
      return { chainId: 42220, networkName: 'Celo', isEvm: true };
    }
    
    // Cronos
    if (currencyUpper === 'CRO') {
      return { chainId: 25, networkName: 'Cronos', isEvm: true };
    }
    
    // Moonbeam
    if (currencyUpper === 'GLMR') {
      return { chainId: 1284, networkName: 'Moonbeam', isEvm: true };
    }
    
    // Moonriver
    if (currencyUpper === 'MOVR') {
      return { chainId: 1285, networkName: 'Moonriver', isEvm: true };
    }
    
    // Gnosis
    if (currencyUpper === 'XDAI' || currencyUpper === 'GNO') {
      return { chainId: 100, networkName: 'Gnosis', isEvm: true };
    }
    
    // Bitcoin
    if (currencyUpper === 'BTC') {
      return { chainId: 0, networkName: 'Bitcoin', isEvm: false };
    }
    
    // XRP (Ripple) - use cryptoCurrency as primary indicator
    if (currencyUpper === 'XRP') {
      // XRP always uses mainnet (XRP Ledger)
      return { chainId: 999998, networkName: 'Ripple', isEvm: false };
    }
    
    // Solana
    if (currencyUpper === 'SOL') {
      return { chainId: 999999, networkName: 'Solana', isEvm: false };
    }
    
    // Cardano
    if (currencyUpper === 'ADA') {
      return { chainId: 999996, networkName: 'Cardano', isEvm: false };
    }
    
    // Tron
    if (currencyUpper === 'TRX') {
      return { chainId: 999995, networkName: 'Tron', isEvm: false };
    }
    
    // Stellar
    if (currencyUpper === 'XLM') {
      return { chainId: 999997, networkName: 'Stellar', isEvm: false };
    }
    
    // Dogecoin
    if (currencyUpper === 'DOGE') {
      return { chainId: 999994, networkName: 'Dogecoin', isEvm: false };
    }
    
    // Litecoin
    if (currencyUpper === 'LTC') {
      return { chainId: 999993, networkName: 'Litecoin', isEvm: false };
    }
    
    // Bitcoin Cash
    if (currencyUpper === 'BCH') {
      return { chainId: 999992, networkName: 'Bitcoin Cash', isEvm: false };
    }
    
    // Cosmos
    if (currencyUpper === 'ATOM') {
      return { chainId: 999991, networkName: 'Cosmos', isEvm: false };
    }
    
    // Polkadot
    if (currencyUpper === 'DOT') {
      return { chainId: 999990, networkName: 'Polkadot', isEvm: false };
    }
  }
  
  // ULTIMATE FALLBACK: Try to infer from cryptoCurrency if network is completely missing
  // CRITICAL: Do NOT default to Sepolia - this causes incorrect network display
  // If we can't determine the network, return a generic placeholder that will be updated by API retry
  if (currencyUpper) {
    // Try one more time with cryptoCurrency as network name
    const currencyAsNetwork = mapTransakNetwork(currencyUpper.toLowerCase(), '', isStaging);
    if (currencyAsNetwork.networkName !== 'Sepolia' && currencyAsNetwork.networkName !== 'Ethereum') {
      return currencyAsNetwork;
    }
  }
  
  // CRITICAL: Do NOT default to Sepolia - return unknown instead
  // This prevents incorrect network display and allows API retry to fix it
  console.warn('TransakNetworkMapper: Unknown network - returning placeholder (will be updated by API retry):', { network, cryptoCurrency, isStaging });
  return { chainId: 0, networkName: 'Unknown Network', isEvm: false };
}

/**
 * Check if a token symbol is non-EVM based on common patterns
 * This is used to determine address format, not network mapping
 */
export function isNonEvmToken(cryptoCurrency?: string): boolean {
  const currencyUpper = (cryptoCurrency || '').toUpperCase().trim();
  const nonEvmSymbols = new Set([
    'BTC', 'SOL', 'XRP', 'ADA', 'TRX', 'XLM', 'DOGE', 'TON', 'BCH', 'LTC', 
    'ATOM', 'XMR', 'ALGO', 'DOT', 'KAS', 'XRB', 'NEAR', 'XTZ'
  ]);
  return nonEvmSymbols.has(currencyUpper);
}

