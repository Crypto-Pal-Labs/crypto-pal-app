// src/lib/covalent.ts
// SAFE Covalent wrapper:
// - Never blocks UI: returns { data: { items: [] } } on errors (rate-limit, credit, HTTP, network)
// - Adds key as query param and Basic auth (Covalent accepts both)
// - Kill switch via EXPO_PUBLIC_DISABLE_COVALENT=1
// - Backwards compat: ensures data.items/data.balances exist when possible

import { Platform } from "react-native";

const COVALENT_KEY =
  process.env.EXPO_PUBLIC_COVALENT_KEY ||
  process.env.COVALENT_KEY ||
  "";

const DISABLE =
  String(process.env.EXPO_PUBLIC_DISABLE_COVALENT || "0").trim() === "1";

const DEBUG =
  String(process.env.EXPO_PUBLIC_DEBUG_COVALENT || "0").trim() === "1";

const b64 = (str: string) =>
  (Platform.OS === "web"
    ? btoa(str)
    // @ts-ignore Buffer is polyfilled in RN
    : Buffer.from(str, "utf8").toString("base64")) as string;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export type CovalentResponse<T = any> = {
  data?: T;
  error?: string | null;
  message?: string | null;
  [k: string]: any;
};

type FetchOpts = {
  signal?: AbortSignal;
  maxRetries?: number;   // default 2 (short to avoid UI delays)
  baseDelayMs?: number;  // default 600
};

function isCreditOrRateLimit(json: any, status?: number) {
  const msg = String(json?.error_message || json?.message || "").toLowerCase();
  return (
    status === 402 || status === 429 ||
    json?.error === true ||
    /credit|rate\s*limit|payment required|unauthori(s|z)ed|quota|exceed/.test(msg)
  );
}

function normalizeDataShape(json: any): any {
  if (!json) return { data: { items: [] } };
  if (!json.data) json.data = {};
  // balances_v2 often returns data.items; some code looks for balances
  if (Array.isArray(json.data.items) && json.data.balances === undefined) {
    json.data.balances = json.data.items;
  }
  if (Array.isArray(json.data.Balances) && json.data.balances === undefined) {
    json.data.balances = json.data.Balances;
  }
  if (!Array.isArray(json.data.items) && Array.isArray(json.data.balances)) {
    json.data.items = json.data.balances;
  }
  if (!Array.isArray(json.data.items)) json.data.items = [];
  return json;
}

/**
 * SAFE covalentGet: NEVER throws for common errors. Returns { data: { items: [] }, error?: string } on failure.
 */
export async function covalentGet<T = any>(url: string, opts: FetchOpts = {}): Promise<CovalentResponse<T>> {
  // Allow hard bypass from env
  if (DISABLE) {
    if (DEBUG) console.log("[COVALENT] bypassed by EXPO_PUBLIC_DISABLE_COVALENT=1");
    return { data: { items: [] } as any, error: "disabled" };
  }

  const maxRetries = opts.maxRetries ?? 2;
  const baseDelay = opts.baseDelayMs ?? 600;

  // Build headers + URL with key
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  let finalUrl = url;
  if (COVALENT_KEY) {
    // Send both Basic auth and query param for maximum compatibility
    headers.Authorization = `Basic ${b64(`${COVALENT_KEY}:`)}`;
    finalUrl = `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(COVALENT_KEY)}`;
  }

  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      if (DEBUG) console.log("[COVALENT] GET", finalUrl, "attempt", attempt);
      const res = await fetch(finalUrl, { headers, signal: opts.signal });

      let json: any = null;
      try { json = await res.json(); } catch { json = null; }

      // HTTP failures → soft-empty
      if (!res.ok) {
        const soft: CovalentResponse = normalizeDataShape(json);
        soft.error = `covalent_http_${res.status}`;
        if (isCreditOrRateLimit(json, res.status)) return soft; // no retries; return empty immediately
        if (attempt <= maxRetries) {
          const delay = Math.min(4000, baseDelay * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 200);
          if (DEBUG) console.log("[COVALENT] http retry in", delay, "ms");
          await sleep(delay);
          continue;
        }
        return soft;
      }

      // OK body but with Covalent error flags
      if (isCreditOrRateLimit(json)) {
        const soft = normalizeDataShape(json);
        soft.error = "covalent_credit_limit";
        return soft;
      }

      const normalized = normalizeDataShape(json);
      if (DEBUG) {
        const len = JSON.stringify(normalized)?.length ?? 0;
        console.log("[COVALENT] OK len", len);
      }
      return normalized as CovalentResponse<T>;
    } catch (e: any) {
      // Network/abort → soft-empty
      if (e?.name === "AbortError") {
        return { data: { items: [] } as any, error: "covalent_abort" };
      }
      if (attempt <= maxRetries) {
        const delay = Math.min(4000, baseDelay * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 200);
        if (DEBUG) console.log("[COVALENT] net retry in", delay, "ms");
        await sleep(delay);
        continue;
      }
      return { data: { items: [] } as any, error: "covalent_network_error" };
    }
  }
}
