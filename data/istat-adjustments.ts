/**
 * ISTAT Geographic and Household-Size Adjustment Indices
 *
 * Source: ISTAT – "Spese per consumi delle famiglie – Anno 2024"
 * https://www.istat.it/comunicato-stampa/spese-per-consumi-delle-famiglie-anno-2024/
 *
 * Microdati: https://www.istat.it/microdati/indagine-sulle-spese-delle-famiglie-uso-pubblico/
 *
 * Reference: national average monthly household spending = €2,755
 * Update these values when ISTAT publishes the following year's report (typically Oct/Nov).
 */

// ─── Geographic adjustments ───────────────────────────────────────────────────

export type RegionGroup = 'north_west' | 'north_east' | 'center' | 'south' | 'islands';

export interface RegionAdjustment {
  regionGroup: RegionGroup;
  /**
   * Total household spending relative to Italian average (= 1.00).
   * Source: ISTAT 2024 confirmed amounts — Nord-Est €3,032, Centro €2,999,
   * Nord-Ovest €2,973, Isole €2,321, Sud €2,199 vs national avg €2,755.
   */
  totalSpendingIndex: number;
}

/**
 * Which Italian regions belong to each macro-area.
 * Source: ISTAT territorial classification (NUTS-2 aggregation).
 */
export const REGION_TO_GROUP: Record<string, RegionGroup> = {
  // Nord-Ovest
  'Piemonte': 'north_west',
  "Valle d'Aosta": 'north_west',
  'Liguria': 'north_west',
  'Lombardia': 'north_west',

  // Nord-Est
  'Trentino-Alto Adige': 'north_east',
  'Veneto': 'north_east',
  'Friuli-Venezia Giulia': 'north_east',
  'Emilia-Romagna': 'north_east',

  // Centro
  'Toscana': 'center',
  'Umbria': 'center',
  'Marche': 'center',
  'Lazio': 'center',

  // Sud
  'Abruzzo': 'south',
  'Molise': 'south',
  'Campania': 'south',
  'Puglia': 'south',
  'Basilicata': 'south',
  'Calabria': 'south',

  // Isole
  'Sicilia': 'islands',
  'Sardegna': 'islands',
};

/**
 * Confirmed ISTAT 2024 figures.
 * Nord-Ovest: €2,973 / €2,755 = 1.079
 * Nord-Est:   €3,032 / €2,755 = 1.101
 * Centro:     €2,999 / €2,755 = 1.089
 * Sud:        €2,199 / €2,755 = 0.799
 * Isole:      €2,321 / €2,755 = 0.843
 */
export const REGION_ADJUSTMENTS: RegionAdjustment[] = [
  { regionGroup: 'north_west', totalSpendingIndex: 1.079 },
  { regionGroup: 'north_east', totalSpendingIndex: 1.101 },
  { regionGroup: 'center',     totalSpendingIndex: 1.089 },
  { regionGroup: 'south',      totalSpendingIndex: 0.799 },
  { regionGroup: 'islands',    totalSpendingIndex: 0.843 },
];

// ─── Household-size adjustments ───────────────────────────────────────────────

export interface HouseholdSizeAdjustment {
  size: 1 | 2 | 3 | 4 | 5;
  /**
   * Per-capita spending relative to a 2-person household baseline (= 1.00).
   * Captures economies of scale: single people spend ~40% more per capita
   * than each member of a couple; larger households spend progressively less.
   *
   * Derivation (ISTAT time-series, consistent with 2024 report):
   *   perCapitaIndex(N) = (monthlySpend(N) / N) / (monthlySpend(2) / 2)
   *   — size 1: (1,820 / 1) / (2,602 / 2) = 1,820 / 1,301 = 1.40
   *   — size 2: 1.00  (baseline)
   *   — size 3: (3,049 / 3) / (2,602 / 2) = 1,016 / 1,301 = 0.78
   *   — size 4: (3,482 / 4) / (2,602 / 2) =   871 / 1,301 = 0.67
   *   — size 5: (4,090 / 5) / (2,602 / 2) =   818 / 1,301 = 0.63
   *
   * To convert to a household-level multiplier relative to size-2 baseline:
   *   householdFactor(N) = (N × perCapitaIndex) / (2 × 1.00) = N × perCapitaIndex / 2
   */
  perCapitaIndex: number;
}

/**
 * Monthly spending estimates by household size (ISTAT time-series, ~2022-2024):
 *   1 member: €1,820 | 2: €2,602 | 3: €3,049 | 4: €3,482 | 5+: €4,090
 *
 * BASE_RATIOS in budgetCalculator are calibrated for a 2-person household.
 */
export const HOUSEHOLD_ADJUSTMENTS: HouseholdSizeAdjustment[] = [
  { size: 1, perCapitaIndex: 1.40 },
  { size: 2, perCapitaIndex: 1.00 }, // baseline
  { size: 3, perCapitaIndex: 0.78 },
  { size: 4, perCapitaIndex: 0.67 },
  { size: 5, perCapitaIndex: 0.63 },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Maps an Italian region name to its ISTAT macro-area group. */
export function getRegionGroup(region: string | null | undefined): RegionGroup | null {
  if (!region) return null;
  return REGION_TO_GROUP[region] ?? null;
}

/** Returns the totalSpendingIndex for a region (1.00 if unknown). */
export function getRegionIndex(region: string | null | undefined): number {
  const group = getRegionGroup(region);
  if (!group) return 1.0;
  return REGION_ADJUSTMENTS.find((r) => r.regionGroup === group)?.totalSpendingIndex ?? 1.0;
}

/**
 * Returns the household-level variable-cost multiplier relative to a 2-person household.
 * Formula: (size × perCapitaIndex) / 2
 * Applied to "variable" categories (groceries, food, health, pharmacy, etc.)
 */
export function getHouseholdFactor(size: number): number {
  const clampedSize = Math.min(Math.max(Math.round(size), 1), 5) as 1 | 2 | 3 | 4 | 5;
  const entry = HOUSEHOLD_ADJUSTMENTS.find((h) => h.size === clampedSize);
  const pci = entry?.perCapitaIndex ?? 1.0;
  return (clampedSize * pci) / 2;
}
