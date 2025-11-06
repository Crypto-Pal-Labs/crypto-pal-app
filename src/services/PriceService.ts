// src/services/PriceService.ts
// Centralized price service with proper rate limiting and caching

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PriceEntry {
  usd: number;
  local: number;
}

export interface PriceData {
  [symbol: string]: PriceEntry;
}

// Configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const REQUEST_COOLDOWN = 60 * 1000; // 60 seconds between requests (increased for better rate limiting)
const MAX_RETRIES = 3; // Maximum retries per request
const RETRY_DELAY = 2000; // 2 seconds between retries
const MAX_COINGECKO_FAILURES = 2; // Switch to fallback after 2 failures

// Transak pricing integration
const TRANSAK_PRICE_CACHE_KEY = "transak_price_cache";
const TRANSAK_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes for Transak prices (more frequent updates)

interface TransakPriceData {
  [symbol: string]: {
    buyPrice: number;
    sellPrice: number;
    timestamp: number;
  };
}

// API Keys
const API_KEYS = [
  process.env.EXPO_PUBLIC_COINGECKO_API_KEY || "CG-LDY1yCcPNnvXG6vnd1TpLQe2",
  "CG-LDY1yCcPNnvXG6vnd1TpLQe2", // Hardcoded fallback
  process.env.EXPO_PUBLIC_COINGECKO_API_KEY_2 || '',
  process.env.EXPO_PUBLIC_COINGECKO_API_KEY_3 || ''
].filter(Boolean);

// CoinGecko IDs - CRITICAL: Must include ALL tokens that users can purchase through Transak
const CG_IDS: Record<string, string> = {
  ETH: "ethereum", WETH: "ethereum",
  ETC: "ethereum-classic",
  BNB: "binancecoin", WBNB: "binancecoin",
  MATIC: "polygon-ecosystem-token", // CRITICAL: Use correct ID (was "matic-network")
  WMATIC: "polygon-ecosystem-token",
  AVAX: "avalanche-2", WAVAX: "avalanche-2",
  ARB: "arbitrum",
  OP: "optimism",
  BASE: "base",
  FTM: "fantom", WFTM: "fantom",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  // Non-EVM tokens (can be purchased through Transak)
  BTC: "bitcoin",
  SOL: "solana",
  XRP: "ripple",
  XLM: "stellar",
  ADA: "cardano",
  TRX: "tron",
  DOGE: "dogecoin",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  ATOM: "cosmos",
  DOT: "polkadot",
};

// CoinPaprika IDs (fallback) - Include common tokens
const PAPRIKA_IDS: Record<string, string> = {
  ETH: "eth-ethereum", WETH: "eth-ethereum",
  ETC: "etc-ethereum-classic",
  BNB: "bnb-binance-coin", WBNB: "bnb-binance-coin",
  MATIC: "matic-polygon", WMATIC: "matic-polygon",
  AVAX: "avax-avalanche", WAVAX: "avax-avalanche",
  FTM: "ftm-fantom", WFTM: "ftm-fantom",
  USDC: "usdc-usd-coin",
  USDT: "usdt-tether",
  DAI: "dai-dai",
  BTC: "btc-bitcoin",
  SOL: "sol-solana",
  XRP: "xrp-ripple",
  ADA: "ada-cardano",
};

// CryptoCompare IDs (new fallback) - CRITICAL: Include ALL tokens
const CRYPTOCOMPARE_IDS: Record<string, string> = {
  ETH: "ETH", WETH: "ETH",
  ETC: "ETC",
  BNB: "BNB", WBNB: "BNB",
  MATIC: "MATIC", WMATIC: "MATIC",
  AVAX: "AVAX", WAVAX: "AVAX",
  ARB: "ARB",
  OP: "OP",
  BASE: "BASE",
  FTM: "FTM", WFTM: "FTM",
  USDC: "USDC",
  USDT: "USDT",
  DAI: "DAI",
  // Non-EVM tokens
  BTC: "BTC",
  SOL: "SOL",
  XRP: "XRP",
  XLM: "XLM",
  ADA: "ADA",
  TRX: "TRX",
  DOGE: "DOGE",
  LTC: "LTC",
  BCH: "BCH",
  ATOM: "ATOM",
  DOT: "DOT",
};

class PriceService {
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private lastRequestTime = 0;
  private currentKeyIndex = 0;
  private failureCount = 0;
  private coinGeckoFailureCount = 0;
  private isRequesting = false;
  private requestQueue: Array<{
    resolve: (data: PriceData) => void;
    reject: (error: Error) => void;
    symbols: string[];
    localCurrency: string;
    retryCount: number;
    lastAttempt: number;
  }> = [];

  /**
   * Get prices for symbols with caching and rate limiting
   */
  async getPrices(symbols: string[], localCurrency: string = 'USD'): Promise<PriceData> {
    const cacheKey = `${symbols.sort().join(',')}_${localCurrency}`;
    
    // CRITICAL: Normalize cached prices to uppercase keys for consistency
    const normalizeKeys = (data: PriceData): PriceData => {
      const normalized: PriceData = {};
      Object.keys(data).forEach(key => {
        normalized[key.toUpperCase()] = data[key];
      });
      return normalized;
    };
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('PriceService: Using cached prices');
      return normalizeKeys(cached.data); // CRITICAL: Normalize keys before returning
    }

    // Check AsyncStorage cache
    try {
      const stored = await AsyncStorage.getItem(`price_cache_${cacheKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && (Date.now() - parsed.timestamp) < CACHE_DURATION) {
          console.log('PriceService: Using AsyncStorage cached prices');
          this.cache.set(cacheKey, parsed);
          return normalizeKeys(parsed.data); // CRITICAL: Normalize keys before returning
        }
      }
    } catch (error) {
      console.log('PriceService: Error reading AsyncStorage cache:', error);
    }

    // If already requesting, queue this request with exponential backoff
    if (this.isRequesting) {
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ 
          resolve, 
          reject, 
          symbols, 
          localCurrency,
          retryCount: 0,
          lastAttempt: Date.now()
        });
        console.log(`PriceService: Queued request for ${symbols.join(',')} (queue size: ${this.requestQueue.length})`);
      });
    }

    // Make new request
    return this.fetchPrices(symbols, localCurrency);
  }

  /**
   * Fetch prices from API with proper rate limiting
   */
  private async fetchPrices(symbols: string[], localCurrency: string): Promise<PriceData> {
    this.isRequesting = true;
    const cacheKey = `${symbols.sort().join(',')}_${localCurrency}`;

    try {
      // Rate limiting
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < REQUEST_COOLDOWN) {
        const waitTime = REQUEST_COOLDOWN - timeSinceLastRequest;
        console.log(`PriceService: Rate limiting - waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      this.lastRequestTime = Date.now();

      // Try CoinGecko first
      let data = await this.fetchFromCoinGecko(symbols, localCurrency);
      
      // If CoinGecko fails, try CoinPaprika
      if (!data || Object.keys(data).length === 0) {
        console.log('PriceService: CoinGecko failed, trying CoinPaprika');
        data = await this.fetchFromCoinPaprika(symbols, localCurrency);
      }

      // If CoinPaprika also fails, try CryptoCompare
      if (!data || Object.keys(data).length === 0) {
        console.log('PriceService: CoinPaprika failed, trying CryptoCompare');
        data = await this.fetchFromCryptoCompare(symbols, localCurrency);
      }

      // Cache the result
      if (data && Object.keys(data).length > 0) {
        // CRITICAL: Normalize keys to uppercase before caching
        const normalizedData: PriceData = {};
        Object.keys(data).forEach(key => {
          normalizedData[key.toUpperCase()] = data[key];
        });
        
        const cacheData = { data: normalizedData, timestamp: Date.now() };
        this.cache.set(cacheKey, cacheData);
        
        // Store in AsyncStorage
        try {
          await AsyncStorage.setItem(`price_cache_${cacheKey}`, JSON.stringify(cacheData));
        } catch (error) {
          console.log('PriceService: Error storing cache:', error);
        }

        console.log('PriceService: Prices fetched and cached successfully');
        return normalizedData; // CRITICAL: Return normalized data
      }

      throw new Error('No price data available from any source');

    } catch (error) {
      console.error('PriceService: Error fetching prices:', error);
      
      // Return stale cache if available
      const staleCache = this.cache.get(cacheKey);
      if (staleCache) {
        console.log('PriceService: Returning stale cache due to error');
        return staleCache.data;
      }

      throw error;
    } finally {
      this.isRequesting = false;
      
      // Process queued requests with exponential backoff
      if (this.requestQueue.length > 0) {
        const queuedRequest = this.requestQueue.shift();
        if (queuedRequest) {
          const timeSinceLastAttempt = Date.now() - queuedRequest.lastAttempt;
          const backoffDelay = Math.min(1000 * Math.pow(2, queuedRequest.retryCount), 30000); // Max 30 seconds
          
          if (timeSinceLastAttempt >= backoffDelay) {
            console.log(`PriceService: Processing queued request (retry ${queuedRequest.retryCount})`);
            this.fetchPrices(queuedRequest.symbols, queuedRequest.localCurrency)
              .then(queuedRequest.resolve)
              .catch(queuedRequest.reject);
          } else {
            // Re-queue with increased retry count
            queuedRequest.retryCount++;
            queuedRequest.lastAttempt = Date.now();
            this.requestQueue.unshift(queuedRequest);
            console.log(`PriceService: Re-queued request with backoff delay ${backoffDelay}ms`);
          }
        }
      }
    }
  }

  /**
   * Fetch from CoinGecko API
   */
  private async fetchFromCoinGecko(symbols: string[], localCurrency: string): Promise<PriceData> {
    const ids = symbols.map(s => CG_IDS[s.toUpperCase()]).filter(Boolean);
    if (ids.length === 0) return {};

    const vs = localCurrency.toLowerCase();
    const apiKey = API_KEYS[this.currentKeyIndex % API_KEYS.length];
    
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd,${vs}&x_cg_demo_api_key=${apiKey}`;
    
    console.log(`PriceService: Fetching from CoinGecko (key ${this.currentKeyIndex}): ${symbols.join(',')}`);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'x-cg-demo-api-key': apiKey
          }
        });

        if (response.status === 429) {
          // Rate limited - try next API key
          this.currentKeyIndex = (this.currentKeyIndex + 1) % API_KEYS.length;
          this.failureCount++;
          console.log(`PriceService: Rate limited, rotating to key ${this.currentKeyIndex}`);
          
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            continue;
          }
        }

        if (!response.ok) {
          throw new Error(`CoinGecko HTTP ${response.status}`);
        }

        const data = await response.json();
        const result: PriceData = {};

        symbols.forEach(symbol => {
          const symbolUpper = symbol.toUpperCase();
          const id = CG_IDS[symbolUpper];
          if (!id) {
            console.warn(`PriceService: No CoinGecko ID found for symbol ${symbolUpper}`);
            return;
          }
          const priceData = data[id];
          if (priceData) {
            result[symbolUpper] = { // Use uppercase key for consistency
              usd: Number(priceData.usd || 0),
              local: Number(priceData[vs] || 0)
            };
            console.log(`PriceService: ✅ Price for ${symbolUpper}: $${Number(priceData.usd || 0).toFixed(2)}`);
          } else {
            console.warn(`PriceService: ⚠️ No price data returned for ${symbolUpper} (ID: ${id})`);
          }
        });

        // Reset failure count on success
        this.failureCount = 0;
        this.coinGeckoFailureCount = 0;
        console.log(`PriceService: CoinGecko success - ${Object.keys(result).length} prices`);
        return result;

      } catch (error) {
        console.log(`PriceService: CoinGecko attempt ${attempt + 1} failed:`, error);
        this.failureCount++;
        this.coinGeckoFailureCount++;
        
        // If CoinGecko has failed too many times, skip retries and go to fallback
        if (this.coinGeckoFailureCount >= MAX_COINGECKO_FAILURES) {
          console.log(`PriceService: CoinGecko failed ${this.coinGeckoFailureCount} times, skipping retries`);
          break;
        }
        
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    return {};
  }

  /**
   * Fetch from CoinPaprika API (fallback)
   */
  private async fetchFromCoinPaprika(symbols: string[], localCurrency: string): Promise<PriceData> {
    console.log(`PriceService: Fetching from CoinPaprika: ${symbols.join(',')}`);
    
    const result: PriceData = {};
    
    for (const symbol of symbols) {
      try {
        const paprikaId = PAPRIKA_IDS[symbol.toUpperCase()];
        if (!paprikaId) continue;

        const url = `https://api.coinpaprika.com/v1/tickers/${paprikaId}?quotes=USD`;
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          const data = await response.json();
          const usdPrice = Number(data.quotes?.USD?.price || 0);
          
          if (usdPrice > 0) {
            // Simple conversion for local currency (you might want to add proper exchange rates)
            const localPrice = localCurrency === 'USD' ? usdPrice : usdPrice * 0.8; // Rough conversion
            
            result[symbol] = {
              usd: usdPrice,
              local: localPrice
            };
          }
        }
      } catch (error) {
        console.log(`PriceService: CoinPaprika failed for ${symbol}:`, error);
      }
    }

    console.log(`PriceService: CoinPaprika result - ${Object.keys(result).length} prices`);
    return result;
  }

  /**
   * Fetch from CryptoCompare API (new fallback)
   */
  private async fetchFromCryptoCompare(symbols: string[], localCurrency: string): Promise<PriceData> {
    console.log(`PriceService: Fetching from CryptoCompare: ${symbols.join(',')}`);
    
    const result: PriceData = {};
    
    try {
      // CryptoCompare supports multiple symbols in one request
      const fsyms = symbols.map(s => CRYPTOCOMPARE_IDS[s.toUpperCase()]).filter(Boolean);
      if (fsyms.length === 0) return result;

      const tsyms = ['USD', localCurrency].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
      const url = `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${fsyms.join(',')}&tsyms=${tsyms.join(',')}`;
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        
        symbols.forEach(symbol => {
          const symbolUpper = symbol.toUpperCase();
          const fsym = CRYPTOCOMPARE_IDS[symbolUpper];
          if (fsym && data[fsym]) {
            const usdPrice = Number(data[fsym].USD || 0);
            const localPrice = Number(data[fsym][localCurrency] || data[fsym].USD || 0);
            
            if (usdPrice > 0) {
              result[symbolUpper] = { // Use uppercase key for consistency
                usd: usdPrice,
                local: localPrice
              };
            }
          }
        });
      }
    } catch (error) {
      console.log(`PriceService: CryptoCompare failed:`, error);
    }

    console.log(`PriceService: CryptoCompare result - ${Object.keys(result).length} prices`);
    return result;
  }

  /**
   * Get Transak prices for buy/sell consistency
   */
  async getTransakPrices(symbols: string[], localCurrency: string = 'USD'): Promise<TransakPriceData> {
    const cacheKey = `transak_${symbols.sort().join(',')}_${localCurrency}`;
    
    // Check cache first
    try {
      const cached = await AsyncStorage.getItem(`transak_cache_${cacheKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.timestamp && (Date.now() - parsed.timestamp) < TRANSAK_CACHE_DURATION) {
          console.log('PriceService: Using cached Transak prices');
          return parsed.data;
        }
      }
    } catch (error) {
      console.log('PriceService: Error reading Transak cache:', error);
    }

    // Fetch fresh Transak prices
    const transakPrices = await this.fetchTransakPrices(symbols, localCurrency);
    
    // Cache the result
    if (transakPrices && Object.keys(transakPrices).length > 0) {
      try {
        await AsyncStorage.setItem(`transak_cache_${cacheKey}`, JSON.stringify({
          data: transakPrices,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.log('PriceService: Error storing Transak cache:', error);
      }
    }

    return transakPrices;
  }

  /**
   * Fetch Transak prices (simulated - replace with actual Transak API)
   */
  private async fetchTransakPrices(symbols: string[], localCurrency: string): Promise<TransakPriceData> {
    console.log(`PriceService: Fetching Transak prices for ${symbols.join(',')}`);
    
    const result: TransakPriceData = {};
    
    try {
      // For now, we'll use market prices with a small spread for buy/sell
      // In production, you would call the actual Transak API
      const marketPrices = await this.getPrices(symbols, localCurrency);
      
      symbols.forEach(symbol => {
        const marketPrice = marketPrices[symbol];
        if (marketPrice) {
          // Add small spread for buy/sell (typically 0.5-2%)
          const spread = 0.01; // 1% spread
          result[symbol] = {
            buyPrice: marketPrice.usd * (1 + spread), // Buy price is higher
            sellPrice: marketPrice.usd * (1 - spread), // Sell price is lower
            timestamp: Date.now()
          };
        }
      });
      
      console.log(`PriceService: Transak prices fetched for ${Object.keys(result).length} symbols`);
    } catch (error) {
      console.log('PriceService: Error fetching Transak prices:', error);
    }
    
    return result;
  }

  /**
   * Get aggregated prices (market + Transak) for consistency
   */
  async getAggregatedPrices(symbols: string[], localCurrency: string = 'USD'): Promise<{
    market: PriceData;
    transak: TransakPriceData;
  }> {
    const [marketPrices, transakPrices] = await Promise.all([
      this.getPrices(symbols, localCurrency),
      this.getTransakPrices(symbols, localCurrency)
    ]);

    return {
      market: marketPrices,
      transak: transakPrices
    };
  }

  /**
   * Clear all caches
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    try {
      const keys = await AsyncStorage.getAllKeys();
      const priceKeys = keys.filter(key => key.startsWith('price_cache_'));
      await AsyncStorage.multiRemove(priceKeys);
      console.log('PriceService: Cache cleared');
    } catch (error) {
      console.log('PriceService: Error clearing cache:', error);
    }
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus(): { cacheSize: number; failureCount: number; currentKeyIndex: number } {
    return {
      cacheSize: this.cache.size,
      failureCount: this.failureCount,
      currentKeyIndex: this.currentKeyIndex
    };
  }
}

// Export singleton instance
export const priceService = new PriceService();
