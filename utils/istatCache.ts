/**
 * ISTAT In-Memory Cache
 *
 * Populates JS Maps from SQLite once at app startup (via initialize()).
 * Exposes synchronous getters used by budgetCalculator.ts, so the calculator
 * never needs to be async.
 *
 * Usage:
 *   1. Call `await istatCache.initialize()` once in app/_layout.tsx before any
 *      budget calculation can occur (before onboarding or tab screens render).
 *   2. Call the sync getters freely from any synchronous code.
 */

import {
  initDb,
  queryWeightsByCategory,
  queryAllRegions,
  queryAllHousehold,
  queryAllQuintiles,
  queryAllSalaryBenchmarks,
  type RegionRow,
  type HouseholdRow,
  type QuintileRow,
  type MetadataRow,
  type SalaryBenchmarkRow,
  queryMetadata,
} from './istatDb';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { CategoryId } from '../constants/categories';

// ─── Module-level state ───────────────────────────────────────────────────────

let _initialized = false;
let _initPromise: Promise<void> | null = null;
let _db: SQLiteDatabase | null = null;

// In-memory maps (populated on initialize())
const _weights     = new Map<string, number>();
const _regionIdx   = new Map<string, number>();     // region_name → total_spending_index
const _macroIdx    = new Map<string, number>();     // macro_area → avg total_spending_index
const _household   = new Map<number, { perCapitaIndex: number }>(); // size → factors
const _quintiles   = new Map<number, number>();     // quintile (1-5) → spending_index

// Cached full rows for UI use
let _regionRows: RegionRow[] = [];
let _householdRows: HouseholdRow[] = [];
let _quintileRows: QuintileRow[] = [];
let _metadata: MetadataRow | null = null;
let _salaryRows: SalaryBenchmarkRow[] = [];

// Salary lookup maps
const _salaryByRegion = new Map<string, SalaryBenchmarkRow>();  // region_name → row
const _salaryBySector = new Map<string, SalaryBenchmarkRow>();  // sector_label → row
let _salaryNational: SalaryBenchmarkRow | null = null;

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Must be called once before any sync getter is used.
 * Idempotent — subsequent calls return immediately.
 * Throws if the SQLite layer fails, so the caller can handle/log.
 */
export async function initialize(): Promise<void> {
  if (_initialized) return;
  // Deduplicate concurrent calls (e.g. StrictMode double-mount)
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    _db = await initDb();

    const [weights, regions, household, quintiles, meta, salaries] = await Promise.all([
      queryWeightsByCategory(_db),
      queryAllRegions(_db),
      queryAllHousehold(_db),
      queryAllQuintiles(_db),
      queryMetadata(_db),
      queryAllSalaryBenchmarks(_db),
    ]);

    // COICOP weights
    for (const [cat, weight] of weights) {
      _weights.set(cat, weight);
    }

    // Regions: individual lookup + macro-area aggregation
    _regionRows = regions;
    for (const row of regions) {
      _regionIdx.set(row.region_name, row.total_spending_index);
    }
    // Compute macro-area averages from the DB rows (simple arithmetic mean)
    const macroGroups = new Map<string, number[]>();
    for (const row of regions) {
      if (!macroGroups.has(row.macro_area)) macroGroups.set(row.macro_area, []);
      macroGroups.get(row.macro_area)!.push(row.total_spending_index);
    }
    for (const [area, indices] of macroGroups) {
      _macroIdx.set(area, indices.reduce((s, v) => s + v, 0) / indices.length);
    }

    // Household
    _householdRows = household;
    for (const row of household) {
      _household.set(row.size, { perCapitaIndex: row.per_capita_index });
    }

    // Quintiles
    _quintileRows = quintiles;
    for (const row of quintiles) {
      _quintiles.set(row.quintile, row.spending_index);
    }

    _metadata = meta;

    // Salaries
    _salaryRows = salaries;
    for (const row of salaries) {
      if (row.scope === 'national') _salaryNational = row;
      else if (row.scope === 'regional' && row.region_name) _salaryByRegion.set(row.region_name, row);
      else if (row.scope === 'sector' && row.sector_label) _salaryBySector.set(row.sector_label, row);
    }

    _initialized = true;
  })();

  return _initPromise;
}

export function isInitialized(): boolean {
  return _initialized;
}

// ─── Sync getters (used by budgetCalculator.ts) ───────────────────────────────

/**
 * Aggregated COICOP weight per FinancialOS category (% of total household spending).
 * Mirrors the old getWeightByCategory() from data/istat-coicop-mapping.ts.
 */
export function getWeights(): Partial<Record<CategoryId, number>> {
  const result: Partial<Record<CategoryId, number>> = {};
  for (const [cat, weight] of _weights) {
    result[cat as CategoryId] = weight;
  }
  return result;
}

/**
 * Total spending index for a region name (exact match).
 * Falls back to macro-area average if only the macro group is passed,
 * then falls back to 1.0 (national average) if unknown.
 * Mirrors the old getRegionIndex() from data/istat-adjustments.ts.
 */
export function getRegionIndex(region: string | null | undefined): number {
  if (!region) return 1.0;
  const exact = _regionIdx.get(region);
  if (exact !== undefined) return exact;
  // Try macro-area fallback (passed as legacy macro_area string)
  const macro = _macroIdx.get(region);
  if (macro !== undefined) return macro;
  return 1.0;
}

/**
 * Household-level variable-cost multiplier relative to a 2-person household.
 * Formula: (size × perCapitaIndex) / 2
 * Mirrors the old getHouseholdFactor() from data/istat-adjustments.ts.
 * Size is clamped to [1, 6] (6 = proxy for 6+ members).
 */
export function getHouseholdFactor(size: number): number {
  const clamped = Math.min(Math.max(Math.round(size), 1), 6);
  const entry = _household.get(clamped);
  const pci = entry?.perCapitaIndex ?? 1.0;
  return (clamped * pci) / 2;
}

/**
 * Spending multiplier for a given income quintile (1–5), relative to Q3 median (= 1.00).
 * Not yet wired into calculateBudgets() — available for future use.
 */
export function getIncomeQuintileIndex(quintile: 1 | 2 | 3 | 4 | 5): number {
  return _quintiles.get(quintile) ?? 1.0;
}

// ─── Read-only row accessors (for UI / settings screens) ─────────────────────

export function getAllRegions(): RegionRow[] {
  return _regionRows;
}

export function getAllHousehold(): HouseholdRow[] {
  return _householdRows;
}

export function getAllQuintiles(): QuintileRow[] {
  return _quintileRows;
}

export function getMetadata(): MetadataRow | null {
  return _metadata;
}

export function getDb(): SQLiteDatabase | null {
  return _db;
}

// ─── Salary benchmark getters ─────────────────────────────────────────────────

export { type SalaryBenchmarkRow };

/**
 * Returns the best-matching salary benchmark for the given region + sector.
 * Priority: regional (if region matches) + sector (if sector matches) combined as
 * a weighted blend, otherwise falls back to regional-only, sector-only, or national.
 *
 * Returns null only if the cache hasn't been initialized.
 */
export function getSalaryBenchmark(
  region?: string | null,
  sector?: string | null
): { median: number; p25: number; p75: number; label: string } | null {
  const nat = _salaryNational;
  if (!nat) return null; // not initialized

  const reg = region ? _salaryByRegion.get(region) ?? null : null;
  const sec = sector ? _salaryBySector.get(sector) ?? null : null;

  if (reg && sec) {
    // Blend: 50% regional adjustment on national + 50% sector adjustment
    const regFactor = reg.monthly_net_median / nat.monthly_net_median;
    const secFactor = sec.monthly_net_median / nat.monthly_net_median;
    const blendFactor = (regFactor + secFactor) / 2;
    return {
      median: Math.round(nat.monthly_net_median * blendFactor),
      p25:    Math.round(nat.monthly_net_p25    * blendFactor),
      p75:    Math.round(nat.monthly_net_p75    * blendFactor),
      label:  `${region} · ${sector}`,
    };
  }
  if (reg) {
    return { median: reg.monthly_net_median, p25: reg.monthly_net_p25, p75: reg.monthly_net_p75, label: region! };
  }
  if (sec) {
    return { median: sec.monthly_net_median, p25: sec.monthly_net_p25, p75: sec.monthly_net_p75, label: sector! };
  }
  return { median: nat.monthly_net_median, p25: nat.monthly_net_p25, p75: nat.monthly_net_p75, label: 'Italia' };
}

export function getAllSalaryBenchmarks(): SalaryBenchmarkRow[] {
  return _salaryRows;
}
