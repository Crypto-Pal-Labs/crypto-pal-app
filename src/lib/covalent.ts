// src/lib/covalent.ts
import { Platform } from "react-native";

const COVALENT_KEY =
  process.env.EXPO_PUBLIC_COVALENT_KEY ||
  process.env.COVALENT_KEY ||
  "";

const DEBUG = String(process.env.EXPO_PUBLIC_DEBUG_COVALENT || "0") === "1";

const b64 = (str: string) =>
  (Platform.OS === "web"
    ? btoa(str)
    // @ts-ignore Buffer is polyfilled in RN
    : Buffer.from(str, "utf8").toString("base64")) as string;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

type FetchOpts = {
  signal?: AbortSignal;
  maxRetries?: number;   // default 3
  baseDelayMs?: number;  // default 1200
};

export class CovalentError extends Error {
  status: number;
  body?: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Robust Covalent GET with:
 *  - Basic auth
 *  - Retry on 429 with backoff
 *  - Throws when payload has error=true or data missing
 *  - **Compat shim**: if payload has data.items (v2) but caller expects data.balances, we alias it.
 */
export async function covalentGet(url: string, opts: FetchOpts = {}) {
  if (!COVALENT_KEY) {
    throw new Error("Missing EXPO_PUBLIC_COVALENT_KEY (or COVALENT_KEY).");
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${b64(`${COVALENT_KEY}:`)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1200;
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      if (DEBUG) console.log("[COVALENT] GET", url, "attempt", attempt);
      const res = await fetch(url, { headers, signal: opts.signal });

      // parse body (even on non-OK) for diagnostics
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // ignore
      }

      if (res.status === 429) {
        if (attempt > maxRetries) throw new CovalentError(429, "Covalent rate limited (max retries exceeded)", json);
        const retryAfter = Number(res.headers.get("retry-after") || "0");
        const delay =
          retryAfter > 0
            ? retryAfter * 1000
            : Math.min(8000, baseDelay * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 400);
        if (DEBUG) console.log("[COVALENT] 429 backoff", delay, "ms");
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        const errMsg = String(json?.error_message || json?.message || `Covalent error ${res.status}`);
        const errCode = Number(json?.error_code || 0);
        if (res.status === 501 || errCode === 501 || /not supported/i.test(errMsg)) {
          throw new CovalentError(501, "Covalent: chain not supported (501)", json);
        }
        throw new CovalentError(res.status, errMsg, json);
      }

      // OK 200—but Covalent may still embed errors
      if (json?.error === true) {
        const errCode = Number(json?.error_code || 0);
        const errMsg = String(json?.error_message || "Covalent payload error");
        if (errCode === 429) throw new CovalentError(429, "Covalent rate limited (payload)", json);
        if (errCode === 501 || /not supported/i.test(errMsg)) {
          throw new CovalentError(501, "Covalent: chain not supported (payload 501)", json);
        }
        throw new CovalentError(200, errMsg, json);
      }

      if (!json || json.data == null) {
        throw new CovalentError(200, "Covalent response missing data", json);
      }

      // ---- COMPAT SHIM ----
      // Some endpoints (balances_v2) return data.items; some older code expects data.balances.
      if (json?.data && Array.isArray(json.data.items) && json.data.balances === undefined) {
        json.data.balances = json.data.items;
      }
      // Also normalize common casing pitfalls
      if (json?.data && Array.isArray(json.data.Balances) && json.data.balances === undefined) {
        json.data.balances = json.data.Balances;
      }
      // ---------------------

      if (DEBUG) {
        const len = JSON.stringify(json)?.length ?? 0;
        console.log("[COVALENT] 200 OK len", len);
      }
      return json;
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      if (attempt <= maxRetries && (e?.status === undefined || e?.status === 429)) {
        const delay = Math.min(8000, baseDelay * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 400);
        if (DEBUG) console.log("[COVALENT] retry in", delay, "ms");
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
}
