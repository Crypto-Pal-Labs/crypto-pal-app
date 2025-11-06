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

// netlify/functions/create-transak-session.ts
var create_transak_session_exports = {};
__export(create_transak_session_exports, {
  config: () => config,
  default: () => create_transak_session_default
});
module.exports = __toCommonJS(create_transak_session_exports);
var config = {
  path: "/.netlify/functions/create-transak-session"
};
function getTransakApiBase(envVal) {
  return envVal === "production" ? "https://api.transak.com" : "https://staging-api.transak.com";
}
var create_transak_session_default = async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }
    const body = await request.json().catch(() => ({}));
    const widgetParams = body?.widgetParams || {};
    const NON_EVM_SYMBOLS = /* @__PURE__ */ new Set(["BTC", "SOL", "XRP", "ADA", "TRX", "XLM", "DOGE", "TON", "BCH", "LTC", "ATOM", "XMR", "ALGO", "DOT", "KAS", "XRB", "NEAR", "XTZ"]);
    if (!widgetParams.walletAddress && widgetParams.walletAddressesData) {
      try {
        const addrData = typeof widgetParams.walletAddressesData === "string" ? JSON.parse(widgetParams.walletAddressesData) : widgetParams.walletAddressesData;
        let coins;
        if (addrData.coins) {
          coins = addrData.coins;
        } else {
          coins = addrData;
        }
        const coinKeys = Object.keys(coins || {});
        const hasNonEvm = coinKeys.some((coin) => NON_EVM_SYMBOLS.has(coin.toUpperCase()));
        if (!hasNonEvm) {
          if (coins && coins.ETH) {
            widgetParams.walletAddress = typeof coins.ETH === "string" ? coins.ETH : coins.ETH.address || coins.ETH;
          } else if (addrData.ETH) {
            widgetParams.walletAddress = typeof addrData.ETH === "string" ? addrData.ETH : addrData.ETH.address || addrData.ETH;
          }
        }
      } catch (e) {
      }
    }
    if ((widgetParams.walletAddress || widgetParams.walletAddressesData) && !widgetParams.disableWalletAddressForm) {
      widgetParams.disableWalletAddressForm = true;
    }
    const accessToken = process.env.TRANSAK_ACCESS_TOKEN;
    const envVal = process.env.TRANSAK_ENV || "staging";
    const referrerDomain = process.env.REFERRER_DOMAIN;
    const redirectUrl = process.env.REDIRECT_URL;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Missing TRANSAK_ACCESS_TOKEN" }), { status: 500 });
    }
    if (!referrerDomain) {
      return new Response(JSON.stringify({ error: "Missing REFERRER_DOMAIN" }), { status: 500 });
    }
    const mergedWidgetParams = {
      referrerDomain,
      redirectURL: redirectUrl,
      ...widgetParams
    };
    const apiBase = getTransakApiBase(envVal);
    const url = `${apiBase}/auth/public/v2/session`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "access-token": accessToken
      },
      body: JSON.stringify({ widgetParams: mergedWidgetParams })
    });
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `Transak session HTTP ${res.status}`, details: text }), { status: 502 });
    }
    const json = await res.json();
    const sessionId = json?.session_id || json?.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "No sessionId returned", details: json }), { status: 502 });
    }
    return new Response(JSON.stringify({ sessionId }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500 });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  config
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibmV0bGlmeS9mdW5jdGlvbnMvY3JlYXRlLXRyYW5zYWstc2Vzc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gTmV0bGlmeSBGdW5jdGlvbjogY3JlYXRlLXRyYW5zYWstc2Vzc2lvblxyXG4vLyBDcmVhdGVzIGEgVHJhbnNhayBzZXNzaW9uSWQgdXNpbmcgdGhlIHBhcnRuZXIgYWNjZXNzIHRva2VuIGFuZCB3aWRnZXRQYXJhbXNcclxuLy8gRW52IHZhcnMgcmVxdWlyZWQ6XHJcbi8vIC0gVFJBTlNBS19BQ0NFU1NfVE9LRU4gKHBhcnRuZXIgYWNjZXNzIHRva2VuKVxyXG4vLyAtIFRSQU5TQUtfQVBJX0tFWSAocHVibGljIEFQSSBrZXkgZm9yIHdpZGdldClcclxuLy8gLSBUUkFOU0FLX0VOViAoXCJzdGFnaW5nXCIgb3IgXCJwcm9kdWN0aW9uXCIpXHJcbi8vIC0gUkVGRVJSRVJfRE9NQUlOIChlLmcuLCBjcnlwdG9wYWwuYXBwKVxyXG4vLyAtIFJFRElSRUNUX1VSTCAoaHR0cHMgVVJMIHRvIGRldGVjdCBjb21wbGV0aW9uKVxyXG5cclxuZXhwb3J0IGNvbnN0IGNvbmZpZyA9IHtcclxuICBwYXRoOiBcIi8ubmV0bGlmeS9mdW5jdGlvbnMvY3JlYXRlLXRyYW5zYWstc2Vzc2lvblwiLFxyXG59O1xyXG5cclxudHlwZSBXaWRnZXRQYXJhbXMgPSBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG5cclxuZnVuY3Rpb24gZ2V0VHJhbnNha0FwaUJhc2UoZW52VmFsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xyXG4gIC8vIENSSVRJQ0FMOiBTZXNzaW9uIGNyZWF0aW9uIHVzZXMgZGlmZmVyZW50IGVuZHBvaW50IHRoYW4gT3JkZXJzIEFQSVxyXG4gIC8vIFNlc3Npb24gQVBJOiBodHRwczovL2FwaS50cmFuc2FrLmNvbS9hdXRoL3B1YmxpYy92Mi9zZXNzaW9uIChwcm9kdWN0aW9uKVxyXG4gIC8vIFNlc3Npb24gQVBJOiBodHRwczovL3N0YWdpbmctYXBpLnRyYW5zYWsuY29tL2F1dGgvcHVibGljL3YyL3Nlc3Npb24gKHN0YWdpbmcpXHJcbiAgcmV0dXJuIGVudlZhbCA9PT0gJ3Byb2R1Y3Rpb24nID8gJ2h0dHBzOi8vYXBpLnRyYW5zYWsuY29tJyA6ICdodHRwczovL3N0YWdpbmctYXBpLnRyYW5zYWsuY29tJztcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKHJlcXVlc3Q6IFJlcXVlc3QpOiBQcm9taXNlPFJlc3BvbnNlPiA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gJ1BPU1QnKSB7XHJcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01ldGhvZCBub3QgYWxsb3dlZCcgfSksIHsgc3RhdHVzOiA0MDUgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYm9keSA9IGF3YWl0IHJlcXVlc3QuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpO1xyXG4gICAgY29uc3Qgd2lkZ2V0UGFyYW1zOiBXaWRnZXRQYXJhbXMgPSBib2R5Py53aWRnZXRQYXJhbXMgfHwge307XHJcbiAgICBcclxuICAgIC8vIENSSVRJQ0FMOiBGb3IgQlRDIHB1cmNoYXNlcywgRE8gTk9UIGFkZCB3YWxsZXRBZGRyZXNzIChFVk0gZm9ybWF0KVxyXG4gICAgLy8gVHJhbnNhayB3aWxsIHJlamVjdCBFVk0gYWRkcmVzc2VzIGZvciBCVEMgcHVyY2hhc2VzXHJcbiAgICAvLyBPbmx5IGFkZCB3YWxsZXRBZGRyZXNzIGlmIHdhbGxldEFkZHJlc3Nlc0RhdGEgY29udGFpbnMgb25seSBFVk0gYWRkcmVzc2VzXHJcbiAgICBjb25zdCBOT05fRVZNX1NZTUJPTFMgPSBuZXcgU2V0KFsnQlRDJywnU09MJywnWFJQJywnQURBJywnVFJYJywnWExNJywnRE9HRScsJ1RPTicsJ0JDSCcsJ0xUQycsJ0FUT00nLCdYTVInLCdBTEdPJywnRE9UJywnS0FTJywnWFJCJywnTkVBUicsJ1hUWiddKTtcclxuICAgIFxyXG4gICAgaWYgKCF3aWRnZXRQYXJhbXMud2FsbGV0QWRkcmVzcyAmJiB3aWRnZXRQYXJhbXMud2FsbGV0QWRkcmVzc2VzRGF0YSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGFkZHJEYXRhID0gdHlwZW9mIHdpZGdldFBhcmFtcy53YWxsZXRBZGRyZXNzZXNEYXRhID09PSAnc3RyaW5nJyBcclxuICAgICAgICAgID8gSlNPTi5wYXJzZSh3aWRnZXRQYXJhbXMud2FsbGV0QWRkcmVzc2VzRGF0YSlcclxuICAgICAgICAgIDogd2lkZ2V0UGFyYW1zLndhbGxldEFkZHJlc3Nlc0RhdGE7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSGFuZGxlIG5lc3RlZCBzdHJ1Y3R1cmU6IHtjb2luczoge0JUQzoge2FkZHJlc3M6IFwiLi4uXCJ9LCBFVEg6IHthZGRyZXNzOiBcIi4uLlwifX19XHJcbiAgICAgICAgLy8gVHJhbnNhayBvZmZpY2lhbCBmb3JtYXQ6IHtcImNvaW5zXCI6IHtcIkJUQ1wiOiB7XCJhZGRyZXNzXCI6IFwiLi4uXCJ9fX1cclxuICAgICAgICBsZXQgY29pbnM6IGFueTtcclxuICAgICAgICBpZiAoYWRkckRhdGEuY29pbnMpIHtcclxuICAgICAgICAgIGNvaW5zID0gYWRkckRhdGEuY29pbnM7IC8vIE5lc3RlZCBmb3JtYXQ6IHtjb2luczoge0JUQzoge2FkZHJlc3M6IFwiLi4uXCJ9fX1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29pbnMgPSBhZGRyRGF0YTsgLy8gRmxhdCBmb3JtYXQgKGJhY2t3YXJkIGNvbXBhdGliaWxpdHkpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGNvaW5LZXlzID0gT2JqZWN0LmtleXMoY29pbnMgfHwge30pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIGlmIHdhbGxldEFkZHJlc3Nlc0RhdGEgY29udGFpbnMgbm9uLUVWTSBhZGRyZXNzZXMgKEJUQywgU09MLCBldGMuKVxyXG4gICAgICAgIGNvbnN0IGhhc05vbkV2bSA9IGNvaW5LZXlzLnNvbWUoY29pbiA9PiBOT05fRVZNX1NZTUJPTFMuaGFzKGNvaW4udG9VcHBlckNhc2UoKSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENSSVRJQ0FMOiBPbmx5IGFkZCB3YWxsZXRBZGRyZXNzIGlmIHdlIGRvbid0IGhhdmUgbm9uLUVWTSBhZGRyZXNzZXNcclxuICAgICAgICAvLyBGb3IgQlRDIHB1cmNoYXNlcywgQUxXQVlTIG9taXQgd2FsbGV0QWRkcmVzcyAtIFRyYW5zYWsgd2lsbCB1c2Ugd2FsbGV0QWRkcmVzc2VzRGF0YVxyXG4gICAgICAgIC8vIElmIHdlIGFkZCB3YWxsZXRBZGRyZXNzIChFVk0gZm9ybWF0KSB3aGVuIEJUQyBpcyBwcmVzZW50LCBUcmFuc2FrIHJlamVjdHMgaXRcclxuICAgICAgICBpZiAoIWhhc05vbkV2bSkge1xyXG4gICAgICAgICAgLy8gRXh0cmFjdCBFVEggYWRkcmVzcyBmcm9tIHdhbGxldEFkZHJlc3Nlc0RhdGEgYXMgZGVmYXVsdCB3YWxsZXRBZGRyZXNzIGZvciBFVk0gdG9rZW5zIG9ubHlcclxuICAgICAgICAgIGlmIChjb2lucyAmJiBjb2lucy5FVEgpIHtcclxuICAgICAgICAgICAgd2lkZ2V0UGFyYW1zLndhbGxldEFkZHJlc3MgPSB0eXBlb2YgY29pbnMuRVRIID09PSAnc3RyaW5nJyA/IGNvaW5zLkVUSCA6IChjb2lucy5FVEguYWRkcmVzcyB8fCBjb2lucy5FVEgpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChhZGRyRGF0YS5FVEgpIHtcclxuICAgICAgICAgICAgd2lkZ2V0UGFyYW1zLndhbGxldEFkZHJlc3MgPSB0eXBlb2YgYWRkckRhdGEuRVRIID09PSAnc3RyaW5nJyA/IGFkZHJEYXRhLkVUSCA6IChhZGRyRGF0YS5FVEguYWRkcmVzcyB8fCBhZGRyRGF0YS5FVEgpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBJZiBoYXNOb25Fdm0gaXMgdHJ1ZSwgRE8gTk9UIGFkZCB3YWxsZXRBZGRyZXNzIC0gVHJhbnNhayB3aWxsIHVzZSB3YWxsZXRBZGRyZXNzZXNEYXRhIGZvciBCVENcclxuICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIC8vIFNpbGVudCBmYWlsXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gQ1JJVElDQUw6IEVuc3VyZSBkaXNhYmxlV2FsbGV0QWRkcmVzc0Zvcm0gaXMgc2V0IHRvIHRydWUgd2hlbiBhZGRyZXNzZXMgYXJlIHByb3ZpZGVkXHJcbiAgICAvLyBUaGlzIHByZXZlbnRzIFRyYW5zYWsgZnJvbSBzaG93aW5nIHRoZSBhZGRyZXNzIGlucHV0IGZvcm1cclxuICAgIGlmICgod2lkZ2V0UGFyYW1zLndhbGxldEFkZHJlc3MgfHwgd2lkZ2V0UGFyYW1zLndhbGxldEFkZHJlc3Nlc0RhdGEpICYmICF3aWRnZXRQYXJhbXMuZGlzYWJsZVdhbGxldEFkZHJlc3NGb3JtKSB7XHJcbiAgICAgIHdpZGdldFBhcmFtcy5kaXNhYmxlV2FsbGV0QWRkcmVzc0Zvcm0gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGFjY2Vzc1Rva2VuID0gcHJvY2Vzcy5lbnYuVFJBTlNBS19BQ0NFU1NfVE9LRU47XHJcbiAgICBjb25zdCBlbnZWYWwgPSBwcm9jZXNzLmVudi5UUkFOU0FLX0VOViB8fCAnc3RhZ2luZyc7XHJcbiAgICBjb25zdCByZWZlcnJlckRvbWFpbiA9IHByb2Nlc3MuZW52LlJFRkVSUkVSX0RPTUFJTjtcclxuICAgIGNvbnN0IHJlZGlyZWN0VXJsID0gcHJvY2Vzcy5lbnYuUkVESVJFQ1RfVVJMO1xyXG5cclxuICAgIGlmICghYWNjZXNzVG9rZW4pIHtcclxuICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWlzc2luZyBUUkFOU0FLX0FDQ0VTU19UT0tFTicgfSksIHsgc3RhdHVzOiA1MDAgfSk7XHJcbiAgICB9XHJcbiAgICBpZiAoIXJlZmVycmVyRG9tYWluKSB7XHJcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01pc3NpbmcgUkVGRVJSRVJfRE9NQUlOJyB9KSwgeyBzdGF0dXM6IDUwMCB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFbnN1cmUgcmVxdWlyZWQgcGFyYW1zXHJcbiAgICBjb25zdCBtZXJnZWRXaWRnZXRQYXJhbXM6IFdpZGdldFBhcmFtcyA9IHtcclxuICAgICAgcmVmZXJyZXJEb21haW4sXHJcbiAgICAgIHJlZGlyZWN0VVJMOiByZWRpcmVjdFVybCxcclxuICAgICAgLi4ud2lkZ2V0UGFyYW1zLFxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBhcGlCYXNlID0gZ2V0VHJhbnNha0FwaUJhc2UoZW52VmFsKTtcclxuICAgIGNvbnN0IHVybCA9IGAke2FwaUJhc2V9L2F1dGgvcHVibGljL3YyL3Nlc3Npb25gO1xyXG5cclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHVybCwge1xyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdhY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgICAnYWNjZXNzLXRva2VuJzogYWNjZXNzVG9rZW4sXHJcbiAgICAgIH0sXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgd2lkZ2V0UGFyYW1zOiBtZXJnZWRXaWRnZXRQYXJhbXMgfSksXHJcbiAgICB9KTtcclxuXHJcbiAgICBpZiAoIXJlcy5vaykge1xyXG4gICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzLnRleHQoKTtcclxuICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBgVHJhbnNhayBzZXNzaW9uIEhUVFAgJHtyZXMuc3RhdHVzfWAsIGRldGFpbHM6IHRleHQgfSksIHsgc3RhdHVzOiA1MDIgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QganNvbiA9IGF3YWl0IHJlcy5qc29uKCk7XHJcbiAgICBjb25zdCBzZXNzaW9uSWQgPSBqc29uPy5zZXNzaW9uX2lkIHx8IGpzb24/LnNlc3Npb25JZDtcclxuICAgIGlmICghc2Vzc2lvbklkKSB7XHJcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ05vIHNlc3Npb25JZCByZXR1cm5lZCcsIGRldGFpbHM6IGpzb24gfSksIHsgc3RhdHVzOiA1MDIgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25JZCB9KSwgeyBzdGF0dXM6IDIwMCwgaGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0gfSk7XHJcbiAgfSBjYXRjaCAoZTogYW55KSB7XHJcbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IGU/Lm1lc3NhZ2UgfHwgJ1Vua25vd24gZXJyb3InIH0pLCB7IHN0YXR1czogNTAwIH0pO1xyXG4gIH1cclxufTtcclxuXHJcblxyXG5cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFTTyxJQUFNLFNBQVM7QUFBQSxFQUNwQixNQUFNO0FBQ1I7QUFJQSxTQUFTLGtCQUFrQixRQUFvQztBQUk3RCxTQUFPLFdBQVcsZUFBZSw0QkFBNEI7QUFDL0Q7QUFFQSxJQUFPLGlDQUFRLE9BQU8sWUFBd0M7QUFDNUQsTUFBSTtBQUNGLFFBQUksUUFBUSxXQUFXLFFBQVE7QUFDN0IsYUFBTyxJQUFJLFNBQVMsS0FBSyxVQUFVLEVBQUUsT0FBTyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxJQUN0RjtBQUVB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
