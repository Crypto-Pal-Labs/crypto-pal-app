// src/lib/covalent.ts
import Constants from "expo-constants";

const EXTRA = Constants.expoConfig?.extra || {};
const AUTH_B64: string = EXTRA?.COVALENT_AUTH_B64 || "";
const HAS_AUTH = typeof AUTH_B64 === "string" && AUTH_B64.length > 10;

/**
 * Centralized Covalent GET with Basic auth header.
 * IMPORTANT: Do NOT include ?key= in the URL — header auth only.
 */
export async function covalentGet(url: string, init: RequestInit = {}) {
  if (!HAS_AUTH) {
    // If this shows in logcat, the env wasn’t injected for this build/profile.
    console.log("[COVALENT_DEBUG] Missing AUTH_B64 in bundle");
  }

  // Small, safe diagnostics (doesn't print the full token):
  console.log("[COVALENT_DEBUG] b64.len", (AUTH_B64 || "").length);
  console.log("[COVALENT_DEBUG] hdr", `Basic ${String(AUTH_B64).slice(0, 8)}...`);

  const headers = {
    ...(init.headers || {}),
    Authorization: `Basic ${AUTH_B64}`,
  } as Record<string, string>;

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    console.log("[COVALENT_DEBUG] status", res.status, "len", text?.length);
    throw new Error(`Covalent ${res.status}: ${text}`);
  }
  return res.json();
}
