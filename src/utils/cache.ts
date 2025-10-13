// src/utils/cache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

type Envelope<T> = { value: T; expiresAt: number };

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (Date.now() > env.expiresAt) {
      AsyncStorage.removeItem(key);
      return null;
    }
    return env.value;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number) {
  const env: Envelope<T> = { value, expiresAt: Date.now() + ttlMs };
  await AsyncStorage.setItem(key, JSON.stringify(env));
}
