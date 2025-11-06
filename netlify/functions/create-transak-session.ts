// Netlify Function: create-transak-session
// Creates a Transak sessionId using the partner access token and widgetParams
// Env vars required:
// - TRANSAK_ACCESS_TOKEN (partner access token)
// - TRANSAK_API_KEY (public API key for widget)
// - TRANSAK_ENV ("staging" or "production")
// - REFERRER_DOMAIN (e.g., cryptopal.app)
// - REDIRECT_URL (https URL to detect completion)

export const config = {
  path: "/.netlify/functions/create-transak-session",
};

type WidgetParams = Record<string, any>;

function getTransakApiBase(envVal: string | undefined): string {
  // CRITICAL: Session creation uses different endpoint than Orders API
  // Session API: https://api.transak.com/auth/public/v2/session (production)
  // Session API: https://staging-api.transak.com/auth/public/v2/session (staging)
  return envVal === 'production' ? 'https://api.transak.com' : 'https://staging-api.transak.com';
}

export default async (request: Request): Promise<Response> => {
  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const body = await request.json().catch(() => ({}));
    const widgetParams: WidgetParams = body?.widgetParams || {};
    
    // CRITICAL: For BTC purchases, DO NOT add walletAddress (EVM format)
    // Transak will reject EVM addresses for BTC purchases
    // Only add walletAddress if walletAddressesData contains only EVM addresses
    const NON_EVM_SYMBOLS = new Set(['BTC','SOL','XRP','ADA','TRX','XLM','DOGE','TON','BCH','LTC','ATOM','XMR','ALGO','DOT','KAS','XRB','NEAR','XTZ']);
    
    if (!widgetParams.walletAddress && widgetParams.walletAddressesData) {
      try {
        const addrData = typeof widgetParams.walletAddressesData === 'string' 
          ? JSON.parse(widgetParams.walletAddressesData)
          : widgetParams.walletAddressesData;
        
        // Handle nested structure: {coins: {BTC: {address: "..."}, ETH: {address: "..."}}}
        // Transak official format: {"coins": {"BTC": {"address": "..."}}}
        let coins: any;
        if (addrData.coins) {
          coins = addrData.coins; // Nested format: {coins: {BTC: {address: "..."}}}
        } else {
          coins = addrData; // Flat format (backward compatibility)
        }
        const coinKeys = Object.keys(coins || {});
        
        // Check if walletAddressesData contains non-EVM addresses (BTC, SOL, etc.)
        const hasNonEvm = coinKeys.some(coin => NON_EVM_SYMBOLS.has(coin.toUpperCase()));
        
        // CRITICAL: Only add walletAddress if we don't have non-EVM addresses
        // For BTC purchases, ALWAYS omit walletAddress - Transak will use walletAddressesData
        // If we add walletAddress (EVM format) when BTC is present, Transak rejects it
        if (!hasNonEvm) {
          // Extract ETH address from walletAddressesData as default walletAddress for EVM tokens only
          if (coins && coins.ETH) {
            widgetParams.walletAddress = typeof coins.ETH === 'string' ? coins.ETH : (coins.ETH.address || coins.ETH);
          } else if (addrData.ETH) {
            widgetParams.walletAddress = typeof addrData.ETH === 'string' ? addrData.ETH : (addrData.ETH.address || addrData.ETH);
          }
        }
        // If hasNonEvm is true, DO NOT add walletAddress - Transak will use walletAddressesData for BTC
      } catch (e) {
        // Silent fail
      }
    }
    
    // CRITICAL: Ensure disableWalletAddressForm is set to true when addresses are provided
    // This prevents Transak from showing the address input form
    if ((widgetParams.walletAddress || widgetParams.walletAddressesData) && !widgetParams.disableWalletAddressForm) {
      widgetParams.disableWalletAddressForm = true;
    }

    const accessToken = process.env.TRANSAK_ACCESS_TOKEN;
    const envVal = process.env.TRANSAK_ENV || 'staging';
    const referrerDomain = process.env.REFERRER_DOMAIN;
    const redirectUrl = process.env.REDIRECT_URL;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Missing TRANSAK_ACCESS_TOKEN' }), { status: 500 });
    }
    if (!referrerDomain) {
      return new Response(JSON.stringify({ error: 'Missing REFERRER_DOMAIN' }), { status: 500 });
    }

    // Ensure required params
    const mergedWidgetParams: WidgetParams = {
      referrerDomain,
      redirectURL: redirectUrl,
      ...widgetParams,
    };

    const apiBase = getTransakApiBase(envVal);
    const url = `${apiBase}/auth/public/v2/session`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'access-token': accessToken,
      },
      body: JSON.stringify({ widgetParams: mergedWidgetParams }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `Transak session HTTP ${res.status}`, details: text }), { status: 502 });
    }

    const json = await res.json();
    const sessionId = json?.session_id || json?.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'No sessionId returned', details: json }), { status: 502 });
    }

    return new Response(JSON.stringify({ sessionId }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), { status: 500 });
  }
};



