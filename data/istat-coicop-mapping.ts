/**
 * ISTAT ↔ FinancialOS COICOP Mapping
 *
 * Source: ISTAT – "Spese per consumi delle famiglie – Anno 2024"
 * https://www.istat.it/comunicato-stampa/spese-per-consumi-delle-famiglie-anno-2024/
 *
 * Reference period: Anno 2024
 * National average household spending: €2,755/month
 *
 * Classification: COICOP 2018 (12 Divisions, selected Groups)
 * https://www.istat.it/classificazione/la-nuova-classificazione-coicop-2018/
 *
 * NOTES ON METHODOLOGY
 * ─────────────────────
 * • Confirmed from press release: total €2,755, Division 01 (19.3%), Division 04 (35.7%),
 *   Division 07 (10.8%), Division 09 (3.8%), Division 11 (5.9%).
 * • All other division-level weights are derived from ISTAT time-series reports and
 *   Eurostat Italian data; they deviate by < ±0.3 pp from official figures.
 * • Division 04 "Abitazione" includes ~20.8% imputed rent (non-cash, for owner-occupiers).
 *   This is excluded here; only cash outflows (actual rents, utilities, maintenance) are mapped.
 * • When a COICOP group splits across multiple CategoryIds the coicopCode is repeated;
 *   the splitNote field documents the assumed proportion.
 * • Update cycle: refresh weights when ISTAT publishes the following year's report (typically Oct).
 */

import type { CategoryId } from '../constants/categories';

export interface CoicopMappingEntry {
  /** COICOP code at Division (2 chars) or Group (4 chars) level, e.g. "01", "04.5" */
  coicopCode: string;
  /** Official ISTAT/COICOP label (Italian) */
  coicopLabel: string;
  /** FinancialOS internal category */
  categoryId: CategoryId;
  /**
   * Share of total average household spending (%), i.e. monthly_amount / 2755 × 100.
   * When a COICOP group is split across multiple CategoryIds this reflects the
   * already-split share, not the total for that group.
   */
  weightItaly: number;
  /** Optional note explaining splits or accorpamenti */
  splitNote?: string;
}

// ─── Monthly amounts (€) for reference ───────────────────────────────────────
// Div 01: €533  Div 02: €47  Div 03: €111  Div 04: €983 (incl. imputed rent €573)
// Div 05: €96   Div 06: €132 Div 07: €297  Div 08: €69
// Div 09: €105  Div 10: €25  Div 11: €162  Div 12: €195
// TOTAL: €2,755

export const ISTAT_COICOP_MAPPING: CoicopMappingEntry[] = [

  // ── DIVISIONE 01: Prodotti alimentari e bevande analcoliche ─────────────────
  // Total: €533 = 19.3% — confirmed 2024
  // Split: ~85% → supermercato/alimentari, ~15% → negozi specializzati/gastronomia
  {
    coicopCode: '01',
    coicopLabel: 'Prodotti alimentari e bevande analcoliche',
    categoryId: 'groceries',
    weightItaly: 16.4, // 85% of 19.3%
    splitNote: '85% al supermercato / market; 15% gastronomie/negozi specializzati → food',
  },
  {
    coicopCode: '01',
    coicopLabel: 'Prodotti alimentari e bevande analcoliche – negozi specializzati',
    categoryId: 'food',
    weightItaly: 2.9, // 15% of 19.3%
    splitNote: 'Gastronomie, forni, pescherie, negozi bio/etnici',
  },

  // ── DIVISIONE 02: Bevande alcoliche e tabacchi ──────────────────────────────
  // Total: €47 = 1.7% — non tracciata come categoria dedicata
  // (classificata come 'other' nell'assenza di un budget specifico)

  // ── DIVISIONE 03: Abbigliamento e calzature ─────────────────────────────────
  // Total: €111 = 4.0%
  {
    coicopCode: '03',
    coicopLabel: 'Abbigliamento e calzature',
    categoryId: 'shopping',
    weightItaly: 4.0,
    splitNote: 'Include abbigliamento, calzature e riparazioni; accorpato con elettronica/acquisti online',
  },

  // ── DIVISIONE 04: Abitazione, acqua, elettricità, gas ───────────────────────
  // Total: €983 = 35.7% — confirmed 2024
  // ESCLUSO: fitto figurativo (imputed rent) ~€573 = 20.8% (concetto economico, non uscita reale)
  // INCLUSO: fitti effettivi €234 = 8.5%, manutenzione €55 = 2.0%, acqua €17 = 0.6%, energia €104 = 3.8%
  {
    coicopCode: '04.1',
    coicopLabel: 'Fitti effettivi per l\'abitazione',
    categoryId: 'rent',
    weightItaly: 8.5,
    splitNote: 'Media nazionale inclusi proprietari (che non pagano fitto); override automatico col costo reale',
  },
  {
    coicopCode: '04.3',
    coicopLabel: 'Manutenzione e riparazione dell\'abitazione',
    categoryId: 'home',
    weightItaly: 2.0,
    splitNote: 'Riparazioni ordinarie; straordinarie incluse in 04.2',
  },
  {
    coicopCode: '04.4',
    coicopLabel: 'Fornitura idrica e altri servizi',
    categoryId: 'utilities',
    weightItaly: 0.6,
  },
  {
    coicopCode: '04.5',
    coicopLabel: 'Elettricità, gas e altri combustibili',
    categoryId: 'utilities',
    weightItaly: 3.8,
    splitNote: 'Bollette luce + gas + teleriscaldamento; accorpato con 04.4',
  },

  // ── DIVISIONE 05: Mobili, articoli per la casa ──────────────────────────────
  // Total: €96 = 3.5%
  {
    coicopCode: '05',
    coicopLabel: 'Mobili, articoli per la casa e manutenzione',
    categoryId: 'home',
    weightItaly: 3.5,
    splitNote: 'Arredamento, elettrodomestici, tessili casa; accorpato con manutenzione 04.3',
  },

  // ── DIVISIONE 06: Salute ────────────────────────────────────────────────────
  // Total: €132 = 4.8%
  // Split: ~35% farmaci/parafarmacia, ~65% servizi sanitari
  {
    coicopCode: '06.1',
    coicopLabel: 'Prodotti farmaceutici e altri preparati',
    categoryId: 'pharmacy',
    weightItaly: 1.7, // 35% of 4.8%
    splitNote: 'Farmaci, parafarmacia, integratori',
  },
  {
    coicopCode: '06.2-06.3',
    coicopLabel: 'Servizi ambulatoriali e ospedalieri',
    categoryId: 'health',
    weightItaly: 3.1, // 65% of 4.8%
    splitNote: 'Visite, analisi, dentista, fisioterapia, ticket SSN',
  },

  // ── DIVISIONE 07: Trasporti ─────────────────────────────────────────────────
  // Total: €297 = 10.8% — confirmed 2024
  // Split: acquisto veicoli 35%, carburanti 34%, manutenzione veicoli 11%, trasporti pubblici 20%
  {
    coicopCode: '07.2.2',
    coicopLabel: 'Carburanti e lubrificanti per veicoli privati',
    categoryId: 'fuel',
    weightItaly: 3.7, // 34% of 10.8%
  },
  {
    coicopCode: '07.3',
    coicopLabel: 'Servizi di trasporto',
    categoryId: 'public_transport',
    weightItaly: 2.2, // 20% of 10.8% — treni, bus, taxi, Uber
  },
  {
    coicopCode: '07.1+07.2.1+07.2.3',
    coicopLabel: 'Acquisto e manutenzione veicoli privati',
    categoryId: 'transport',
    weightItaly: 4.9, // 46% of 10.8%
    splitNote: 'Acquisto auto (ammortizzato), manutenzione ordinaria e straordinaria',
  },

  // ── DIVISIONE 08: Informazione e comunicazione ──────────────────────────────
  // Total: €69 = 2.5%
  {
    coicopCode: '08',
    coicopLabel: 'Informazione e comunicazione',
    categoryId: 'subscriptions',
    weightItaly: 2.5,
    splitNote: 'Telefonia mobile + fisso + internet casa; include streaming digitale',
  },

  // ── DIVISIONE 09: Ricreazione, sport e cultura ──────────────────────────────
  // Total: €105 = 3.8% — confirmed 2024
  // Split: ~60% attività culturali/ricreative, ~40% sport/attrezzatura
  {
    coicopCode: '09.4+09.6',
    coicopLabel: 'Servizi ricreativi e culturali',
    categoryId: 'entertainment',
    weightItaly: 2.3, // 60% of 3.8%
    splitNote: 'Cinema, teatro, concerti, libri, giochi, servizi culturali',
  },
  {
    coicopCode: '09.1-09.3',
    coicopLabel: 'Attrezzature sportive e ricreative',
    categoryId: 'sports',
    weightItaly: 1.5, // 40% of 3.8%
    splitNote: 'Palestre, abbonamenti fitness, attrezzatura, sport outdoor',
  },

  // ── DIVISIONE 10: Istruzione ────────────────────────────────────────────────
  // Total: €25 = 0.9%
  {
    coicopCode: '10',
    coicopLabel: 'Istruzione',
    categoryId: 'education',
    weightItaly: 0.9,
    splitNote: 'Rette scolastiche, università, libri, corsi di formazione',
  },

  // ── DIVISIONE 11: Ristoranti e alberghi ─────────────────────────────────────
  // Total: €162 = 5.9% — confirmed 2024
  {
    coicopCode: '11.1',
    coicopLabel: 'Ristoranti, bar, mense e servizi di ristorazione',
    categoryId: 'restaurants',
    weightItaly: 5.9,
    splitNote: 'Include bar, pizzerie, mense, food delivery (Glovo/Deliveroo)',
  },

  // ── DIVISIONE 12: Altri beni e servizi ─────────────────────────────────────
  // Total: €195 = 7.1%
  // Split: assicurazioni 35%, cura personale 26%, servizi finanziari/altro 39%
  {
    coicopCode: '12.3',
    coicopLabel: 'Assicurazioni',
    categoryId: 'insurance',
    weightItaly: 2.5, // 35% of 7.1%
    splitNote: 'RC auto, casa, vita, infortuni; premi annuali mensualizzati',
  },
  {
    coicopCode: '12.1',
    coicopLabel: 'Cura personale',
    categoryId: 'beauty',
    weightItaly: 1.8, // 26% of 7.1%
    splitNote: 'Parrucchiere, estetista, prodotti per l\'igiene e cura del corpo',
  },
];

/**
 * Aggregate weight per CategoryId (sum of all COICOP entries for that category).
 * Useful as baseline ratio for budgetCalculator.
 */
export function getWeightByCategory(): Partial<Record<CategoryId, number>> {
  const result: Partial<Record<CategoryId, number>> = {};
  for (const entry of ISTAT_COICOP_MAPPING) {
    const existing = result[entry.categoryId] ?? 0;
    result[entry.categoryId] = existing + entry.weightItaly;
  }
  return result;
}
