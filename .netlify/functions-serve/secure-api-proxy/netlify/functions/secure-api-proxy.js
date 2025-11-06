"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/secure-api-proxy.ts
var secure_api_proxy_exports = {};
__export(secure_api_proxy_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(secure_api_proxy_exports);
var handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }
  try {
    const request = JSON.parse(event.body || "{}");
    const { service, endpoint, params = {} } = request;
    const COVALENT_API_KEY = process.env.COVALENT_API_KEY;
    const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
    const TRANSAK_API_SECRET = process.env.TRANSAK_API_SECRET;
    let response;
    switch (service) {
      case "covalent":
        if (!COVALENT_API_KEY) {
          throw new Error("Covalent API key not configured");
        }
        const covalentUrl = new URL(endpoint);
        Object.entries(params).forEach(([key, value]) => {
          covalentUrl.searchParams.set(key, value);
        });
        response = await fetch(covalentUrl.toString(), {
          headers: {
            "Authorization": `Bearer ${COVALENT_API_KEY}`
          }
        });
        break;
      case "coingecko":
        const coinGeckoUrl = new URL(endpoint);
        Object.entries(params).forEach(([key, value]) => {
          coinGeckoUrl.searchParams.set(key, value);
        });
        const headers = {};
        if (COINGECKO_API_KEY) {
          headers["x-cg-pro-api-key"] = COINGECKO_API_KEY;
        }
        response = await fetch(coinGeckoUrl.toString(), { headers });
        break;
      case "transak":
        if (!TRANSAK_API_SECRET) {
          throw new Error("Transak API secret not configured");
        }
        response = await fetch(endpoint, {
          headers: {
            "Content-Type": "application/json",
            "api-secret": TRANSAK_API_SECRET
          }
        });
        break;
      default:
        throw new Error(`Unsupported service: ${service}`);
    }
    const data = await response.json();
    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
        // Configure appropriately for production
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Secure API Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message
      })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=secure-api-proxy.js.map
