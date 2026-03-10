/**
 * Cache locale per i risultati del parser AI.
 * Scopo: evitare di ri-elaborare gli stessi file durante i test.
 * I risultati vengono salvati in ai_parser_cache.json nel documentDirectory.
 */
import * as FileSystem from 'expo-file-system/legacy';
import type { ParseResult } from './parsers';

const CACHE_FILE = (FileSystem.documentDirectory ?? '') + 'ai_parser_cache.json';

interface CacheEntry {
  result: ParseResult;
  cachedAt: string;
}

type CacheStore = Record<string, CacheEntry>;

async function loadStore(): Promise<CacheStore> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_FILE);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(CACHE_FILE);
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

async function saveStore(store: CacheStore): Promise<void> {
  await FileSystem.writeAsStringAsync(CACHE_FILE, JSON.stringify(store));
}

export async function getCachedResult(fileName: string): Promise<ParseResult | null> {
  const store = await loadStore();
  return store[fileName]?.result ?? null;
}

export async function setCachedResult(fileName: string, result: ParseResult): Promise<void> {
  const store = await loadStore();
  store[fileName] = { result, cachedAt: new Date().toISOString() };
  await saveStore(store);
}

export async function clearParserCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_FILE);
    if (info.exists) await FileSystem.deleteAsync(CACHE_FILE);
  } catch { /* ignore */ }
}

export async function getCacheStats(): Promise<{ count: number; sizeKB: number }> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_FILE);
    if (!info.exists) return { count: 0, sizeKB: 0 };
    const store = await loadStore();
    const sizeKB = Math.round(('size' in info ? (info.size as number) : 0) / 1024);
    return { count: Object.keys(store).length, sizeKB };
  } catch {
    return { count: 0, sizeKB: 0 };
  }
}
