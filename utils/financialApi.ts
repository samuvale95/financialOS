import type { Asset } from '../types';

export interface SearchResult {
  id: string;
  name: string;
  ticker: string;
  type: 'stock' | 'etf' | 'crypto' | 'bond';
  exchange?: string;
  source: 'coingecko' | 'local';
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

// ── Yahoo Finance v8/chart ────────────────────────────────────────────────────
// Endpoint diretto, senza crumb. Funziona per azioni e ETF su qualsiasi borsa
// (SWDA.MI, VWCE.DE, AAPL, ENI.MI, ecc.) dall'HTTP client nativo di React Native.

const YF_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

function yahooAssetType(instrumentType: string): Asset['type'] {
  const s = (instrumentType ?? '').toUpperCase();
  if (s === 'ETF' || s === 'MUTUALFUND') return 'etf';
  if (s === 'BOND') return 'bond';
  return 'stock';
}

export async function lookupTickerDirect(ticker: string): Promise<FetchedAsset | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=14d`;
  console.log('[Yahoo] chart →', url);
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': YF_UA, 'Accept': 'application/json' },
    }, 10000);
    console.log('[Yahoo] status:', res.status);
    if (!res.ok) {
      console.warn('[Yahoo] errore:', await res.text().catch(() => ''));
      return null;
    }
    const json = await res.json() as Record<string, unknown>;
    const result = ((json?.chart as Record<string, unknown>)
      ?.result as Record<string, unknown>[])?.[0];
    if (!result) return null;

    const meta = (result.meta as Record<string, unknown>) ?? {};
    const currentPrice = (meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0) as number;
    const closes = (((result.indicators as Record<string, unknown>)
      ?.quote as Record<string, unknown>[])?.[0]
      ?.close as (number | null)[]) ?? [];
    const sparkline = closes
      .filter((v): v is number => typeof v === 'number' && !isNaN(v))
      .slice(-7);

    console.log('[Yahoo] price:', currentPrice, 'sparkline pts:', sparkline.length);
    return {
      name: (meta.longName ?? meta.shortName ?? ticker) as string,
      ticker: ticker.toUpperCase(),
      type: yahooAssetType((meta.instrumentType as string) ?? ''),
      currentPrice,
      sparkline,
    };
  } catch (e) {
    console.warn('[Yahoo] eccezione:', e);
    return null;
  }
}

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
