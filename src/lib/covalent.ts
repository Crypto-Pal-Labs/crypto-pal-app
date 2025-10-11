import Constants from "expo-constants";
import { Buffer } from "buffer";

const EXTRA = Constants.expoConfig?.extra || {};
const COVALENT_KEY: string = EXTRA.COVALENT_KEY || "";

function authHeader() {
  // Basic base64("cqt_...:")
  const b64 = Buffer.from(`${COVALENT_KEY}:`).toString("base64");
  return `Basic ${b64}`;
}

export async function covalentGet(url: string, init: RequestInit = {}) {
  // IMPORTANT: url MUST NOT include ?key=...
  const headers = {
    ...(init.headers || {}),
    Authorization: authHeader(),
  } as Record<string, string>;

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    console.log('Covalent error:', text); // Temp log—remove after APK fix
    throw new Error(`Covalent ${res.status}: ${text}`);
  }
  return res.json();
}