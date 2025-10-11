// src/lib/covalent.ts
import { getExtra } from "../config/extra";

const EXTRA = getExtra();
const AUTH_B64: string = EXTRA?.COVALENT_AUTH_B64 || "";
const HAS_AUTH = typeof AUTH_B64 === "string" && AUTH_B64.length > 10;

/**
 * Always use header auth. Never append ?key= to the URL.
 */
export async function covalentGet(url: string, init: RequestInit = {}) {
  if (!HAS_AUTH) {
    // If this prints in release, your EAS env didn’t inject for this profile.
    console.log("[COVALENT_DEBUG] Missing AUTH_B64 in bundle");
  }

  // Minimal diagnostics you can see in logcat; safe to keep for now.
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
