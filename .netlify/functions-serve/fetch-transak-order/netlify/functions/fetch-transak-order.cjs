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

// netlify/functions/fetch-transak-order.ts
var fetch_transak_order_exports = {};
__export(fetch_transak_order_exports, {
  config: () => config,
  default: () => fetch_transak_order_default
});
module.exports = __toCommonJS(fetch_transak_order_exports);
var config = {
  path: "/.netlify/functions/fetch-transak-order"
};
var TRANSAK_API_KEY = process.env.TRANSAK_API_KEY || "49362815-1fc8-4dde-ab46-72b51a21aeb3";
var TRANSAK_ENV = process.env.TRANSAK_ENV || "STAGING";
var TRANSAK_BASE_URL = TRANSAK_ENV === "STAGING" || TRANSAK_ENV === "staging" ? "https://api-stg-partners.transak.com" : "https://api.transak.com";
var fetch_transak_order_default = async (request) => {
  try {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json"
    };
    if (request.method === "OPTIONS") {
      return new Response("", {
        status: 200,
        headers
      });
    }
    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers
        }
      );
    }
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");
    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "orderId parameter is required" }),
        {
          status: 400,
          headers
        }
      );
    }
    const apiUrl = `${TRANSAK_BASE_URL}/api/v2/orders/${orderId}`;
    console.log("Fetching Transak order:", {
      orderId,
      apiUrl,
      env: TRANSAK_ENV,
      baseUrl: TRANSAK_BASE_URL,
      hasApiKey: !!TRANSAK_API_KEY,
      apiKeyPrefix: TRANSAK_API_KEY?.substring(0, 8) + "..."
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 3e4);
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "apiKey": TRANSAK_API_KEY,
          "X-Transak-API-Key": TRANSAK_API_KEY,
          "Accept": "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        console.error("Transak API error:", {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 200),
          apiUrl,
          env: TRANSAK_ENV
        });
        return new Response(
          JSON.stringify({
            error: "Transak API error",
            status: response.status,
            statusText: response.statusText,
            details: errorText.substring(0, 200),
            apiUrl,
            env: TRANSAK_ENV
          }),
          {
            status: response.status,
            headers
          }
        );
      }
      const data = await response.json();
      let order = data.response || data.data || data;
      if (!order || !order.id && !order.orderId) {
        return new Response(
          JSON.stringify({ error: "Order not found or invalid response format" }),
          {
            status: 404,
            headers
          }
        );
      }
      const result = {
        id: order.id || order.orderId || orderId,
        status: order.status || order.orderStatus || "UNKNOWN",
        cryptoCurrency: order.cryptoCurrency || order.cryptoCurrencyCode || order.crypto || "",
        fiatCurrency: order.fiatCurrency || order.fiatCurrencyCode || order.fiat || "",
        cryptoAmount: order.cryptoAmount || order.cryptoCurrencyAmount || order.cryptoValue || "0",
        fiatAmount: order.fiatAmount || order.fiatCurrencyAmount || order.fiatValue || "0",
        paymentMethod: order.paymentMethod || order.paymentType || "",
        // CRITICAL: Handle walletAddress for ALL tokens, not just EVM
        // Transak API may return walletAddresses object with multiple coin addresses
        walletAddress: order.walletAddress || order.walletAddresses?.ETH || order.walletAddresses?.BTC || order.walletAddresses?.XRP || order.walletAddresses?.SOL || order.walletAddresses?.XLM || order.walletAddresses && Object.values(order.walletAddresses)[0] || "",
        transactionHash: order.transactionHash || order.blockchainTxHash || order.txHash || "",
        network: order.network || order.cryptoCurrencyNetwork || order.blockchainNetwork || "",
        createdAt: order.createdAt || order.createdAtDate || order.created || "",
        completedAt: order.completedAt || order.completedAtDate || order.completed || ""
      };
      console.log("Successfully fetched Transak order:", {
        id: result.id,
        cryptoCurrency: result.cryptoCurrency,
        cryptoAmount: result.cryptoAmount,
        fiatAmount: result.fiatAmount
      });
      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers
        }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        console.error("Transak API request timeout:", { orderId, apiUrl });
        return new Response(
          JSON.stringify({
            error: "Request timeout",
            message: "API request took longer than 30 seconds",
            apiUrl,
            env: TRANSAK_ENV
          }),
          {
            status: 504,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      if (fetchError.message?.includes("fetch failed") || fetchError.message?.includes("NetworkError") || fetchError.code === "ENOTFOUND" || fetchError.code === "ECONNREFUSED") {
        console.error("Transak API network error:", {
          orderId,
          apiUrl,
          error: fetchError.message,
          code: fetchError.code,
          env: TRANSAK_ENV
        });
        return new Response(
          JSON.stringify({
            error: "Network error",
            message: `Failed to connect to Transak API: ${fetchError.message}`,
            apiUrl,
            env: TRANSAK_ENV,
            suggestion: "Verify API endpoint URL and network connectivity"
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
      console.error("Error fetching Transak order:", {
        orderId,
        apiUrl,
        error: fetchError.message,
        stack: fetchError.stack?.substring(0, 300)
      });
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: fetchError?.message || "Unknown error",
          apiUrl,
          env: TRANSAK_ENV
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  } catch (error) {
    console.error("Unexpected error in fetch-transak-order:", {
      error: error?.message || "Unknown error",
      stack: error?.stack?.substring(0, 300)
    });
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error?.message || "Unknown error"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibmV0bGlmeS9mdW5jdGlvbnMvZmV0Y2gtdHJhbnNhay1vcmRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXHJcbiAqIE5ldGxpZnkgRnVuY3Rpb246IEZldGNoIFRyYW5zYWsgT3JkZXIgRGV0YWlsc1xyXG4gKiBQcm94aWVzIFRyYW5zYWsgQVBJIGNhbGxzIHRvIGF2b2lkIENPUlMgaXNzdWVzIGluIFJlYWN0IE5hdGl2ZVxyXG4gKi9cclxuXHJcbmV4cG9ydCBjb25zdCBjb25maWcgPSB7XHJcbiAgcGF0aDogXCIvLm5ldGxpZnkvZnVuY3Rpb25zL2ZldGNoLXRyYW5zYWstb3JkZXJcIixcclxufTtcclxuXHJcbmNvbnN0IFRSQU5TQUtfQVBJX0tFWSA9IHByb2Nlc3MuZW52LlRSQU5TQUtfQVBJX0tFWSB8fCAnNDkzNjI4MTUtMWZjOC00ZGRlLWFiNDYtNzJiNTFhMjFhZWIzJztcclxuY29uc3QgVFJBTlNBS19FTlYgPSBwcm9jZXNzLmVudi5UUkFOU0FLX0VOViB8fCAnU1RBR0lORyc7XHJcbi8vIENSSVRJQ0FMOiBQYXJ0bmVycyBBUEkgZW5kcG9pbnRzIChmb3IgZmV0Y2hpbmcgb3JkZXJzKVxyXG4vLyBQcm9kdWN0aW9uOiBodHRwczovL2FwaS50cmFuc2FrLmNvbS9hcGkvdjIvb3JkZXJzL3tvcmRlcklkfVxyXG4vLyBTdGFnaW5nOiBodHRwczovL2FwaS1zdGctcGFydG5lcnMudHJhbnNhay5jb20vYXBpL3YyL29yZGVycy97b3JkZXJJZH1cclxuY29uc3QgVFJBTlNBS19CQVNFX1VSTCA9IFRSQU5TQUtfRU5WID09PSAnU1RBR0lORycgfHwgVFJBTlNBS19FTlYgPT09ICdzdGFnaW5nJ1xyXG4gID8gJ2h0dHBzOi8vYXBpLXN0Zy1wYXJ0bmVycy50cmFuc2FrLmNvbSdcclxuICA6ICdodHRwczovL2FwaS50cmFuc2FrLmNvbSc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBhc3luYyAocmVxdWVzdDogUmVxdWVzdCk6IFByb21pc2U8UmVzcG9uc2U+ID0+IHtcclxuICB0cnkge1xyXG4gICAgLy8gQ09SUyBoZWFkZXJzXHJcbiAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUnLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsIE9QVElPTlMnLFxyXG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBIYW5kbGUgcHJlZmxpZ2h0XHJcbiAgICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICdPUFRJT05TJykge1xyXG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKCcnLCB7IFxyXG4gICAgICAgIHN0YXR1czogMjAwLFxyXG4gICAgICAgIGhlYWRlcnMsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9ubHkgYWxsb3cgR0VUIHJlcXVlc3RzXHJcbiAgICBpZiAocmVxdWVzdC5tZXRob2QgIT09ICdHRVQnKSB7XHJcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXHJcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01ldGhvZCBub3QgYWxsb3dlZCcgfSksIFxyXG4gICAgICAgIHsgXHJcbiAgICAgICAgICBzdGF0dXM6IDQwNSxcclxuICAgICAgICAgIGhlYWRlcnMsXHJcbiAgICAgICAgfVxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEV4dHJhY3Qgb3JkZXJJZCBmcm9tIHF1ZXJ5IHN0cmluZ1xyXG4gICAgY29uc3QgdXJsID0gbmV3IFVSTChyZXF1ZXN0LnVybCk7XHJcbiAgICBjb25zdCBvcmRlcklkID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ29yZGVySWQnKTtcclxuICAgIFxyXG4gICAgaWYgKCFvcmRlcklkKSB7XHJcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXHJcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ29yZGVySWQgcGFyYW1ldGVyIGlzIHJlcXVpcmVkJyB9KSwgXHJcbiAgICAgICAgeyBcclxuICAgICAgICAgIHN0YXR1czogNDAwLFxyXG4gICAgICAgICAgaGVhZGVycyxcclxuICAgICAgICB9XHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmV0Y2ggb3JkZXIgZnJvbSBUcmFuc2FrIEFQSVxyXG4gICAgY29uc3QgYXBpVXJsID0gYCR7VFJBTlNBS19CQVNFX1VSTH0vYXBpL3YyL29yZGVycy8ke29yZGVySWR9YDtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJ0ZldGNoaW5nIFRyYW5zYWsgb3JkZXI6JywgeyBcclxuICAgICAgb3JkZXJJZCwgXHJcbiAgICAgIGFwaVVybCxcclxuICAgICAgZW52OiBUUkFOU0FLX0VOVixcclxuICAgICAgYmFzZVVybDogVFJBTlNBS19CQVNFX1VSTCxcclxuICAgICAgaGFzQXBpS2V5OiAhIVRSQU5TQUtfQVBJX0tFWSxcclxuICAgICAgYXBpS2V5UHJlZml4OiBUUkFOU0FLX0FQSV9LRVk/LnN1YnN0cmluZygwLCA4KSArICcuLi4nXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDUklUSUNBTDogQWRkIHRpbWVvdXQgdG8gcHJldmVudCBoYW5naW5nIHJlcXVlc3RzXHJcbiAgICBjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xyXG4gICAgY29uc3QgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIGNvbnRyb2xsZXIuYWJvcnQoKTtcclxuICAgIH0sIDMwMDAwKTsgLy8gMzAgc2Vjb25kIHRpbWVvdXRcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGFwaVVybCwge1xyXG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICdhcGlLZXknOiBUUkFOU0FLX0FQSV9LRVksXHJcbiAgICAgICAgICAnWC1UcmFuc2FrLUFQSS1LZXknOiBUUkFOU0FLX0FQSV9LRVksXHJcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCxcclxuICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcclxuXHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCkuY2F0Y2goKCkgPT4gJ1Vua25vd24gZXJyb3InKTtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdUcmFuc2FrIEFQSSBlcnJvcjonLCB7XHJcbiAgICAgICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcclxuICAgICAgICAgIHN0YXR1c1RleHQ6IHJlc3BvbnNlLnN0YXR1c1RleHQsXHJcbiAgICAgICAgICBlcnJvclRleHQ6IGVycm9yVGV4dC5zdWJzdHJpbmcoMCwgMjAwKSxcclxuICAgICAgICAgIGFwaVVybCxcclxuICAgICAgICAgIGVudjogVFJBTlNBS19FTlZcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShcclxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHsgXHJcbiAgICAgICAgICAgIGVycm9yOiAnVHJhbnNhayBBUEkgZXJyb3InLFxyXG4gICAgICAgICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcclxuICAgICAgICAgICAgc3RhdHVzVGV4dDogcmVzcG9uc2Uuc3RhdHVzVGV4dCxcclxuICAgICAgICAgICAgZGV0YWlsczogZXJyb3JUZXh0LnN1YnN0cmluZygwLCAyMDApLFxyXG4gICAgICAgICAgICBhcGlVcmwsXHJcbiAgICAgICAgICAgIGVudjogVFJBTlNBS19FTlZcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcclxuICAgICAgICAgICAgaGVhZGVycyxcclxuICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgXHJcbiAgICAvLyBQYXJzZSBvcmRlciBkYXRhIChoYW5kbGUgZGlmZmVyZW50IHJlc3BvbnNlIGZvcm1hdHMpXHJcbiAgICBsZXQgb3JkZXIgPSBkYXRhLnJlc3BvbnNlIHx8IGRhdGEuZGF0YSB8fCBkYXRhO1xyXG4gICAgXHJcbiAgICBpZiAoIW9yZGVyIHx8ICghb3JkZXIuaWQgJiYgIW9yZGVyLm9yZGVySWQpKSB7XHJcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXHJcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ09yZGVyIG5vdCBmb3VuZCBvciBpbnZhbGlkIHJlc3BvbnNlIGZvcm1hdCcgfSksXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgc3RhdHVzOiA0MDQsXHJcbiAgICAgICAgICBoZWFkZXJzLFxyXG4gICAgICAgIH1cclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBOb3JtYWxpemUgb3JkZXIgZGF0YVxyXG4gICAgY29uc3QgcmVzdWx0ID0ge1xyXG4gICAgICBpZDogb3JkZXIuaWQgfHwgb3JkZXIub3JkZXJJZCB8fCBvcmRlcklkLFxyXG4gICAgICBzdGF0dXM6IG9yZGVyLnN0YXR1cyB8fCBvcmRlci5vcmRlclN0YXR1cyB8fCAnVU5LTk9XTicsXHJcbiAgICAgIGNyeXB0b0N1cnJlbmN5OiBvcmRlci5jcnlwdG9DdXJyZW5jeSB8fCBvcmRlci5jcnlwdG9DdXJyZW5jeUNvZGUgfHwgb3JkZXIuY3J5cHRvIHx8ICcnLFxyXG4gICAgICBmaWF0Q3VycmVuY3k6IG9yZGVyLmZpYXRDdXJyZW5jeSB8fCBvcmRlci5maWF0Q3VycmVuY3lDb2RlIHx8IG9yZGVyLmZpYXQgfHwgJycsXHJcbiAgICAgIGNyeXB0b0Ftb3VudDogb3JkZXIuY3J5cHRvQW1vdW50IHx8IG9yZGVyLmNyeXB0b0N1cnJlbmN5QW1vdW50IHx8IG9yZGVyLmNyeXB0b1ZhbHVlIHx8ICcwJyxcclxuICAgICAgZmlhdEFtb3VudDogb3JkZXIuZmlhdEFtb3VudCB8fCBvcmRlci5maWF0Q3VycmVuY3lBbW91bnQgfHwgb3JkZXIuZmlhdFZhbHVlIHx8ICcwJyxcclxuICAgICAgcGF5bWVudE1ldGhvZDogb3JkZXIucGF5bWVudE1ldGhvZCB8fCBvcmRlci5wYXltZW50VHlwZSB8fCAnJyxcclxuICAgICAgLy8gQ1JJVElDQUw6IEhhbmRsZSB3YWxsZXRBZGRyZXNzIGZvciBBTEwgdG9rZW5zLCBub3QganVzdCBFVk1cclxuICAgICAgLy8gVHJhbnNhayBBUEkgbWF5IHJldHVybiB3YWxsZXRBZGRyZXNzZXMgb2JqZWN0IHdpdGggbXVsdGlwbGUgY29pbiBhZGRyZXNzZXNcclxuICAgICAgd2FsbGV0QWRkcmVzczogb3JkZXIud2FsbGV0QWRkcmVzcyB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgb3JkZXIud2FsbGV0QWRkcmVzc2VzPy5FVEggfHwgXHJcbiAgICAgICAgICAgICAgICAgICAgIG9yZGVyLndhbGxldEFkZHJlc3Nlcz8uQlRDIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgICBvcmRlci53YWxsZXRBZGRyZXNzZXM/LlhSUCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBvcmRlci53YWxsZXRBZGRyZXNzZXM/LlNPTCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICBvcmRlci53YWxsZXRBZGRyZXNzZXM/LlhMTSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAob3JkZXIud2FsbGV0QWRkcmVzc2VzICYmIE9iamVjdC52YWx1ZXMob3JkZXIud2FsbGV0QWRkcmVzc2VzKVswXSBhcyBzdHJpbmcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICcnLFxyXG4gICAgICB0cmFuc2FjdGlvbkhhc2g6IG9yZGVyLnRyYW5zYWN0aW9uSGFzaCB8fCBvcmRlci5ibG9ja2NoYWluVHhIYXNoIHx8IG9yZGVyLnR4SGFzaCB8fCAnJyxcclxuICAgICAgbmV0d29yazogb3JkZXIubmV0d29yayB8fCBvcmRlci5jcnlwdG9DdXJyZW5jeU5ldHdvcmsgfHwgb3JkZXIuYmxvY2tjaGFpbk5ldHdvcmsgfHwgJycsXHJcbiAgICAgIGNyZWF0ZWRBdDogb3JkZXIuY3JlYXRlZEF0IHx8IG9yZGVyLmNyZWF0ZWRBdERhdGUgfHwgb3JkZXIuY3JlYXRlZCB8fCAnJyxcclxuICAgICAgY29tcGxldGVkQXQ6IG9yZGVyLmNvbXBsZXRlZEF0IHx8IG9yZGVyLmNvbXBsZXRlZEF0RGF0ZSB8fCBvcmRlci5jb21wbGV0ZWQgfHwgJycsXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnNvbGUubG9nKCdTdWNjZXNzZnVsbHkgZmV0Y2hlZCBUcmFuc2FrIG9yZGVyOicsIHtcclxuICAgICAgaWQ6IHJlc3VsdC5pZCxcclxuICAgICAgY3J5cHRvQ3VycmVuY3k6IHJlc3VsdC5jcnlwdG9DdXJyZW5jeSxcclxuICAgICAgY3J5cHRvQW1vdW50OiByZXN1bHQuY3J5cHRvQW1vdW50LFxyXG4gICAgICBmaWF0QW1vdW50OiByZXN1bHQuZmlhdEFtb3VudFxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShcclxuICAgICAgSlNPTi5zdHJpbmdpZnkocmVzdWx0KSxcclxuICAgICAge1xyXG4gICAgICAgIHN0YXR1czogMjAwLFxyXG4gICAgICAgIGhlYWRlcnMsXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgICB9IGNhdGNoIChmZXRjaEVycm9yOiBhbnkpIHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGFuIGFib3J0ICh0aW1lb3V0KSBvciBuZXR3b3JrIGVycm9yXHJcbiAgICAgIGlmIChmZXRjaEVycm9yLm5hbWUgPT09ICdBYm9ydEVycm9yJykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1RyYW5zYWsgQVBJIHJlcXVlc3QgdGltZW91dDonLCB7IG9yZGVySWQsIGFwaVVybCB9KTtcclxuICAgICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKFxyXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyBcclxuICAgICAgICAgICAgZXJyb3I6ICdSZXF1ZXN0IHRpbWVvdXQnLFxyXG4gICAgICAgICAgICBtZXNzYWdlOiAnQVBJIHJlcXVlc3QgdG9vayBsb25nZXIgdGhhbiAzMCBzZWNvbmRzJyxcclxuICAgICAgICAgICAgYXBpVXJsLFxyXG4gICAgICAgICAgICBlbnY6IFRSQU5TQUtfRU5WXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgc3RhdHVzOiA1MDQsXHJcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gTmV0d29yayBlcnJvcnMgKEROUywgY29ubmVjdGlvbiByZWZ1c2VkLCBldGMuKVxyXG4gICAgICBpZiAoZmV0Y2hFcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnZmV0Y2ggZmFpbGVkJykgfHwgXHJcbiAgICAgICAgICBmZXRjaEVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdOZXR3b3JrRXJyb3InKSB8fFxyXG4gICAgICAgICAgZmV0Y2hFcnJvci5jb2RlID09PSAnRU5PVEZPVU5EJyB8fFxyXG4gICAgICAgICAgZmV0Y2hFcnJvci5jb2RlID09PSAnRUNPTk5SRUZVU0VEJykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1RyYW5zYWsgQVBJIG5ldHdvcmsgZXJyb3I6Jywge1xyXG4gICAgICAgICAgb3JkZXJJZCxcclxuICAgICAgICAgIGFwaVVybCxcclxuICAgICAgICAgIGVycm9yOiBmZXRjaEVycm9yLm1lc3NhZ2UsXHJcbiAgICAgICAgICBjb2RlOiBmZXRjaEVycm9yLmNvZGUsXHJcbiAgICAgICAgICBlbnY6IFRSQU5TQUtfRU5WXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShcclxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHsgXHJcbiAgICAgICAgICAgIGVycm9yOiAnTmV0d29yayBlcnJvcicsXHJcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBGYWlsZWQgdG8gY29ubmVjdCB0byBUcmFuc2FrIEFQSTogJHtmZXRjaEVycm9yLm1lc3NhZ2V9YCxcclxuICAgICAgICAgICAgYXBpVXJsLFxyXG4gICAgICAgICAgICBlbnY6IFRSQU5TQUtfRU5WLFxyXG4gICAgICAgICAgICBzdWdnZXN0aW9uOiAnVmVyaWZ5IEFQSSBlbmRwb2ludCBVUkwgYW5kIG5ldHdvcmsgY29ubmVjdGl2aXR5J1xyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHN0YXR1czogNTAzLFxyXG4gICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIE90aGVyIGVycm9yc1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBUcmFuc2FrIG9yZGVyOicsIHtcclxuICAgICAgICBvcmRlcklkLFxyXG4gICAgICAgIGFwaVVybCxcclxuICAgICAgICBlcnJvcjogZmV0Y2hFcnJvci5tZXNzYWdlLFxyXG4gICAgICAgIHN0YWNrOiBmZXRjaEVycm9yLnN0YWNrPy5zdWJzdHJpbmcoMCwgMzAwKVxyXG4gICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXHJcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyBcclxuICAgICAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcclxuICAgICAgICAgIG1lc3NhZ2U6IGZldGNoRXJyb3I/Lm1lc3NhZ2UgfHwgJ1Vua25vd24gZXJyb3InLFxyXG4gICAgICAgICAgYXBpVXJsLFxyXG4gICAgICAgICAgZW52OiBUUkFOU0FLX0VOVlxyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHN0YXR1czogNTAwLFxyXG4gICAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9XHJcbiAgICAgICk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgY29uc29sZS5lcnJvcignVW5leHBlY3RlZCBlcnJvciBpbiBmZXRjaC10cmFuc2FrLW9yZGVyOicsIHtcclxuICAgICAgZXJyb3I6IGVycm9yPy5tZXNzYWdlIHx8ICdVbmtub3duIGVycm9yJyxcclxuICAgICAgc3RhY2s6IGVycm9yPy5zdGFjaz8uc3Vic3RyaW5nKDAsIDMwMClcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKFxyXG4gICAgICBKU09OLnN0cmluZ2lmeSh7IFxyXG4gICAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcclxuICAgICAgICBtZXNzYWdlOiBlcnJvcj8ubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcidcclxuICAgICAgfSksXHJcbiAgICAgIHtcclxuICAgICAgICBzdGF0dXM6IDUwMCxcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH1cclxufTtcclxuXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBS08sSUFBTSxTQUFTO0FBQUEsRUFDcEIsTUFBTTtBQUNSO0FBRUEsSUFBTSxrQkFBa0IsUUFBUSxJQUFJLG1CQUFtQjtBQUN2RCxJQUFNLGNBQWMsUUFBUSxJQUFJLGVBQWU7QUFJL0MsSUFBTSxtQkFBbUIsZ0JBQWdCLGFBQWEsZ0JBQWdCLFlBQ2xFLHlDQUNBO0FBRUosSUFBTyw4QkFBUSxPQUFPLFlBQXdDO0FBQzVELE1BQUk7QUFFRixVQUFNLFVBQWtDO0FBQUEsTUFDdEMsK0JBQStCO0FBQUEsTUFDL0IsZ0NBQWdDO0FBQUEsTUFDaEMsZ0NBQWdDO0FBQUEsTUFDaEMsZ0JBQWdCO0FBQUEsSUFDbEI7QUFHQSxRQUFJLFFBQVEsV0FBVyxXQUFXO0FBQ2hDLGFBQU8sSUFBSSxTQUFTLElBQUk7QUFBQSxRQUN0QixRQUFRO0FBQUEsUUFDUjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFHQSxRQUFJLFFBQVEsV0FBVyxPQUFPO0FBQzVCLGFBQU8sSUFBSTtBQUFB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
