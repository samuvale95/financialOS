import type { SearchResult } from '../utils/financialApi';

// Popular assets for Italian investors — searched locally, no API needed
// Tags help match common names / abbreviations
export interface LocalAsset extends Omit<SearchResult, 'source'> {
  tags: string[];
}

export const POPULAR_ASSETS: LocalAsset[] = [
  // ── ETF Azionari Globali ──────────────────────────────────────────────────
  { id: 'SWDA.MI',  name: 'iShares Core MSCI World',         ticker: 'SWDA.MI',  type: 'etf',   exchange: 'MIL',    tags: ['world','msci','ishares','swda','core'] },
  { id: 'VWCE.DE',  name: 'Vanguard FTSE All-World Acc',     ticker: 'VWCE.DE',  type: 'etf',   exchange: 'XETRA',  tags: ['vanguard','all-world','vwce','ftse','accumulo'] },
  { id: 'EUNL.DE',  name: 'iShares Core MSCI World Acc',     ticker: 'EUNL.DE',  type: 'etf',   exchange: 'XETRA',  tags: ['world','msci','ishares','eunl','core'] },
  { id: 'IUSQ.DE',  name: 'iShares MSCI ACWI',               ticker: 'IUSQ.DE',  type: 'etf',   exchange: 'XETRA',  tags: ['acwi','msci','ishares','iusq','emergenti'] },
  { id: 'VWRL.MI',  name: 'Vanguard FTSE All-World Dist',    ticker: 'VWRL.MI',  type: 'etf',   exchange: 'MIL',    tags: ['vanguard','all-world','vwrl','distribuzione'] },
  { id: 'IWDA.MI',  name: 'iShares Core MSCI World (dist)',  ticker: 'IWDA.MI',  type: 'etf',   exchange: 'MIL',    tags: ['world','msci','ishares','iwda'] },

  // ── ETF S&P 500 ───────────────────────────────────────────────────────────
  { id: 'CSSPX.MI', name: 'iShares Core S&P 500 Acc',        ticker: 'CSSPX.MI', type: 'etf',   exchange: 'MIL',    tags: ['sp500','s&p','ishares','csspx','usa'] },
  { id: 'VUAA.MI',  name: 'Vanguard S&P 500 Acc',            ticker: 'VUAA.MI',  type: 'etf',   exchange: 'MIL',    tags: ['sp500','s&p','vanguard','vuaa','usa','accumulo'] },
  { id: 'VUSA.MI',  name: 'Vanguard S&P 500 Dist',           ticker: 'VUSA.MI',  type: 'etf',   exchange: 'MIL',    tags: ['sp500','s&p','vanguard','vusa','usa','distribuzione'] },
  { id: 'SXR8.DE',  name: 'iShares Core S&P 500 (XETRA)',    ticker: 'SXR8.DE',  type: 'etf',   exchange: 'XETRA',  tags: ['sp500','s&p','ishares','sxr8','usa'] },
  { id: 'SPXS.MI',  name: 'SPDR S&P 500 UCITS ETF',          ticker: 'SPXS.MI',  type: 'etf',   exchange: 'MIL',    tags: ['sp500','s&p','spdr','usa'] },

  // ── ETF Nasdaq / Tech ─────────────────────────────────────────────────────
  { id: 'CSNDX.MI', name: 'iShares Nasdaq 100',              ticker: 'CSNDX.MI', type: 'etf',   exchange: 'MIL',    tags: ['nasdaq','tech','ishares','csndx','tecnologia'] },
  { id: 'CNDX.MI',  name: 'iShares Nasdaq 100 (dist)',       ticker: 'CNDX.MI',  type: 'etf',   exchange: 'MIL',    tags: ['nasdaq','tech','ishares','cndx'] },
  { id: 'EQQQ.MI',  name: 'Invesco Nasdaq 100 Dist',         ticker: 'EQQQ.MI',  type: 'etf',   exchange: 'MIL',    tags: ['nasdaq','qqq','invesco','eqqq'] },

  // ── ETF Emergenti ─────────────────────────────────────────────────────────
  { id: 'IS3N.DE',  name: 'iShares Core MSCI EM IMI Acc',    ticker: 'IS3N.DE',  type: 'etf',   exchange: 'XETRA',  tags: ['emergenti','em','msci','ishares','is3n','emerging'] },
  { id: 'VFEM.MI',  name: 'Vanguard FTSE Emerging Markets',  ticker: 'VFEM.MI',  type: 'etf',   exchange: 'MIL',    tags: ['emergenti','ftse','vanguard','vfem','emerging'] },

  // ── ETF Europa ────────────────────────────────────────────────────────────
  { id: 'MEUD.MI',  name: 'Lyxor Core MSCI EMU',             ticker: 'MEUD.MI',  type: 'etf',   exchange: 'MIL',    tags: ['europa','emu','eurozona','lyxor','meud'] },
  { id: 'IEMA.MI',  name: 'iShares MSCI Europe',             ticker: 'IEMA.MI',  type: 'etf',   exchange: 'MIL',    tags: ['europa','europe','msci','ishares'] },

  // ── ETF Obbligazionari ────────────────────────────────────────────────────
  { id: 'AGGH.MI',  name: 'iShares Core Global Agg Bond',    ticker: 'AGGH.MI',  type: 'etf',   exchange: 'MIL',    tags: ['bond','obbligazioni','aggregate','ishares','aggh'] },
  { id: 'VAGF.MI',  name: 'Vanguard USD Treasury Bond',      ticker: 'VAGF.MI',  type: 'etf',   exchange: 'MIL',    tags: ['bond','treasury','usa','vanguard','vagf'] },
  { id: 'IBTM.MI',  name: 'iShares € Govt Bond 7-10yr',      ticker: 'IBTM.MI',  type: 'etf',   exchange: 'MIL',    tags: ['bond','governo','euro','btp','ibtm'] },
  { id: 'XEON.MI',  name: 'Xtrackers EUR Overnight Rate',    ticker: 'XEON.MI',  type: 'etf',   exchange: 'MIL',    tags: ['monetario','estr','xeon','xtrackers','liquidità'] },
  { id: 'CSH2.MI',  name: 'iShares € Ultrashort Bond',       ticker: 'CSH2.MI',  type: 'etf',   exchange: 'MIL',    tags: ['monetario','ultrashort','ishares','csh2'] },

  // ── ETF Oro / Materie prime ───────────────────────────────────────────────
  { id: 'SGLD.MI',  name: 'Invesco Physical Gold ETC',       ticker: 'SGLD.MI',  type: 'etf',   exchange: 'MIL',    tags: ['oro','gold','etc','invesco','sgld','commodity'] },
  { id: 'PHAU.MI',  name: 'WisdomTree Physical Gold ETC',    ticker: 'PHAU.MI',  type: 'etf',   exchange: 'MIL',    tags: ['oro','gold','etc','wisdomtree','phau'] },
  { id: 'GLDN.MI',  name: 'iShares Physical Gold ETC',       ticker: 'GLDN.MI',  type: 'etf',   exchange: 'MIL',    tags: ['oro','gold','etc','ishares','gldn'] },

  // ── Azioni Italiane ───────────────────────────────────────────────────────
  { id: 'ENI.MI',   name: 'ENI S.p.A.',                      ticker: 'ENI.MI',   type: 'stock', exchange: 'MIL',    tags: ['eni','energia','petrolio','italia'] },
  { id: 'ENEL.MI',  name: 'Enel S.p.A.',                     ticker: 'ENEL.MI',  type: 'stock', exchange: 'MIL',    tags: ['enel','energia','elettricità','italia'] },
  { id: 'ISP.MI',   name: 'Intesa Sanpaolo S.p.A.',          ticker: 'ISP.MI',   type: 'stock', exchange: 'MIL',    tags: ['intesa','sanpaolo','banca','italia','isp'] },
  { id: 'UCG.MI',   name: 'UniCredit S.p.A.',                ticker: 'UCG.MI',   type: 'stock', exchange: 'MIL',    tags: ['unicredit','banca','italia','ucg'] },
  { id: 'STM.MI',   name: 'STMicroelectronics N.V.',         ticker: 'STM.MI',   type: 'stock', exchange: 'MIL',    tags: ['stm','semiconduttori','tech','italia'] },
  { id: 'LDO.MI',   name: 'Leonardo S.p.A.',                 ticker: 'LDO.MI',   type: 'stock', exchange: 'MIL',    tags: ['leonardo','difesa','aerospazio','italia'] },
  { id: 'TRN.MI',   name: 'Terna S.p.A.',                    ticker: 'TRN.MI',   type: 'stock', exchange: 'MIL',    tags: ['terna','rete','infrastrutture','italia'] },
  { id: 'RACE.MI',  name: 'Ferrari N.V.',                    ticker: 'RACE.MI',  type: 'stock', exchange: 'MIL',    tags: ['ferrari','lusso','auto','italia'] },

  // ── Azioni USA ────────────────────────────────────────────────────────────
  { id: 'AAPL',     name: 'Apple Inc.',                      ticker: 'AAPL',     type: 'stock', exchange: 'NASDAQ', tags: ['apple','tech','aapl','iphone'] },
  { id: 'MSFT',     name: 'Microsoft Corporation',           ticker: 'MSFT',     type: 'stock', exchange: 'NASDAQ', tags: ['microsoft','tech','msft','azure'] },
  { id: 'GOOGL',    name: 'Alphabet Inc.',                   ticker: 'GOOGL',    type: 'stock', exchange: 'NASDAQ', tags: ['google','alphabet','tech','googl'] },
  { id: 'AMZN',     name: 'Amazon.com Inc.',                 ticker: 'AMZN',     type: 'stock', exchange: 'NASDAQ', tags: ['amazon','tech','amzn','cloud'] },
  { id: 'NVDA',     name: 'NVIDIA Corporation',              ticker: 'NVDA',     type: 'stock', exchange: 'NASDAQ', tags: ['nvidia','gpu','ai','tech','nvda'] },
  { id: 'TSLA',     name: 'Tesla Inc.',                      ticker: 'TSLA',     type: 'stock', exchange: 'NASDAQ', tags: ['tesla','ev','auto','tsla','musk'] },
  { id: 'META',     name: 'Meta Platforms Inc.',             ticker: 'META',     type: 'stock', exchange: 'NASDAQ', tags: ['meta','facebook','social','tech'] },
];

/** Search the local database by query string */
export function searchLocalAssets(query: string): LocalAsset[] {
  if (!query.trim()) return POPULAR_ASSETS.slice(0, 8);
  const q = query.toLowerCase().trim();
  const scored = POPULAR_ASSETS.map((a) => {
    const tickerLower = a.ticker.toLowerCase();
    const nameLower   = a.name.toLowerCase();
    // Exact ticker match → top score
    if (tickerLower === q) return { a, score: 100 };
    // Ticker starts with query → very high
    if (tickerLower.startsWith(q)) return { a, score: 90 };
    // Ticker contains query
    if (tickerLower.includes(q)) return { a, score: 70 };
    // Name starts with query
    if (nameLower.startsWith(q)) return { a, score: 60 };
    // Name contains query
    if (nameLower.includes(q)) return { a, score: 50 };
    // Any tag matches
    const tagHit = a.tags.some(t => t.includes(q) || q.includes(t));
    if (tagHit) return { a, score: 30 };
    return { a, score: 0 };
  })
  .filter(x => x.score > 0)
  .sort((a, b) => b.score - a.score);

  return scored.slice(0, 8).map(x => x.a);
}

/** True if the query looks like a direct ticker symbol (e.g. SWDA.MI, AAPL, BTC) */
export function looksLikeTicker(query: string): boolean {
  return /^[A-Za-z0-9]{2,6}(\.[A-Za-z]{2,3})?$/.test(query.trim());
}
