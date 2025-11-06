// src/services/NonEvmBalanceService.ts
// Service to fetch balances for non-EVM cryptocurrencies (Bitcoin, Solana, etc.)

import { getAllWalletAddresses, MultiCoinAddresses } from './MultiCoinWalletService';

export interface NonEvmBalance {
  symbol: string;
  balance: string;
  decimals: number;
  logo_url: string;
  chainId?: number;
  networkName?: string;
}

export class NonEvmBalanceService {
  private static readonly LOGO_URLS: Record<string, string> = {
    BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    SOL: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
    XRP: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
    XLM: "https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png",
    ADA: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
    TRX: "https://assets.coingecko.com/coins/images/1094/large/tron-logo.png",
    DOGE: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
    LTC: "https://assets.coingecko.com/coins/images/2/large/litecoin.png",
    BCH: "https://assets.coingecko.com/coins/images/780/large/bch.png",
    ATOM: "https://assets.coingecko.com/coins/images/3794/large/atom.png",
    DOT: "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
  };

  /**
   * Fetch Bitcoin balance using blockchain.info API with retry and fallback
   */
  private static async fetchBitcoinBalance(address: string): Promise<NonEvmBalance | null> {
    try {
      console.log('NonEvmBalanceService: Fetching Bitcoin balance for:', address);
      
      // CRITICAL: Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      try {
        // Use blockchain.info API (free, no API key required)
        const url = `https://blockchain.info/q/addressbalance/${address}`;
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'text/plain',
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.warn(`NonEvmBalanceService: Bitcoin API HTTP ${response.status}, trying fallback...`);
          
          // Fallback: Try blockstream.info API
          try {
            const fallbackUrl = `https://blockstream.info/api/address/${address}`;
            const fallbackResponse = await fetch(fallbackUrl, { signal: controller.signal });
            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json();
              const balanceSatoshis = fallbackData.chain_stats?.funded_txo_sum || 0;
              const spentSatoshis = fallbackData.chain_stats?.spent_txo_sum || 0;
              const balanceBTC = (balanceSatoshis - spentSatoshis) / 100000000;
              
              if (balanceBTC > 0) {
                console.log(`NonEvmBalanceService: Bitcoin balance (fallback): ${balanceBTC} BTC`);
                return {
                  symbol: 'BTC',
                  balance: balanceBTC.toString(),
                  decimals: 8,
                  logo_url: this.LOGO_URLS.BTC,
                  chainId: 0,
                  networkName: 'Bitcoin'
                };
              }
            }
          } catch (fallbackError) {
            console.warn('NonEvmBalanceService: Fallback API also failed:', fallbackError);
          }
          
          return null;
        }
        
        const balanceSatoshis = await response.text();
        const balanceBTC = parseInt(balanceSatoshis) / 100000000; // Convert satoshis to BTC
        
        if (balanceBTC === 0) {
          console.log('NonEvmBalanceService: Bitcoin balance is 0');
          return null;
        }
        
        console.log(`NonEvmBalanceService: ✅ Bitcoin balance: ${balanceBTC} BTC`);
        
        return {
          symbol: 'BTC',
          balance: balanceBTC.toString(),
          decimals: 8,
          logo_url: this.LOGO_URLS.BTC,
          chainId: 0, // Bitcoin doesn't have chainId
          networkName: 'Bitcoin'
        };
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.warn('NonEvmBalanceService: Bitcoin balance fetch timeout');
        } else if (fetchError.message?.includes('Network request failed')) {
          console.warn('NonEvmBalanceService: Network error fetching Bitcoin balance (CORS or connectivity issue)');
        } else {
          throw fetchError;
        }
        return null;
      }
    } catch (error: any) {
      console.error('NonEvmBalanceService: Error fetching Bitcoin balance:', {
        error: error?.message || error,
        address: address.substring(0, 10) + '...',
        note: 'Bitcoin balance may appear later once transaction confirms on-chain'
      });
      return null;
    }
  }

  /**
   * Fetch Solana balance using Solana RPC
   */
  private static async fetchSolanaBalance(address: string): Promise<NonEvmBalance | null> {
    try {
      console.log('NonEvmBalanceService: Fetching Solana balance for:', address);
      
      // Use Solana RPC endpoint
      const rpcUrl = 'https://api.mainnet-beta.solana.com';
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [address]
        })
      });
      
      if (!response.ok) {
        throw new Error(`Solana RPC HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`Solana RPC error: ${data.error.message}`);
      }
      
      const balanceLamports = data.result?.value || 0;
      const balanceSOL = balanceLamports / 1000000000; // Convert lamports to SOL
      
      if (balanceSOL === 0) {
        console.log('NonEvmBalanceService: Solana balance is 0');
        return null;
      }
      
      console.log(`NonEvmBalanceService: Solana balance: ${balanceSOL} SOL`);
      
      return {
        symbol: 'SOL',
        balance: balanceSOL.toString(),
        decimals: 9,
        logo_url: this.LOGO_URLS.SOL,
        chainId: 101, // Solana mainnet
        networkName: 'Solana'
      };
    } catch (error) {
      console.error('NonEvmBalanceService: Error fetching Solana balance:', error);
      return null;
    }
  }

  /**
   * Fetch XRP (Ripple) balance using XRP Ledger API
   */
  private static async fetchXrpBalance(address: string): Promise<NonEvmBalance | null> {
    try {
      console.log('NonEvmBalanceService: Fetching XRP balance for:', address);
      
      // XRP Ledger API endpoint (public, no API key required)
      const rpcUrl = 'https://s1.ripple.com:51234';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            method: 'account_info',
            params: [{
              account: address,
              ledger_index: 'validated'
            }]
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.warn(`NonEvmBalanceService: XRP API HTTP ${response.status}`);
          return null;
        }
        
        const data = await response.json();
        
        if (data.error || !data.result?.account_data) {
          // Account might not exist yet (no transactions) - this is normal for new wallets
          if (data.error === 'actNotFound') {
            console.log('NonEvmBalanceService: XRP account not found (no balance)');
            return null;
          }
          console.warn('NonEvmBalanceService: XRP API error:', data.error);
          return null;
        }
        
        // XRP balance is in drops (1 XRP = 1,000,000 drops)
        const balanceDrops = parseInt(data.result.account_data.Balance || '0', 10);
        const balanceXRP = balanceDrops / 1000000;
        
        if (balanceXRP === 0) {
          console.log('NonEvmBalanceService: XRP balance is 0');
          return null;
        }
        
        console.log(`NonEvmBalanceService: ✅ XRP balance: ${balanceXRP} XRP`);
        
        return {
          symbol: 'XRP',
          balance: balanceXRP.toString(),
          decimals: 6, // XRP uses 6 decimal places
          logo_url: this.LOGO_URLS.XRP,
          chainId: 999998, // Match TransakNetworkMapper for XRP
          networkName: 'Ripple'
        };
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.warn('NonEvmBalanceService: XRP balance fetch timeout');
        } else if (fetchError.message?.includes('Network request failed')) {
          console.warn('NonEvmBalanceService: Network error fetching XRP balance');
        } else {
          throw fetchError;
        }
        return null;
      }
    } catch (error: any) {
      console.error('NonEvmBalanceService: Error fetching XRP balance:', {
        error: error?.message || error,
        address: address.substring(0, 10) + '...',
        note: 'XRP balance may appear later once transaction confirms on-chain'
      });
      return null;
    }
  }

  /**
   * Fetch all non-EVM balances for the current wallet
   * CRITICAL: This must fetch ALL purchased tokens, not just BTC/SOL
   */
  static async fetchAllNonEvmBalances(): Promise<NonEvmBalance[]> {
    try {
      console.log('NonEvmBalanceService: Fetching all non-EVM balances...');
      
      const addresses = await getAllWalletAddresses();
      const balances: NonEvmBalance[] = [];
      
      // Fetch Bitcoin balance
      if (addresses.BTC) {
        try {
          const btcBalance = await this.fetchBitcoinBalance(addresses.BTC);
          if (btcBalance) {
            balances.push(btcBalance);
          }
        } catch (e) {
          console.warn('NonEvmBalanceService: Error fetching BTC:', e);
        }
      }
      
      // Fetch Solana balance
      if (addresses.SOL) {
        try {
          const solBalance = await this.fetchSolanaBalance(addresses.SOL);
          if (solBalance) {
            balances.push(solBalance);
          }
        } catch (e) {
          console.warn('NonEvmBalanceService: Error fetching SOL:', e);
        }
      }
      
      // CRITICAL: Fetch XRP balance (user can purchase XRP through Transak)
      if (addresses.XRP) {
        try {
          const xrpBalance = await this.fetchXrpBalance(addresses.XRP);
          if (xrpBalance) {
            balances.push(xrpBalance);
          }
        } catch (e) {
          console.warn('NonEvmBalanceService: Error fetching XRP:', e);
        }
      }
      
      // Note: Other non-EVM tokens (XLM, ADA, TRX, DOGE, LTC, BCH, ATOM, DOT) can be added as needed
      // For now, we focus on the most commonly purchased tokens through Transak
      
      console.log(`NonEvmBalanceService: Found ${balances.length} non-EVM balances (BTC, SOL, XRP)`);
      return balances;
    } catch (error) {
      console.error('NonEvmBalanceService: Error fetching non-EVM balances:', error);
      return [];
    }
  }

  /**
   * Convert non-EVM balance to BalanceItem format for compatibility
   * CRITICAL: The balance from API is already in human-readable format (e.g., BTC, not satoshis)
   * DO NOT multiply by 10^decimals - that would make it 10^8 times too large for BTC!
   */
  static convertToBalanceItem(nonEvmBalance: NonEvmBalance): any {
    // Balance is already in human-readable format (e.g., "0.00129534" BTC, not satoshis)
    // Convert to wei-like format for compatibility with existing balance handling
    // But keep original balance for display
    const balanceInSmallestUnit = (parseFloat(nonEvmBalance.balance) * Math.pow(10, nonEvmBalance.decimals)).toString();
    
    return {
      contract_ticker_symbol: nonEvmBalance.symbol,
      balance: balanceInSmallestUnit, // Store in smallest unit (satoshis for BTC) for consistency
      balanceHuman: nonEvmBalance.balance, // Also store human-readable format
      quoteLocal: 0, // Will be filled by price service
      quoteUsd: 0,   // Will be filled by price service
      logo_url: nonEvmBalance.logo_url,
      contract_address: undefined,
      contract_decimals: nonEvmBalance.decimals,
      contract_name: nonEvmBalance.symbol,
      chainId: nonEvmBalance.chainId,
      networkName: nonEvmBalance.networkName
    };
  }
}


