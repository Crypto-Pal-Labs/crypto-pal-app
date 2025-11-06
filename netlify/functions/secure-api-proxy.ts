/**
 * CRITICAL: Secure API Proxy for Production
 * 
 * This function proxies sensitive API calls to prevent API key exposure in the client.
 * All sensitive API keys are stored as Netlify environment variables.
 */

interface ApiRequest {
  service: 'covalent' | 'coingecko' | 'transak';
  endpoint: string;
  params?: Record<string, string>;
}

export const handler = async (event: any) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const request: ApiRequest = JSON.parse(event.body || '{}');
    const { service, endpoint, params = {} } = request;

    // CRITICAL: API keys stored securely as environment variables
    const COVALENT_API_KEY = process.env.COVALENT_API_KEY;
    const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY; // Pro key if available
    const TRANSAK_API_SECRET = process.env.TRANSAK_API_SECRET;

    let response;

    switch (service) {
      case 'covalent':
        if (!COVALENT_API_KEY) {
          throw new Error('Covalent API key not configured');
        }
        
        const covalentUrl = new URL(endpoint);
        Object.entries(params).forEach(([key, value]) => {
          covalentUrl.searchParams.set(key, value);
        });

        response = await fetch(covalentUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${COVALENT_API_KEY}`,
          },
        });
        break;

      case 'coingecko':
        const coinGeckoUrl = new URL(endpoint);
        Object.entries(params).forEach(([key, value]) => {
          coinGeckoUrl.searchParams.set(key, value);
        });
        
        // Add pro API key if available (higher rate limits)
        const headers: Record<string, string> = {};
        if (COINGECKO_API_KEY) {
          headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
        }

        response = await fetch(coinGeckoUrl.toString(), { headers });
        break;

      case 'transak':
        if (!TRANSAK_API_SECRET) {
          throw new Error('Transak API secret not configured');
        }

        response = await fetch(endpoint, {
          headers: {
            'Content-Type': 'application/json',
            'api-secret': TRANSAK_API_SECRET,
          },
        });
        break;

      default:
        throw new Error(`Unsupported service: ${service}`);
    }

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Configure appropriately for production
      },
      body: JSON.stringify(data),
    };

  } catch (error: any) {
    console.error('Secure API Proxy error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
    };
  }
};




