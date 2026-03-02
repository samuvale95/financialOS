import type { Asset } from '../types';

export interface SearchResult {
  id: string;
  name: string;
  ticker: string;
  type: 'stock' | 'etf' | 'crypto' | 'bond';
  exchange?: string;
  source: 'yahoo' | 'coingecko' | 'local';
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

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

// ── Yahoo Finance crumb session ───────────────────────────────────────────────
// How it works:
//   React Native's native HTTP client (URLSession on iOS, OkHttp on Android)
//   maintains a per-app cookie store. Cookies set by yahoo.com are automatically
//   sent to query1/query2.finance.yahoo.com requests (same domain family).
//
//   We initialize the session once, then reuse the crumb for up to 25 minutes.

let _crumb: string | null = null;
let _crumbAt = 0;
const CRUMB_TTL = 25 * 60 * 1000;

async function getYahooCrumb(): Promise<string | null> {
  if (_crumb && Date.now() - _crumbAt < CRUMB_TTL) return _crumb;

  // Attempt 1: consent endpoint sets Yahoo cookies → then /v1/test/getcrumb works
  try {
    await fetchWithTimeout('https://fc.yahoo.com', {
      headers: { 'User-Agent': UA, 'Accept': '*/*' },
    }, 5000);

    const r = await fetchWithTimeout(
      'https://query1.finance.yahoo.com/v1/test/getcrumb',
      { headers: { 'User-Agent': UA, 'Accept': '*/*' } },
      5000
    );
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t && t.length > 2 && t.length < 60 && !t.includes('<') && t !== 'Unauthorized') {
        _crumb = t;
        _crumbAt = Date.now();
        return _crumb;
      }
    }
  } catch {}

  // Attempt 2: extract crumb from Yahoo Finance page HTML
  // The crumb is embedded as "crumb":"XXXXXXXXXX" in the page's JSON data
  try {
    const r2 = await fetchWithTimeout('https://finance.yahoo.com/', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' },
    }, 8000);
    if (r2.ok) {
      const html = await r2.text();
      // Yahoo embeds the crumb in multiple places; try all patterns
      const patterns = [
        /"crumb":"([^"\\]{8,20})"/,
        /\"CrumbStore\":\{\"crumb\":\"([^"\\]+)\"\}/,
        /crumb=([A-Za-z0-9._/-]{8,20})/,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m?.[1] && !m[1].includes('\\u')) {
          _crumb = m[1];
          _crumbAt = Date.now();
          return _crumb;
        }
      }
      // Try escaped unicode crumb (Yahoo sometimes uses \\u002F for /)
      const mEsc = html.match(/"crumb":"([^"]+)"/);
      if (mEsc?.[1]) {
        try {
          const decoded = JSON.parse(`"${mEsc[1]}"`);
          if (decoded && decoded.length > 2 && decoded.length < 60) {
            _crumb = decoded;
            _crumbAt = Date.now();
            return _crumb;
          }
        } catch {}
      }
    }
  } catch {}

  // Attempt 3: getcrumb without fc.yahoo.com initialization
  // (works on some network configs where cookies persist from a previous session)
  try {
    const r3 = await fetchWithTimeout(
      'https://query2.finance.yahoo.com/v1/test/getcrumb',
      { headers: { 'User-Agent': UA, 'Accept': '*/*' } },
      5000
    );
    if (r3.ok) {
      const t = (await r3.text()).trim();
      if (t && t.length > 2 && t.length < 60 && !t.includes('<') && t !== 'Unauthorized') {
        _crumb = t;
        _crumbAt = Date.now();
        return _crumb;
      }
    }
  } catch {}

  return null;
}

/** Proactively initialize Yahoo session. Call this when entering the asset search screen. */
export async function warmupYahooSession(): Promise<void> {
  await getYahooCrumb();
}

/** Invalidate cached crumb (call if getting 401/403 errors) */
export function invalidateYahooCrumb(): void {
  _crumb = null;
  _crumbAt = 0;
}

// ── Yahoo Finance Search ──────────────────────────────────────────────────────

export async function searchYahoo(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const crumb = await getYahooCrumb();
  const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false${crumbParam}`;
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9' },
    }, 8000);

    if (res.status === 401 || res.status === 403) {
      // Crumb invalid → reset and retry once
      invalidateYahooCrumb();
      const crumb2 = await getYahooCrumb();
      if (crumb2) {
        const url2 = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&crumb=${encodeURIComponent(crumb2)}`;
        const res2 = await fetchWithTimeout(url2, {
          headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        }, 8000);
        if (res2.ok) return parseYahooSearchResponse(await res2.json());
      }
      return [];
    }

    if (!res.ok) return [];
    return parseYahooSearchResponse(await res.json());
  } catch {
    return [];
  }
}

function parseYahooSearchResponse(json: unknown): SearchResult[] {
  const data = json as Record<string, unknown>;
  // Handle both flat ({quotes:[...]}) and nested ({finance:{result:[{quotes:[...]}]}}) formats
  const quotes: Record<string, unknown>[] =
    (data?.quotes as Record<string, unknown>[]) ??
    ((data?.finance as Record<string, unknown>)?.result as Record<string, unknown>[])?.[0]?.quotes as Record<string, unknown>[] ??
    [];

  return quotes
    .filter((q) => q.symbol)
    .map((q) => {
      const qt = ((q.quoteType as string) ?? '').toUpperCase();
      let type: SearchResult['type'] = 'stock';
      if (qt === 'ETF' || qt === 'MUTUALFUND') type = 'etf';
      else if (qt === 'BOND' || qt === 'FUTURE') type = 'bond';
      return {
        id: q.symbol as string,
        name: ((q.longname ?? q.shortname ?? q.symbol) as string),
        ticker: q.symbol as string,
        type,
        exchange: q.exchDisp as string | undefined,
        source: 'yahoo' as const,
      };
    });
}

// ── Yahoo Finance Asset Fetch ─────────────────────────────────────────────────

export async function fetchYahooAsset(symbol: string): Promise<FetchedAsset> {
  const crumb = await getYahooCrumb();
  const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';

  // Try v8/chart (sparkline + price)
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=7d${crumbParam}`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }, 10000);
    if (res.ok) {
      const json = await res.json();
      const chart = (json as Record<string, unknown>)?.chart as Record<string, unknown>;
      const result = (chart?.result as Record<string, unknown>[])?.[0];
      if (result) {
        const meta = result.meta as Record<string, unknown> ?? {};
        const currentPrice = (meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0) as number;
        const closes = ((result.indicators as Record<string, unknown>)?.quote as Record<string, unknown>[])?.[0]?.close as (number | null)[] ?? [];
        const sparkline = closes.filter((v): v is number => typeof v === 'number' && !isNaN(v)).slice(-7);
        const qt = ((meta.instrumentType ?? '') as string).toUpperCase();
        let type: Asset['type'] = 'stock';
        if (qt === 'ETF' || qt === 'MUTUALFUND') type = 'etf';
        else if (qt === 'BOND') type = 'bond';
        return {
          name: (meta.longName ?? meta.shortName ?? symbol) as string,
          ticker: symbol,
          type,
          currentPrice,
          sparkline,
        };
      }
    }
  } catch {}

  // Fallback: v7/quote (price only, no sparkline)
  const url2 = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}${crumbParam}`;
  const res2 = await fetchWithTimeout(url2, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }, 10000);
  if (!res2.ok) throw new Error(`Yahoo ${res2.status} for ${symbol}`);
  const json2 = await res2.json();
  const q = ((json2 as Record<string, unknown>)?.quoteResponse as Record<string, unknown>)?.result as Record<string, unknown>[];
  const quote = q?.[0];
  if (!quote) throw new Error(`No data for ${symbol}`);
  const qt2 = ((quote.quoteType ?? '') as string).toUpperCase();
  let type2: Asset['type'] = 'stock';
  if (qt2 === 'ETF' || qt2 === 'MUTUALFUND') type2 = 'etf';
  else if (qt2 === 'BOND') type2 = 'bond';
  return {
    name: (quote.longName ?? quote.shortName ?? symbol) as string,
    ticker: symbol,
    type: type2,
    currentPrice: (quote.regularMarketPrice ?? 0) as number,
    sparkline: [],
  };
}

export async function lookupTickerDirect(ticker: string): Promise<FetchedAsset | null> {
  try {
    return await fetchYahooAsset(ticker);
  } catch {
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
