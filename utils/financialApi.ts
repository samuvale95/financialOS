import type { Asset } from '../types';

export interface SearchResult {
  id: string;
  name: string;
  ticker: string;
  type: 'stock' | 'etf' | 'crypto' | 'bond';
  exchange?: string;
  source: 'tiingo' | 'coingecko' | 'local';
}

export interface FetchedAsset {
  name: string;
  ticker: string;
  type: Asset['type'];
  currentPrice: number;
  sparkline: number[];
  coinGeckoId?: string;
}

const ASSET_COLORS = ['#6C63FF', '#4FC3F7', '#FF9500', '#FF6B6B', '#00D68F', '#BF5AF2', '#FFD60A'];
let _colorIndex = 0;
export function nextAssetColor(): string {
  return ASSET_COLORS[(_colorIndex++) % ASSET_COLORS.length];
}

// ── Tiingo Configuration ──────────────────────────────────────────────────────
// Registrazione gratuita: https://www.tiingo.com → Dashboard → API
// Free tier: ~500 req/ora, dati EOD per azioni/ETF globali

export const TIINGO_API_KEY = 'YOUR_KEY_HERE'; // ← inserisci il tuo token Tiingo

function hasKey(): boolean {
  return TIINGO_API_KEY.length > 10 && TIINGO_API_KEY !== 'YOUR_KEY_HERE';
}

function tiingoHeaders(): Record<string, string> {
  return {
    Authorization: `Token ${TIINGO_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ── Fetch with timeout ────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
}

function tiingoAssetType(raw: string): SearchResult['type'] {
  const s = (raw ?? '').toLowerCase();
  if (s === 'etf') return 'etf';
  if (s === 'bond' || s === 'fixed income') return 'bond';
  if (s === 'mutual fund') return 'etf';
  return 'stock';
}

// ── Tiingo Search ─────────────────────────────────────────────────────────────
// Endpoint: GET /tiingo/utilities/search?query={q}&limit=10
// Ritorna un array di { ticker, name, assetType, countryCode, ... }
// Copre azioni USA + molti mercati internazionali (incluse borse europee)

export async function searchTiingo(query: string): Promise<SearchResult[]> {
  if (!query.trim() || !hasKey()) return [];
  try {
    const url = `https://api.tiingo.com/tiingo/utilities/search?query=${encodeURIComponent(query)}&limit=10`;
    const res = await fetchWithTimeout(url, { headers: tiingoHeaders() }, 8000);
    if (!res.ok) return [];
    const json = (await res.json()) as Record<string, unknown>[];
    return json
      .filter(item => item.ticker)
      .map(item => ({
        id: (item.ticker as string).toUpperCase(),
        name: (item.name as string) ?? (item.ticker as string),
        ticker: (item.ticker as string).toUpperCase(),
        type: tiingoAssetType((item.assetType as string) ?? ''),
        exchange: (item.countryCode as string | undefined),
        source: 'tiingo' as const,
      }));
  } catch {
    return [];
  }
}

// ── Tiingo Asset Fetch ────────────────────────────────────────────────────────
// Cerca nome+tipo via utilities/search, poi scarica i prezzi giornalieri
// per costruire sparkline (ultimi 7 trading day) e prezzo corrente

export async function fetchTiingoAsset(symbol: string): Promise<FetchedAsset> {
  if (!hasKey()) throw new Error('Tiingo API key non configurato');

  const ticker = symbol.toLowerCase();
  const startDate = isoDateDaysAgo(14); // 14 giorni per coprire weekend/festivi

  // Meta (nome + tipo) e prezzi in parallelo
  const [searchRes, pricesRes] = await Promise.all([
    fetchWithTimeout(
      `https://api.tiingo.com/tiingo/utilities/search?query=${encodeURIComponent(symbol)}&limit=5`,
      { headers: tiingoHeaders() },
      6000
    ).catch(() => null),
    fetchWithTimeout(
      `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker)}/prices?startDate=${startDate}`,
      { headers: tiingoHeaders() },
      10000
    ),
  ]);

  if (!pricesRes.ok) {
    throw new Error(`Tiingo ${pricesRes.status} per ${symbol}`);
  }

  // Estrai nome e tipo dal risultato di ricerca più preciso
  let name = symbol.toUpperCase();
  let type: Asset['type'] = 'stock';
  if (searchRes?.ok) {
    const results = (await searchRes.json()) as Record<string, unknown>[];
    const exact = results.find(
      r => ((r.ticker as string) ?? '').toLowerCase() === ticker
    ) ?? results[0];
    if (exact) {
      name = (exact.name as string) ?? name;
      type = tiingoAssetType((exact.assetType as string) ?? '');
    }
  }

  // Sparkline: ultimi 7 prezzi di chiusura adjusted
  const prices = (await pricesRes.json()) as Record<string, unknown>[];
  const sparkline = prices
    .map(p => (p.adjClose ?? p.close) as number)
    .filter((v): v is number => typeof v === 'number' && !isNaN(v))
    .slice(-7);

  const currentPrice = sparkline.length > 0 ? sparkline[sparkline.length - 1] : 0;

  return { name, ticker: symbol.toUpperCase(), type, currentPrice, sparkline };
}

export async function lookupTickerDirect(ticker: string): Promise<FetchedAsset | null> {
  try {
    return await fetchTiingoAsset(ticker);
  } catch {
    return null;
  }
}

/** No-op — Tiingo non richiede sessione/crumb. Mantenuto per compatibilità. */
export async function warmupYahooSession(): Promise<void> {}

// ── CoinGecko ─────────────────────────────────────────────────────────────────

export async function searchCoinGecko(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (res.status === 429 || !res.ok) return [];
    const json = await res.json();
    const coins = ((json as Record<string, unknown>)?.coins ?? []) as Record<string, unknown>[];
    return coins.slice(0, 10).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      ticker: ((c.symbol as string) ?? '').toUpperCase(),
      type: 'crypto' as const,
      source: 'coingecko' as const,
    }));
  } catch {
    return [];
  }
}

export async function fetchCoinGeckoAsset(coinId: string): Promise<FetchedAsset> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=${encodeURIComponent(coinId)}&sparkline=true&price_change_percentage=7d`;
  const res = await fetchWithTimeout(url, {}, 12000);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  const coin = (json as Record<string, unknown>[])?.[0];
  if (!coin) throw new Error('Coin not found');

  const sparkRaw = ((coin.sparkline_in_7d as Record<string, unknown>)?.price as number[]) ?? [];
  const step = Math.max(1, Math.floor(sparkRaw.length / 7));
  const sparkline = Array.from(
    { length: Math.min(7, sparkRaw.length) },
    (_, i) => sparkRaw[Math.min(i * step, sparkRaw.length - 1)]
  ).filter((v) => typeof v === 'number' && !isNaN(v));

  return {
    name: coin.name as string,
    ticker: ((coin.symbol as string) ?? '').toUpperCase(),
    type: 'crypto',
    currentPrice: (coin.current_price as number) ?? 0,
    sparkline,
    coinGeckoId: coinId,
  };
}
