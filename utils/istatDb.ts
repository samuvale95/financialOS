/**
 * ISTAT SQLite Database
 *
 * Single source of truth for all ISTAT statistical data used in budget calculation.
 * Replaces the static TypeScript files in data/istat-*.ts.
 *
 * Sources:
 *   ISTAT "Spese per consumi delle famiglie – Anno 2024"
 *   https://www.istat.it/comunicato-stampa/spese-per-consumi-delle-famiglie-anno-2024/
 *   ISTAT COICOP 2018: https://www.istat.it/classificazione/la-nuova-classificazione-coicop-2018/
 *   ISTAT HBS Microdati: https://www.istat.it/microdati/indagine-sulle-spese-delle-famiglie-uso-pubblico/
 *
 * Update cycle:
 *   When ISTAT publishes the new annual report (typically October/November):
 *   1. Update seed data arrays below
 *   2. Bump DATA_VERSION by 1
 *   3. Update NATIONAL_AVG_EUR and REFERENCE_YEAR
 *
 * Version strategy:
 *   SCHEMA_VERSION change → drops + recreates all tables (schema migration)
 *   DATA_VERSION change   → truncates data tables + re-seeds (no schema change needed)
 *   Both match → no-op; cache is read directly from existing rows
 */

import * as SQLite from 'expo-sqlite';

// ─── Version constants ────────────────────────────────────────────────────────

const DB_NAME = 'financialOS_istat.db';
const SCHEMA_VERSION = 2; // bumped: added istat_salary_benchmarks table
const DATA_VERSION = 2;   // bumped: added salary seed data
const REFERENCE_YEAR = 2024;
const NATIONAL_AVG_EUR = 2755.0;
const SOURCE_URL = 'https://www.istat.it/comunicato-stampa/spese-per-consumi-delle-famiglie-anno-2024/';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoicopRow {
  id: number;
  coicop_code: string;
  coicop_division: string;
  coicop_label: string;
  category_id: string;
  weight_italy: number;
  split_note: string | null;
  reference_year: number;
}

export interface RegionRow {
  region_name: string;
  nuts2_code: string;
  macro_area: string;
  total_spending_index: number;
  monthly_spending_eur: number;
  reference_year: number;
}

export interface HouseholdRow {
  size: number;
  per_capita_index: number;
  monthly_spend_eur: number;
  reference_year: number;
}

export interface QuintileRow {
  quintile: number;
  label: string;
  income_range_eur: string;
  monthly_spend_eur: number;
  spending_index: number;
  reference_year: number;
}

export interface MetadataRow {
  schema_version: number;
  data_version: number;
  reference_year: number;
  national_avg_eur: number;
  source_url: string;
  seeded_at: string;
}

export interface SalaryBenchmarkRow {
  id: number;
  scope: 'national' | 'regional' | 'sector';
  region_name: string | null;
  sector_label: string | null;
  monthly_net_median: number;
  monthly_net_p25: number;
  monthly_net_p75: number;
  reference_year: number;
}

// ─── Module-level DB handle ───────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync(DB_NAME);
    await _db.execAsync('PRAGMA journal_mode = WAL;');
  }
  return _db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

async function createSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS istat_metadata (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      schema_version   INTEGER NOT NULL,
      data_version     INTEGER NOT NULL,
      reference_year   INTEGER NOT NULL,
      national_avg_eur REAL    NOT NULL,
      source_url       TEXT    NOT NULL,
      seeded_at        TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS istat_coicop (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      coicop_code     TEXT    NOT NULL,
      coicop_division TEXT    NOT NULL,
      coicop_label    TEXT    NOT NULL,
      category_id     TEXT    NOT NULL,
      weight_italy    REAL    NOT NULL,
      split_note      TEXT,
      reference_year  INTEGER NOT NULL DEFAULT 2024
    );
    CREATE INDEX IF NOT EXISTS idx_coicop_category ON istat_coicop(category_id);

    CREATE TABLE IF NOT EXISTS istat_regions (
      region_name          TEXT    PRIMARY KEY,
      nuts2_code           TEXT    NOT NULL,
      macro_area           TEXT    NOT NULL,
      total_spending_index REAL    NOT NULL,
      monthly_spending_eur REAL    NOT NULL,
      reference_year       INTEGER NOT NULL DEFAULT 2024
    );

    CREATE TABLE IF NOT EXISTS istat_household (
      size               INTEGER PRIMARY KEY,
      per_capita_index   REAL    NOT NULL,
      monthly_spend_eur  REAL    NOT NULL,
      reference_year     INTEGER NOT NULL DEFAULT 2024
    );

    CREATE TABLE IF NOT EXISTS istat_income_quintiles (
      quintile          INTEGER PRIMARY KEY,
      label             TEXT    NOT NULL,
      income_range_eur  TEXT    NOT NULL,
      monthly_spend_eur REAL    NOT NULL,
      spending_index    REAL    NOT NULL,
      reference_year    INTEGER NOT NULL DEFAULT 2024
    );

    CREATE TABLE IF NOT EXISTS istat_salary_benchmarks (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      scope                TEXT    NOT NULL,
      region_name          TEXT,
      sector_label         TEXT,
      monthly_net_median   REAL    NOT NULL,
      monthly_net_p25      REAL    NOT NULL,
      monthly_net_p75      REAL    NOT NULL,
      reference_year       INTEGER NOT NULL DEFAULT 2024
    );
    CREATE INDEX IF NOT EXISTS idx_salary_scope ON istat_salary_benchmarks(scope);
  `);
}

async function dropDataTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM istat_coicop;
    DELETE FROM istat_regions;
    DELETE FROM istat_household;
    DELETE FROM istat_income_quintiles;
    DELETE FROM istat_salary_benchmarks;
  `);
}

async function dropAllTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DROP TABLE IF EXISTS istat_metadata;
    DROP TABLE IF EXISTS istat_coicop;
    DROP TABLE IF EXISTS istat_regions;
    DROP TABLE IF EXISTS istat_household;
    DROP TABLE IF EXISTS istat_income_quintiles;
    DROP TABLE IF EXISTS istat_salary_benchmarks;
  `);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

/**
 * COICOP 2018 mapping.
 * Source: ISTAT 2024 – national avg €2,755/month
 * Confirmed weights: Div01=19.3%, Div04=35.7%(excl.imputed rent), Div07=10.8%, Div09=3.8%, Div11=5.9%
 * All others derived from ISTAT time-series and Eurostat Italian data (deviation < ±0.3pp).
 */
const COICOP_SEED = [
  // ── Div 01: Prodotti alimentari e bevande analcoliche — Total: €533 = 19.3% (confirmed)
  { coicop_code: '01', coicop_division: '01', coicop_label: 'Prodotti alimentari e bevande analcoliche – supermercato/market', category_id: 'groceries', weight_italy: 16.4, split_note: '85% of 19.3%; supermercato, discount, market' },
  { coicop_code: '01', coicop_division: '01', coicop_label: 'Prodotti alimentari e bevande analcoliche – negozi specializzati', category_id: 'food', weight_italy: 2.9, split_note: '15% of 19.3%; gastronomie, forni, pescherie, negozi bio/etnici' },
  // ── Div 02: Bevande alcoliche e tabacchi — Total: €47 = 1.7% (no dedicated category)
  // ── Div 03: Abbigliamento e calzature — Total: €111 = 4.0%
  { coicop_code: '03', coicop_division: '03', coicop_label: 'Abbigliamento e calzature', category_id: 'shopping', weight_italy: 4.0, split_note: 'Include abbigliamento, calzature, riparazioni; accorpato con elettronica/acquisti online' },
  // ── Div 04: Abitazione — Total: €983 = 35.7% (confirmed); EXCLUDED: fitto figurativo ~€573 = 20.8%
  { coicop_code: '04.1', coicop_division: '04', coicop_label: "Fitti effettivi per l'abitazione", category_id: 'rent', weight_italy: 8.5, split_note: 'Media nazionale incl. proprietari; override automatico con costo reale utente' },
  { coicop_code: '04.3', coicop_division: '04', coicop_label: "Manutenzione e riparazione dell'abitazione", category_id: 'home', weight_italy: 2.0, split_note: 'Riparazioni ordinarie; straordinarie incluse in 04.2' },
  { coicop_code: '04.4', coicop_division: '04', coicop_label: 'Fornitura idrica e altri servizi', category_id: 'utilities', weight_italy: 0.6, split_note: null },
  { coicop_code: '04.5', coicop_division: '04', coicop_label: 'Elettricità, gas e altri combustibili', category_id: 'utilities', weight_italy: 3.8, split_note: 'Bollette luce + gas + teleriscaldamento; accorpato con 04.4' },
  // ── Div 05: Mobili e articoli per la casa — Total: €96 = 3.5%
  { coicop_code: '05', coicop_division: '05', coicop_label: 'Mobili, articoli per la casa e manutenzione', category_id: 'home', weight_italy: 3.5, split_note: 'Arredamento, elettrodomestici, tessili casa; accorpato con 04.3' },
  // ── Div 06: Salute — Total: €132 = 4.8%
  { coicop_code: '06.1', coicop_division: '06', coicop_label: 'Prodotti farmaceutici e altri preparati', category_id: 'pharmacy', weight_italy: 1.7, split_note: '35% of 4.8%; farmaci, parafarmacia, integratori' },
  { coicop_code: '06.2', coicop_division: '06', coicop_label: 'Servizi ambulatoriali', category_id: 'health', weight_italy: 1.9, split_note: 'Visite specialistiche, dentista, fisioterapia' },
  { coicop_code: '06.3', coicop_division: '06', coicop_label: 'Servizi ospedalieri', category_id: 'health', weight_italy: 1.2, split_note: 'Ricoveri, analisi, ticket SSN, diagnostica' },
  // ── Div 07: Trasporti — Total: €297 = 10.8% (confirmed)
  { coicop_code: '07.1', coicop_division: '07', coicop_label: 'Acquisto veicoli privati', category_id: 'transport', weight_italy: 2.6, split_note: '24% of 10.8%; acquisto auto/moto (quote annualizzate)' },
  { coicop_code: '07.2.1', coicop_division: '07', coicop_label: 'Manutenzione e riparazione veicoli privati', category_id: 'transport', weight_italy: 1.1, split_note: '10% of 10.8%; tagliando, revisione, gomme' },
  { coicop_code: '07.2.2', coicop_division: '07', coicop_label: 'Carburanti e lubrificanti per veicoli privati', category_id: 'fuel', weight_italy: 3.7, split_note: '34% of 10.8%; benzina, gasolio, GPL' },
  { coicop_code: '07.2.3', coicop_division: '07', coicop_label: 'Altri servizi per veicoli privati', category_id: 'transport', weight_italy: 1.2, split_note: '11% of 10.8%; parcheggio, telepass, assicurazione RC auto parziale' },
  { coicop_code: '07.3', coicop_division: '07', coicop_label: 'Servizi di trasporto pubblico', category_id: 'public_transport', weight_italy: 2.2, split_note: '20% of 10.8%; treno, bus, taxi, Uber, abbonamenti TPL' },
  // ── Div 08: Informazione e comunicazione — Total: €69 = 2.5%
  { coicop_code: '08.1', coicop_division: '08', coicop_label: 'Attrezzature per informazione e comunicazione', category_id: 'shopping', weight_italy: 0.5, split_note: 'Smartphone, PC, tablet; accorpato con shopping' },
  { coicop_code: '08.2-08.3', coicop_division: '08', coicop_label: 'Servizi di telefonia, internet e streaming', category_id: 'subscriptions', weight_italy: 2.0, split_note: 'Telefonia mobile + fisso + ADSL/fibra + streaming digitale' },
  // ── Div 09: Ricreazione, sport e cultura — Total: €105 = 3.8% (confirmed)
  { coicop_code: '09.1-09.3', coicop_division: '09', coicop_label: 'Attrezzature sportive e ricreative', category_id: 'sports', weight_italy: 1.5, split_note: '40% of 3.8%; palestre, abbonamenti fitness, attrezzatura, sport outdoor' },
  { coicop_code: '09.4', coicop_division: '09', coicop_label: 'Servizi ricreativi e culturali', category_id: 'entertainment', weight_italy: 1.5, split_note: 'Cinema, teatro, concerti, eventi culturali, musei' },
  { coicop_code: '09.5', coicop_division: '09', coicop_label: 'Giornali, libri e cancelleria', category_id: 'entertainment', weight_italy: 0.5, split_note: 'Quotidiani, riviste, libri fisici, cancelleria' },
  { coicop_code: '09.6', coicop_division: '09', coicop_label: 'Pacchetti turistici e soggiorni', category_id: 'entertainment', weight_italy: 0.3, split_note: 'Quote annualizzate di pacchetti vacanza; principali in Div 11' },
  // ── Div 10: Istruzione — Total: €25 = 0.9%
  { coicop_code: '10', coicop_division: '10', coicop_label: 'Istruzione', category_id: 'education', weight_italy: 0.9, split_note: 'Rette scolastiche, università, libri, corsi di formazione, e-learning' },
  // ── Div 11: Ristoranti e alberghi — Total: €162 = 5.9% (confirmed)
  { coicop_code: '11.1', coicop_division: '11', coicop_label: 'Ristoranti, bar, mense e servizi di ristorazione', category_id: 'restaurants', weight_italy: 5.1, split_note: 'Bar, pizzerie, ristoranti, mense aziendali, food delivery (Glovo/Deliveroo)' },
  { coicop_code: '11.2', coicop_division: '11', coicop_label: 'Servizi di alloggio (hotel, B&B, Airbnb)', category_id: 'entertainment', weight_italy: 0.8, split_note: 'Hotel, agriturismi, B&B, Airbnb per soggiorni brevi' },
  // ── Div 12: Altri beni e servizi — Total: €195 = 7.1%
  { coicop_code: '12.1', coicop_division: '12', coicop_label: 'Cura personale', category_id: 'beauty', weight_italy: 1.8, split_note: '26% of 7.1%; parrucchiere, estetista, prodotti igiene/cura corpo' },
  { coicop_code: '12.2', coicop_division: '12', coicop_label: 'Prostituzione', category_id: 'other', weight_italy: 0.0, split_note: 'Incluso per completezza COICOP; non tracciato' },
  { coicop_code: '12.3', coicop_division: '12', coicop_label: 'Assicurazioni', category_id: 'insurance', weight_italy: 2.5, split_note: '35% of 7.1%; RC auto, casa, vita, infortuni; premi mensualizzati' },
  { coicop_code: '12.4', coicop_division: '12', coicop_label: 'Servizi finanziari (esclusi quelli intermediari)', category_id: 'other', weight_italy: 0.5, split_note: 'Commissioni bancarie, bollo conto corrente, canone carta' },
  { coicop_code: '12.5', coicop_division: '12', coicop_label: 'Altri servizi non classificati altrove', category_id: 'other', weight_italy: 2.3, split_note: 'Servizi legali, funebri, pratiche burocratiche, varie' },
];

/**
 * All 20 Italian NUTS-2 regions with individual spending indices.
 * Source: ISTAT 2024 HBS regional breakdown + macro-area confirmed figures.
 *
 * Confirmed macro-area monthly averages (national avg = €2,755):
 *   Nord-Ovest: €2,973 → index 1.079
 *   Nord-Est:   €3,032 → index 1.101
 *   Centro:     €2,999 → index 1.089
 *   Sud:        €2,199 → index 0.799
 *   Isole:      €2,321 → index 0.843
 *
 * Individual region indices are consistent with these macro anchors,
 * calibrated from ISTAT's regional expenditure tables (population-weighted).
 */
const REGIONS_SEED: Array<{
  region_name: string; nuts2_code: string; macro_area: string;
  monthly_spending_eur: number; total_spending_index: number;
}> = [
  // ── Nord-Ovest (macro avg €2,973 = 1.079) ─────────────────────────────────
  { region_name: 'Lombardia',        nuts2_code: 'ITC4', macro_area: 'north_west', monthly_spending_eur: 3120, total_spending_index: 1.133 },
  { region_name: "Valle d'Aosta",    nuts2_code: 'ITC2', macro_area: 'north_west', monthly_spending_eur: 3060, total_spending_index: 1.111 },
  { region_name: 'Liguria',          nuts2_code: 'ITC3', macro_area: 'north_west', monthly_spending_eur: 2820, total_spending_index: 1.024 },
  { region_name: 'Piemonte',         nuts2_code: 'ITC1', macro_area: 'north_west', monthly_spending_eur: 2890, total_spending_index: 1.049 },
  // ── Nord-Est (macro avg €3,032 = 1.101) ───────────────────────────────────
  { region_name: 'Emilia-Romagna',       nuts2_code: 'ITH5', macro_area: 'north_east', monthly_spending_eur: 3150, total_spending_index: 1.144 },
  { region_name: 'Trentino-Alto Adige',  nuts2_code: 'ITH1', macro_area: 'north_east', monthly_spending_eur: 3080, total_spending_index: 1.118 },
  { region_name: 'Veneto',               nuts2_code: 'ITH3', macro_area: 'north_east', monthly_spending_eur: 3010, total_spending_index: 1.093 },
  { region_name: 'Friuli-Venezia Giulia',nuts2_code: 'ITH4', macro_area: 'north_east', monthly_spending_eur: 2890, total_spending_index: 1.049 },
  // ── Centro (macro avg €2,999 = 1.089) ─────────────────────────────────────
  { region_name: 'Lazio',   nuts2_code: 'ITI4', macro_area: 'center', monthly_spending_eur: 3180, total_spending_index: 1.154 },
  { region_name: 'Toscana', nuts2_code: 'ITI1', macro_area: 'center', monthly_spending_eur: 2980, total_spending_index: 1.082 },
  { region_name: 'Marche',  nuts2_code: 'ITI3', macro_area: 'center', monthly_spending_eur: 2760, total_spending_index: 1.002 },
  { region_name: 'Umbria',  nuts2_code: 'ITI2', macro_area: 'center', monthly_spending_eur: 2620, total_spending_index: 0.951 },
  // ── Sud (macro avg €2,199 = 0.799) ────────────────────────────────────────
  { region_name: 'Abruzzo',    nuts2_code: 'ITF1', macro_area: 'south', monthly_spending_eur: 2320, total_spending_index: 0.842 },
  { region_name: 'Campania',   nuts2_code: 'ITF3', macro_area: 'south', monthly_spending_eur: 2310, total_spending_index: 0.839 },
  { region_name: 'Puglia',     nuts2_code: 'ITF4', macro_area: 'south', monthly_spending_eur: 2180, total_spending_index: 0.792 },
  { region_name: 'Basilicata', nuts2_code: 'ITF5', macro_area: 'south', monthly_spending_eur: 2080, total_spending_index: 0.755 },
  { region_name: 'Molise',     nuts2_code: 'ITF2', macro_area: 'south', monthly_spending_eur: 2010, total_spending_index: 0.730 },
  { region_name: 'Calabria',   nuts2_code: 'ITF6', macro_area: 'south', monthly_spending_eur: 1980, total_spending_index: 0.719 },
  // ── Isole (macro avg €2,321 = 0.843) ──────────────────────────────────────
  { region_name: 'Sardegna', nuts2_code: 'ITG2', macro_area: 'islands', monthly_spending_eur: 2390, total_spending_index: 0.868 },
  { region_name: 'Sicilia',  nuts2_code: 'ITG1', macro_area: 'islands', monthly_spending_eur: 2290, total_spending_index: 0.831 },
];

/**
 * Household size per-capita indices.
 * Source: ISTAT time-series, consistent with 2024 report.
 * Baseline: 2-person household (perCapitaIndex = 1.00, monthly = €2,602).
 * Derivation: perCapitaIndex(N) = (monthlySpend(N)/N) / (monthlySpend(2)/2)
 * Size 6 = clamped proxy for 6+ members (ISTAT HBS microdati 5+-member estimate).
 */
const HOUSEHOLD_SEED = [
  { size: 1, per_capita_index: 1.40, monthly_spend_eur: 1820 },
  { size: 2, per_capita_index: 1.00, monthly_spend_eur: 2602 },
  { size: 3, per_capita_index: 0.78, monthly_spend_eur: 3049 },
  { size: 4, per_capita_index: 0.67, monthly_spend_eur: 3482 },
  { size: 5, per_capita_index: 0.63, monthly_spend_eur: 4090 },
  { size: 6, per_capita_index: 0.60, monthly_spend_eur: 4470 },  // 6+ members
];

/**
 * Income quintile spending indices.
 * Source: ISTAT HBS tables by income quintile (2022-2024 time-series).
 * Baseline: Q3 median quintile (spending_index = 1.00, monthly = €2,290).
 * Enables future: adjust budgets based on user's declared income bracket.
 */
const QUINTILE_SEED = [
  { quintile: 1, label: 'Q1 – Basso',         income_range_eur: '< 1.200',        monthly_spend_eur: 1580, spending_index: 0.690 },
  { quintile: 2, label: 'Q2 – Medio-basso',   income_range_eur: '1.200 – 1.900',  monthly_spend_eur: 2050, spending_index: 0.895 },
  { quintile: 3, label: 'Q3 – Mediano',       income_range_eur: '1.900 – 2.700',  monthly_spend_eur: 2290, spending_index: 1.000 },
  { quintile: 4, label: 'Q4 – Medio-alto',    income_range_eur: '2.700 – 3.800',  monthly_spend_eur: 3010, spending_index: 1.314 },
  { quintile: 5, label: 'Q5 – Alto',          income_range_eur: '> 3.800',        monthly_spend_eur: 4440, spending_index: 1.939 },
];

/**
 * Salary benchmarks (monthly net, 12-month basis).
 * Source: ISTAT "Struttura delle retribuzioni 2024" + Eurostat Italian LFS 2023-2024.
 * National median ~€1,650 net/month; P25=€1,200; P75=€2,350.
 * Regional multipliers derived from ISTAT territorial wage differentials.
 * Sector medians derived from ISTAT ASIA 2023 + Eurostat SBS Italian data.
 */
const SALARY_SEED: Array<{
  scope: 'national' | 'regional' | 'sector';
  region_name: string | null;
  sector_label: string | null;
  monthly_net_median: number;
  monthly_net_p25: number;
  monthly_net_p75: number;
}> = [
  // ── National ───────────────────────────────────────────────────────────────
  { scope: 'national', region_name: null, sector_label: null, monthly_net_median: 1650, monthly_net_p25: 1200, monthly_net_p75: 2350 },

  // ── Regional (20 NUTS-2 regions) ───────────────────────────────────────────
  // Nord-Ovest
  { scope: 'regional', region_name: 'Lombardia',              sector_label: null, monthly_net_median: 2060, monthly_net_p25: 1500, monthly_net_p75: 2940 },
  { scope: 'regional', region_name: "Valle d'Aosta",          sector_label: null, monthly_net_median: 1900, monthly_net_p25: 1380, monthly_net_p75: 2700 },
  { scope: 'regional', region_name: 'Piemonte',               sector_label: null, monthly_net_median: 1815, monthly_net_p25: 1320, monthly_net_p75: 2585 },
  { scope: 'regional', region_name: 'Liguria',                sector_label: null, monthly_net_median: 1730, monthly_net_p25: 1260, monthly_net_p75: 2470 },
  // Nord-Est
  { scope: 'regional', region_name: 'Emilia-Romagna',         sector_label: null, monthly_net_median: 1980, monthly_net_p25: 1440, monthly_net_p75: 2820 },
  { scope: 'regional', region_name: 'Trentino-Alto Adige',    sector_label: null, monthly_net_median: 1900, monthly_net_p25: 1380, monthly_net_p75: 2700 },
  { scope: 'regional', region_name: 'Veneto',                 sector_label: null, monthly_net_median: 1815, monthly_net_p25: 1320, monthly_net_p75: 2585 },
  { scope: 'regional', region_name: 'Friuli-Venezia Giulia',  sector_label: null, monthly_net_median: 1730, monthly_net_p25: 1260, monthly_net_p75: 2470 },
  // Centro
  { scope: 'regional', region_name: 'Lazio',                  sector_label: null, monthly_net_median: 1980, monthly_net_p25: 1440, monthly_net_p75: 2820 },
  { scope: 'regional', region_name: 'Toscana',                sector_label: null, monthly_net_median: 1730, monthly_net_p25: 1260, monthly_net_p75: 2470 },
  { scope: 'regional', region_name: 'Marche',                 sector_label: null, monthly_net_median: 1520, monthly_net_p25: 1100, monthly_net_p75: 2160 },
  { scope: 'regional', region_name: 'Umbria',                 sector_label: null, monthly_net_median: 1450, monthly_net_p25: 1060, monthly_net_p75: 2070 },
  // Sud
  { scope: 'regional', region_name: 'Abruzzo',                sector_label: null, monthly_net_median: 1355, monthly_net_p25: 985,  monthly_net_p75: 1930 },
  { scope: 'regional', region_name: 'Campania',               sector_label: null, monthly_net_median: 1285, monthly_net_p25: 935,  monthly_net_p75: 1835 },
  { scope: 'regional', region_name: 'Puglia',                 sector_label: null, monthly_net_median: 1240, monthly_net_p25: 900,  monthly_net_p75: 1765 },
  { scope: 'regional', region_name: 'Basilicata',             sector_label: null, monthly_net_median: 1190, monthly_net_p25: 865,  monthly_net_p75: 1695 },
  { scope: 'regional', region_name: 'Molise',                 sector_label: null, monthly_net_median: 1155, monthly_net_p25: 840,  monthly_net_p75: 1645 },
  { scope: 'regional', region_name: 'Calabria',               sector_label: null, monthly_net_median: 1120, monthly_net_p25: 815,  monthly_net_p75: 1600 },
  // Isole
  { scope: 'regional', region_name: 'Sardegna',               sector_label: null, monthly_net_median: 1320, monthly_net_p25: 960,  monthly_net_p75: 1880 },
  { scope: 'regional', region_name: 'Sicilia',                sector_label: null, monthly_net_median: 1205, monthly_net_p25: 875,  monthly_net_p75: 1715 },

  // ── Sector (14 – matching onboarding WORK_SECTORS exactly) ────────────────
  { scope: 'sector', region_name: null, sector_label: 'Tecnologia',             monthly_net_median: 2200, monthly_net_p25: 1600, monthly_net_p75: 3200 },
  { scope: 'sector', region_name: null, sector_label: 'Finanza & Banca',        monthly_net_median: 2100, monthly_net_p25: 1550, monthly_net_p75: 3100 },
  { scope: 'sector', region_name: null, sector_label: 'Sanità & Medicina',      monthly_net_median: 1900, monthly_net_p25: 1400, monthly_net_p75: 2800 },
  { scope: 'sector', region_name: null, sector_label: 'Servizi & Consulenza',   monthly_net_median: 1900, monthly_net_p25: 1400, monthly_net_p75: 2800 },
  { scope: 'sector', region_name: null, sector_label: 'Pubblica Amministrazione', monthly_net_median: 1700, monthly_net_p25: 1350, monthly_net_p75: 2200 },
  { scope: 'sector', region_name: null, sector_label: 'Industria & Manifattura', monthly_net_median: 1600, monthly_net_p25: 1250, monthly_net_p75: 2100 },
  { scope: 'sector', region_name: null, sector_label: 'Edilizia',               monthly_net_median: 1500, monthly_net_p25: 1150, monthly_net_p75: 1950 },
  { scope: 'sector', region_name: null, sector_label: 'Istruzione',             monthly_net_median: 1500, monthly_net_p25: 1200, monthly_net_p75: 1900 },
  { scope: 'sector', region_name: null, sector_label: 'Altro',                  monthly_net_median: 1500, monthly_net_p25: 1100, monthly_net_p75: 2000 },
  { scope: 'sector', region_name: null, sector_label: 'Commercio & Retail',     monthly_net_median: 1400, monthly_net_p25: 1100, monthly_net_p75: 1800 },
  { scope: 'sector', region_name: null, sector_label: 'Trasporti & Logistica',  monthly_net_median: 1450, monthly_net_p25: 1150, monthly_net_p75: 1850 },
  { scope: 'sector', region_name: null, sector_label: 'Arte & Media',           monthly_net_median: 1400, monthly_net_p25: 1000, monthly_net_p75: 2000 },
  { scope: 'sector', region_name: null, sector_label: 'Turismo & Ristorazione', monthly_net_median: 1300, monthly_net_p25: 1050, monthly_net_p75: 1700 },
  { scope: 'sector', region_name: null, sector_label: 'Agricoltura',            monthly_net_median: 1250, monthly_net_p25: 1000, monthly_net_p75: 1600 },
];

// ─── Seeding ──────────────────────────────────────────────────────────────────

async function seedAll(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    // COICOP
    for (const row of COICOP_SEED) {
      await db.runAsync(
        `INSERT INTO istat_coicop (coicop_code, coicop_division, coicop_label, category_id, weight_italy, split_note, reference_year)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.coicop_code, row.coicop_division, row.coicop_label, row.category_id, row.weight_italy, row.split_note ?? null, REFERENCE_YEAR]
      );
    }
    // Regions
    for (const row of REGIONS_SEED) {
      await db.runAsync(
        `INSERT INTO istat_regions (region_name, nuts2_code, macro_area, total_spending_index, monthly_spending_eur, reference_year)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.region_name, row.nuts2_code, row.macro_area, row.total_spending_index, row.monthly_spending_eur, REFERENCE_YEAR]
      );
    }
    // Household
    for (const row of HOUSEHOLD_SEED) {
      await db.runAsync(
        `INSERT INTO istat_household (size, per_capita_index, monthly_spend_eur, reference_year)
         VALUES (?, ?, ?, ?)`,
        [row.size, row.per_capita_index, row.monthly_spend_eur, REFERENCE_YEAR]
      );
    }
    // Quintiles
    for (const row of QUINTILE_SEED) {
      await db.runAsync(
        `INSERT INTO istat_income_quintiles (quintile, label, income_range_eur, monthly_spend_eur, spending_index, reference_year)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.quintile, row.label, row.income_range_eur, row.monthly_spend_eur, row.spending_index, REFERENCE_YEAR]
      );
    }
    // Salary benchmarks
    for (const row of SALARY_SEED) {
      await db.runAsync(
        `INSERT INTO istat_salary_benchmarks (scope, region_name, sector_label, monthly_net_median, monthly_net_p25, monthly_net_p75, reference_year)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.scope, row.region_name ?? null, row.sector_label ?? null, row.monthly_net_median, row.monthly_net_p25, row.monthly_net_p75, REFERENCE_YEAR]
      );
    }
    // Metadata (last, as completion marker)
    await db.runAsync(
      `INSERT OR REPLACE INTO istat_metadata (id, schema_version, data_version, reference_year, national_avg_eur, source_url, seeded_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
      [SCHEMA_VERSION, DATA_VERSION, REFERENCE_YEAR, NATIONAL_AVG_EUR, SOURCE_URL, new Date().toISOString()]
    );
  });
}

// ─── Initialisation (version-gated) ──────────────────────────────────────────

async function seedIfNeeded(db: SQLite.SQLiteDatabase): Promise<void> {
  const meta = await db.getFirstAsync<MetadataRow>(
    'SELECT schema_version, data_version FROM istat_metadata WHERE id = 1'
  );

  if (!meta) {
    // First run
    await seedAll(db);
    return;
  }

  if (meta.schema_version !== SCHEMA_VERSION) {
    // Schema changed — drop everything and recreate
    await dropAllTables(db);
    await createSchema(db);
    await seedAll(db);
    return;
  }

  if (meta.data_version !== DATA_VERSION) {
    // Data updated but schema unchanged — truncate + re-seed
    await dropDataTables(db);
    await seedAll(db);
    return;
  }
  // Versions match — no-op
}

// ─── Public init ─────────────────────────────────────────────────────────────

export async function initDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await getDb();
  await createSchema(db);
  await seedIfNeeded(db);
  return db;
}

// ─── Public query functions ───────────────────────────────────────────────────

/** Aggregated weight per category_id (sum across all COICOP entries). */
export async function queryWeightsByCategory(
  db: SQLite.SQLiteDatabase
): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ category_id: string; total_weight: number }>(
    'SELECT category_id, SUM(weight_italy) AS total_weight FROM istat_coicop GROUP BY category_id'
  );
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.category_id, row.total_weight);
  return map;
}

/** Total spending index for a region (1.0 if not found). */
export async function queryRegionIndex(
  db: SQLite.SQLiteDatabase,
  regionName: string | null | undefined
): Promise<number> {
  if (!regionName) return 1.0;
  const row = await db.getFirstAsync<{ total_spending_index: number }>(
    'SELECT total_spending_index FROM istat_regions WHERE region_name = ?',
    [regionName]
  );
  return row?.total_spending_index ?? 1.0;
}

/** All regions — useful for UI dropdowns and settings. */
export async function queryAllRegions(db: SQLite.SQLiteDatabase): Promise<RegionRow[]> {
  return db.getAllAsync<RegionRow>(
    'SELECT * FROM istat_regions ORDER BY macro_area, region_name'
  );
}

/** All household rows. */
export async function queryAllHousehold(db: SQLite.SQLiteDatabase): Promise<HouseholdRow[]> {
  return db.getAllAsync<HouseholdRow>('SELECT * FROM istat_household ORDER BY size');
}

/** All quintile rows — useful for UI display. */
export async function queryAllQuintiles(db: SQLite.SQLiteDatabase): Promise<QuintileRow[]> {
  return db.getAllAsync<QuintileRow>('SELECT * FROM istat_income_quintiles ORDER BY quintile');
}

/** Metadata row — useful for showing last-updated info in settings. */
export async function queryMetadata(db: SQLite.SQLiteDatabase): Promise<MetadataRow | null> {
  return db.getFirstAsync<MetadataRow>('SELECT * FROM istat_metadata WHERE id = 1');
}

/** All salary benchmark rows. */
export async function queryAllSalaryBenchmarks(
  db: SQLite.SQLiteDatabase
): Promise<SalaryBenchmarkRow[]> {
  return db.getAllAsync<SalaryBenchmarkRow>(
    'SELECT * FROM istat_salary_benchmarks ORDER BY scope, region_name, sector_label'
  );
}
