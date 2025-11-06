/**
 * Transak Order Service
 * Fetches complete order details from Transak API
 */

// CRITICAL: Use environment-aware Transak configuration
const getTransakEnvConfig = () => {
  // Check if we're in production build
  const isProduction = process.env.EXPO_PUBLIC_TRANSAK_ENV === 'PRODUCTION' || 
                        (typeof __DEV__ !== 'undefined' && !__DEV__) ||
                        process.env.EAS_BUILD === 'true';
  
  // Allow override via environment variable
  const envOverride = process.env.EXPO_PUBLIC_TRANSAK_ENV?.toUpperCase();
  const useProduction = envOverride === 'PRODUCTION' || (isProduction && envOverride !== 'STAGING');
  
  return {
    apiKey: process.env.EXPO_PUBLIC_TRANSAK_API_KEY || '49362815-1fc8-4dde-ab46-72b51a21aeb3', // Default to staging key
    env: useProduction ? 'PRODUCTION' : 'STAGING',
    baseUrl: useProduction 
      ? 'https://api.transak.com'
      : 'https://api-stg-partners.transak.com',
    isStaging: !useProduction,
  };
};

const TRANSAK_CONFIG = getTransakEnvConfig();
const TRANSAK_API_KEY = TRANSAK_CONFIG.apiKey;
const TRANSAK_ENV = TRANSAK_CONFIG.env;
const TRANSAK_BASE_URL = TRANSAK_CONFIG.baseUrl;

// CRITICAL: Use Netlify function to proxy API calls and avoid CORS issues
const getNetlifyFunctionUrl = () => {
  // Check if we're in development mode (React Native way)
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  
  if (isDev) {
    // In development, try to use local Netlify dev server
    // CRITICAL: For Expo Go on phone, use computer's IP address, not localhost
    // Set EXPO_PUBLIC_NETLIFY_DEV_IP to your computer's IP (e.g., 192.168.1.100)
    // Or leave it as 'localhost' if testing on emulator/same device
    const devIp = (process.env as any)?.EXPO_PUBLIC_NETLIFY_DEV_IP || 'localhost';
    return {
      primary: `http://${devIp}:8888/.netlify/functions/fetch-transak-order`,
      fallback: `http://${devIp}:8888/.netlify/functions/fetch-transak-order`
    };
  }
  // In production, use deployed Netlify function (if available)
  // CRITICAL: Netlify is OPTIONAL - app works without it using network inference
  // If Netlify isn't deployed, the function will fail gracefully and fall back to direct API
  // Network inference in TransactionStore will provide tokenSymbol when API fails
  const netlifyUrl = process.env.EXPO_PUBLIC_NETLIFY_FUNCTION_URL || 'https://cryptopal.app/.netlify/functions/fetch-transak-order';
  return {
    primary: netlifyUrl,
    fallback: netlifyUrl
  };
};

export interface TransakOrderDetails {
  id: string;
  status: string;
  cryptoCurrency: string;
  fiatCurrency: string;
  cryptoAmount: string;
  fiatAmount: string;
  paymentMethod: string;
  walletAddress: string;
  transactionHash?: string;
  network: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Fetch order details from Transak API
 * CRITICAL: Uses Transak Partners API with proper authentication and error handling
 */
export async function fetchTransakOrder(orderId: string): Promise<TransakOrderDetails | null> {
  try {
    if (!orderId || orderId.trim() === '') {
      console.warn('TransakOrderService: No orderId provided');
      return null;
    }

    // CRITICAL: Use Netlify function to proxy API call and avoid CORS issues
    // Fallback to direct API call if Netlify function fails
    const urls = getNetlifyFunctionUrl();
    const netlifyUrlPrimary = `${urls.primary}?orderId=${encodeURIComponent(orderId)}`;
    const netlifyUrlFallback = `${urls.fallback}?orderId=${encodeURIComponent(orderId)}`;
    const directApiUrl = `${TRANSAK_BASE_URL}/api/v2/orders/${orderId}`;
    
    console.log('TransakOrderService: Fetching order via Netlify function:', { 
      orderId,
      env: TRANSAK_ENV,
      baseUrl: TRANSAK_BASE_URL,
      netlifyUrls: getNetlifyFunctionUrl()
    });
    
    // CRITICAL: Add timeout to prevent hanging requests
    // Reduced timeout to 10 seconds - transactions should save immediately, API can update later
    // This prevents blocking transaction completion while still allowing API to fetch data
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;
    
    // CRITICAL: Only set timeout if controller hasn't been aborted yet
    const setupTimeout = () => {
      if (!controller.signal.aborted && !timeoutId) {
        timeoutId = setTimeout(() => {
          if (!controller.signal.aborted) {
            console.warn('TransakOrderService: Request timeout after 10 seconds');
            controller.abort();
          }
        }, 10000); // 10 second timeout (reduced from 45s - transactions save immediately, API updates later)
      }
    };
    
    setupTimeout();
    
    try {
      // Try Netlify function first (avoids CORS) - try both primary and fallback paths
      let response: Response;
      let lastError: any = null;
      
      // Try primary Netlify function path
      try {
        // CRITICAL: Don't pass abort signal if already aborted (prevents "Aborted" error)
        const fetchOptions: RequestInit = {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        };
        
        // Only add signal if controller hasn't been aborted
        if (!controller.signal.aborted) {
          fetchOptions.signal = controller.signal;
        }
        
        response = await fetch(netlifyUrlPrimary, fetchOptions);
        
        // If primary returns 404, try fallback path
        if (response.status === 404 && urls.fallback !== urls.primary) {
          console.warn('TransakOrderService: Primary Netlify function 404, trying fallback path...');
          const fallbackOptions: RequestInit = {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          };
          
          if (!controller.signal.aborted) {
            fallbackOptions.signal = controller.signal;
          }
          
          response = await fetch(netlifyUrlFallback, fallbackOptions);
        }
        
        // If Netlify function returns error, check status and try direct API as fallback
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.warn('TransakOrderService: Netlify function error:', {
            status: response.status,
            statusText: response.statusText,
            errorText: errorText.substring(0, 200),
            orderId
          });
          
          // For 5xx errors (server errors), try direct API as fallback
          // For 4xx errors (client errors like 404, 401, 403), also try direct API (might be deployment issue)
          if (response.status >= 400) {
            console.warn('TransakOrderService: Netlify function returned error, trying direct API...');
            throw new Error('Netlify function error, trying fallback');
          }
        }
      } catch (netlifyError: any) {
        lastError = netlifyError;
        
        // Fallback to direct API call if Netlify function unavailable
        // CRITICAL: Don't abort on first failure - try direct API
        if (netlifyError.message?.includes('Netlify function error') || 
            netlifyError.message?.includes('Network request failed') ||
            netlifyError.name === 'AbortError') {
          console.warn('TransakOrderService: Netlify function unavailable, trying direct API (may have CORS issues)');
          
          // CRITICAL: Create new AbortController for direct API to prevent premature abort
          // React Native may abort Netlify request but direct API might work
          const directApiController = new AbortController();
          const directApiTimeout = setTimeout(() => {
            if (!directApiController.signal.aborted) {
              console.warn('TransakOrderService: Direct API timeout after 10 seconds');
              directApiController.abort();
            }
          }, 10000); // 10 second timeout (reduced from 45s)
          
          try {
            // CRITICAL: Transak Partners API requires apiKey as query parameter OR header
            // Try both formats for maximum compatibility
            const apiUrlWithKey = `${directApiUrl}${directApiUrl.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(TRANSAK_API_KEY)}`;
            response = await fetch(apiUrlWithKey, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                // CRITICAL: Also send as header for API compatibility
                'apiKey': TRANSAK_API_KEY,
              },
              signal: directApiController.signal,
            });
            
            clearTimeout(directApiTimeout);
          } catch (directApiError: any) {
            clearTimeout(directApiTimeout);
            // If direct API also fails, log as warning (not error) - this is expected when Netlify isn't running
            // The fallback mechanism (network inference) will handle this gracefully
            console.warn('TransakOrderService: Both Netlify function and direct API failed (expected if Netlify is not running):', {
              orderId,
              netlifyError: {
                message: netlifyError.message || netlifyError,
                name: netlifyError.name,
                code: (netlifyError as any).code,
                cause: (netlifyError as any).cause,
              },
              directApiError: {
                message: directApiError.message || directApiError,
                name: directApiError.name,
                code: (directApiError as any).code,
                cause: (directApiError as any).cause,
              },
              netlifyUrl: netlifyUrlPrimary,
              directApiUrl: directApiUrl,
              env: TRANSAK_ENV,
              baseUrl: TRANSAK_BASE_URL,
              note: 'This may be a network issue, CORS issue, or API unavailable. Transaction will be saved with URL-parsed data and retried later.',
              troubleshooting: [
                '1. Verify Netlify function is deployed: https://cryptopal.app/.netlify/functions/fetch-transak-order',
                '2. Check Netlify environment variables: TRANSAK_API_KEY, TRANSAK_ENV',
                '3. Verify Transak API endpoint is accessible',
                '4. Check network connectivity from device'
              ]
            });
            if (timeoutId) clearTimeout(timeoutId);
            return null;
          }
        } else {
          throw netlifyError;
        }
      }

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.warn(`TransakOrderService: API error ${response.status} ${response.statusText}`, {
          orderId,
          errorText: errorText.substring(0, 300),
          note: 'If 401/403, check API key. If 404, order may not exist yet or endpoint may be wrong'
        });
        return null;
      }

      const data = await response.json();
      
      // CRITICAL: Netlify function returns direct order object, not wrapped
      // Direct API returns wrapped in response/data
      const isFromNetlifyFunction = !data.response && !data.data && (data.id || data.orderId);
      
      console.log('TransakOrderService: API response structure:', {
        hasData: !!data,
        hasResponse: !!data?.response,
        hasDataKey: !!data?.data,
        isFromNetlifyFunction,
        topKeys: data ? Object.keys(data).slice(0, 5) : []
      });
      
      // Handle different response formats
      // Netlify function returns direct order object, Transak API wraps it
      let order = isFromNetlifyFunction ? data : (data.response || data.data || data);
      
      if (order && (order.id || order.orderId)) {
        const result = {
          id: order.id || order.orderId || orderId,
          status: order.status || order.orderStatus || 'UNKNOWN',
          cryptoCurrency: order.cryptoCurrency || order.cryptoCurrencyCode || order.crypto || '',
          fiatCurrency: order.fiatCurrency || order.fiatCurrencyCode || order.fiat || '',
          cryptoAmount: order.cryptoAmount || order.cryptoCurrencyAmount || order.cryptoValue || '0',
          fiatAmount: order.fiatAmount || order.fiatCurrencyAmount || order.fiatValue || '0',
          paymentMethod: order.paymentMethod || order.paymentType || '',
          // CRITICAL: Handle walletAddress for ALL tokens, not just EVM
          // Transak API may return walletAddresses object with multiple coin addresses
          walletAddress: order.walletAddress || 
                        order.walletAddresses?.ETH || 
                        order.walletAddresses?.BTC || 
                        order.walletAddresses?.XRP ||
                        order.walletAddresses?.SOL ||
                        order.walletAddresses?.XLM ||
                        (order.walletAddresses && Object.values(order.walletAddresses)[0] as string) ||
                        '',
          transactionHash: order.transactionHash || order.blockchainTxHash || order.txHash || '',
          network: order.network || order.cryptoCurrencyNetwork || order.blockchainNetwork || '',
          createdAt: order.createdAt || order.createdAtDate || order.created || '',
          completedAt: order.completedAt || order.completedAtDate || order.completed || '',
        };
        
        console.log('TransakOrderService: ✅ Successfully parsed order:', {
          id: result.id,
          cryptoCurrency: result.cryptoCurrency,
          cryptoAmount: result.cryptoAmount,
          fiatAmount: result.fiatAmount,
          network: result.network,
          status: result.status,
          hasHash: !!result.transactionHash
        });
        
        return result;
      }
      
      console.warn('TransakOrderService: Order data structure unexpected:', {
        hasOrder: !!order,
        orderKeys: order ? Object.keys(order).slice(0, 10) : [],
        dataKeys: data ? Object.keys(data).slice(0, 10) : []
      });
      
      return null;
    } catch (fetchError: any) {
      if (timeoutId) clearTimeout(timeoutId);
      
      // Network errors (timeout, connection refused, CORS, etc.)
      if (fetchError.name === 'AbortError') {
        console.error('TransakOrderService: Request aborted - may be timeout or React Native navigation', { 
          orderId,
          note: 'Transaction will be saved with URL-parsed data and retried later via retry mechanism'
        });
      } else if (fetchError.message?.includes('Network request failed') || 
                 fetchError.message?.includes('Failed to fetch') ||
                 fetchError.message?.includes('NetworkError') ||
                 (fetchError as any).code === 'NETWORK_ERROR') {
        console.error('TransakOrderService: Network error - API unreachable', {
          orderId,
          error: fetchError.message,
          errorName: fetchError.name,
          errorCode: (fetchError as any).code,
          netlifyUrl: netlifyUrlPrimary,
          directApiUrl: directApiUrl,
          env: TRANSAK_ENV,
          baseUrl: TRANSAK_BASE_URL,
          note: 'This is often a CORS issue, network connectivity issue, or the API endpoint requires backend proxy.',
          troubleshooting: [
            '1. Verify device has internet connectivity',
            '2. Check if Netlify function is accessible from device',
            '3. Try direct API URL (may have CORS issues)',
            '4. Verify firewall/proxy settings'
          ]
        });
      } else {
        console.error('TransakOrderService: Fetch error:', {
          orderId,
          error: fetchError.message,
          stack: fetchError.stack?.substring(0, 200)
        });
      }
      
      return null;
    }
  } catch (error: any) {
    console.error('TransakOrderService: Unexpected error:', {
      orderId,
      error: error?.message || error,
      stack: error?.stack?.substring(0, 200)
    });
    return null;
  }
}

/**
 * Fetch order details for multiple order IDs
 */
export async function fetchTransakOrders(orderIds: string[]): Promise<Map<string, TransakOrderDetails>> {
  const results = new Map<string, TransakOrderDetails>();
  
  // Fetch orders in parallel (with limit to avoid rate limiting)
  const fetchPromises = orderIds.slice(0, 10).map(async (orderId) => {
    const order = await fetchTransakOrder(orderId);
    if (order) {
      results.set(orderId, order);
    }
  });
  
  await Promise.allSettled(fetchPromises);
  return results;
}

/**
 * Fetch ALL orders for a wallet address from Transak API
 * CRITICAL: This is the solution to finding ALL user transactions, not just from blockchain
 * Transak maintains a complete history of all orders for each wallet address
 * 
 * @param walletAddress - User's wallet address (can be EVM or non-EVM)
 * @param limit - Maximum number of orders to fetch (default: 100)
 * @returns Array of order details
 */
export async function fetchAllTransakOrdersByWallet(
  walletAddress: string,
  limit: number = 100
): Promise<TransakOrderDetails[]> {
  try {
    if (!walletAddress || walletAddress.trim() === '') {
      console.warn('TransakOrderService: No wallet address provided for fetchAllTransakOrdersByWallet');
      return [];
    }

    // CRITICAL: Transak Partners API endpoint for listing orders
    // Note: Transak API may require walletAddress in query params or headers
    const listOrdersUrl = `${TRANSAK_BASE_URL}/api/v2/orders?walletAddress=${encodeURIComponent(walletAddress)}&limit=${limit}`;
    const apiUrlWithKey = `${listOrdersUrl}${listOrdersUrl.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(TRANSAK_API_KEY)}`;
    
    console.log('TransakOrderService: Fetching ALL orders for wallet:', {
      walletAddress,
      limit,
      env: TRANSAK_ENV,
      baseUrl: TRANSAK_BASE_URL
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 second timeout

    try {
      const response = await fetch(apiUrlWithKey, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'apiKey': TRANSAK_API_KEY,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.warn(`TransakOrderService: List orders API error ${response.status} ${response.statusText}`, {
          walletAddress,
          errorText: errorText.substring(0, 300),
          note: 'If 401/403, check API key. If 404, endpoint may not support wallet address filtering.'
        });
        return [];
      }

      const data = await response.json();
      
      // Handle different response formats
      const orders = data.response?.orders || data.data?.orders || data.orders || [];
      
      if (!Array.isArray(orders)) {
        console.warn('TransakOrderService: Invalid response format for list orders', { data });
        return [];
      }

      // Normalize order data to TransakOrderDetails format
      const normalizedOrders: TransakOrderDetails[] = orders.map((order: any) => {
        const isStaging = TRANSAK_ENV === 'STAGING' || TRANSAK_ENV === 'staging';
        const networkMapping = require('./TransakNetworkMapper').mapTransakNetwork(
          order.network || '',
          order.cryptoCurrency || '',
          isStaging
        );

        return {
          id: order.id || order.orderId || '',
          status: order.status || order.orderStatus || 'UNKNOWN',
          cryptoCurrency: order.cryptoCurrency || order.cryptoCurrencyCode || order.crypto || '',
          fiatCurrency: order.fiatCurrency || order.fiatCurrencyCode || order.fiat || '',
          cryptoAmount: order.cryptoAmount || order.cryptoCurrencyAmount || order.cryptoValue || '0',
          fiatAmount: order.fiatAmount || order.fiatCurrencyAmount || order.fiatValue || '0',
          paymentMethod: order.paymentMethod || order.paymentType || '',
          walletAddress: order.walletAddress || 
                         order.walletAddresses?.ETH || 
                         order.walletAddresses?.BTC || 
                         order.walletAddresses?.XRP ||
                         walletAddress,
          transactionHash: order.transactionHash || order.txHash || '',
          network: networkMapping.networkName || order.network || '',
          createdAt: order.createdAt || order.created || order.timestamp || new Date().toISOString(),
          completedAt: order.completedAt || order.completed || undefined,
        };
      });

      console.log(`TransakOrderService: ✅ Fetched ${normalizedOrders.length} orders for wallet ${walletAddress}`);
      return normalizedOrders;

    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.warn('TransakOrderService: List orders request timeout');
      } else {
        console.warn('TransakOrderService: Error fetching all orders by wallet:', {
          walletAddress,
          error: error.message || error,
          note: 'This endpoint may not be available in all Transak API versions. Falling back to individual order fetching.'
        });
      }
      
      return [];
    }
  } catch (error: any) {
    console.error('TransakOrderService: Unexpected error in fetchAllTransakOrdersByWallet:', {
      walletAddress,
      error: error.message || error,
      stack: error?.stack?.substring(0, 200)
    });
    return [];
  }
}

