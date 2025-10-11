import Constants from "expo-constants";

const EXTRA = Constants.expoConfig?.extra || {};
const AUTH_B64: string = EXTRA.COVALENT_AUTH_B64 || "";
const HAS_AUTH = typeof AUTH_B64 === 'string' && AUTH_B64.length > 10;

export async function covalentGet(url: string, init: RequestInit = {}) {
  if (!HAS_AUTH) {
    console.log("[COVALENT_DEBUG] Missing AUTH_B64 in bundle");
  }
  // IMPORTANT: url MUST NOT include ?key=...
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