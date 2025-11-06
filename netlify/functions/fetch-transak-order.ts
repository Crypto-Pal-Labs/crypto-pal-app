/**
 * Netlify Function: Fetch Transak Order Details
 * Proxies Transak API calls to avoid CORS issues in React Native
 */

export const config = {
  path: "/.netlify/functions/fetch-transak-order",
};

const TRANSAK_API_KEY = process.env.TRANSAK_API_KEY || '49362815-1fc8-4dde-ab46-72b51a21aeb3';
const TRANSAK_ENV = process.env.TRANSAK_ENV || 'STAGING';
// CRITICAL: Partners API endpoints (for fetching orders)
// Production: https://api.transak.com/api/v2/orders/{orderId}
// Staging: https://api-stg-partners.transak.com/api/v2/orders/{orderId}
const TRANSAK_BASE_URL = TRANSAK_ENV === 'STAGING' || TRANSAK_ENV === 'staging'
  ? 'https://api-stg-partners.transak.com'
  : 'https://api.transak.com';

export default async (request: Request): Promise<Response> => {
  try {
    // CORS headers
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response('', { 
        status: 200,
        headers,
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }), 
        { 
          status: 405,
          headers,
        }
      );
    }

    // Extract orderId from query string
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    
    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'orderId parameter is required' }), 
        { 
          status: 400,
          headers,
        }
      );
    }

    // Fetch order from Transak API
    const apiUrl = `${TRANSAK_BASE_URL}/api/v2/orders/${orderId}`;
    
    console.log('Fetching Transak order:', { 
      orderId, 
      apiUrl,
      env: TRANSAK_ENV,
      baseUrl: TRANSAK_BASE_URL,
      hasApiKey: !!TRANSAK_API_KEY,
      apiKeyPrefix: TRANSAK_API_KEY?.substring(0, 8) + '...'
    });

    // CRITICAL: Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 second timeout

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apiKey': TRANSAK_API_KEY,
          'X-Transak-API-Key': TRANSAK_API_KEY,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Transak API error:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 200),
          apiUrl,
          env: TRANSAK_ENV
        });

        return new Response(
          JSON.stringify({ 
            error: 'Transak API error',
            status: response.status,
            statusText: response.statusText,
            details: errorText.substring(0, 200),
            apiUrl,
            env: TRANSAK_ENV
          }),
          {
            status: response.status,
            headers,
          }
        );
      }

      const data = await response.json();
    
    // Parse order data (handle different response formats)
    let order = data.response || data.data || data;
    
    if (!order || (!order.id && !order.orderId)) {
      return new Response(
        JSON.stringify({ error: 'Order not found or invalid response format' }),
        {
          status: 404,
          headers,
        }
      );
    }

    // Normalize order data
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

    console.log('Successfully fetched Transak order:', {
      id: result.id,
      cryptoCurrency: result.cryptoCurrency,
      cryptoAmount: result.cryptoAmount,
      fiatAmount: result.fiatAmount
    });

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers,
      }
    );
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Check if it's an abort (timeout) or network error
      if (fetchError.name === 'AbortError') {
        console.error('Transak API request timeout:', { orderId, apiUrl });
        return new Response(
          JSON.stringify({ 
            error: 'Request timeout',
            message: 'API request took longer than 30 seconds',
            apiUrl,
            env: TRANSAK_ENV
          }),
          {
            status: 504,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
      
      // Network errors (DNS, connection refused, etc.)
      if (fetchError.message?.includes('fetch failed') || 
          fetchError.message?.includes('NetworkError') ||
          fetchError.code === 'ENOTFOUND' ||
          fetchError.code === 'ECONNREFUSED') {
        console.error('Transak API network error:', {
          orderId,
          apiUrl,
          error: fetchError.message,
          code: fetchError.code,
          env: TRANSAK_ENV
        });
        return new Response(
          JSON.stringify({ 
            error: 'Network error',
            message: `Failed to connect to Transak API: ${fetchError.message}`,
            apiUrl,
            env: TRANSAK_ENV,
            suggestion: 'Verify API endpoint URL and network connectivity'
          }),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
      
      // Other errors
      console.error('Error fetching Transak order:', {
        orderId,
        apiUrl,
        error: fetchError.message,
        stack: fetchError.stack?.substring(0, 300)
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error',
          message: fetchError?.message || 'Unknown error',
          apiUrl,
          env: TRANSAK_ENV
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  } catch (error: any) {
    console.error('Unexpected error in fetch-transak-order:', {
      error: error?.message || 'Unknown error',
      stack: error?.stack?.substring(0, 300)
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error?.message || 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
};

