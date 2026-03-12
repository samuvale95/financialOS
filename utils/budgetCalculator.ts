/**
 * Budget Calculator — ISTAT-calibrated baseline
 *
 * BASE_RATIOS (% of household income) are derived from:
 *   ISTAT "Spese per consumi delle famiglie – Anno 2024" (national avg €2,755/month)
 *   https://www.istat.it/comunicato-stampa/spese-per-consumi-delle-famiglie-anno-2024/
 *
 * Derivation:
 *   For each category we take the COICOP aggregate weight (% of total spending)
 *   and scale it so the sum of tracked categories ≈ 82% of income
 *   (implying ~18% residual for savings — consistent with ISTAT avg savings rate).
 *   Regional and household-size adjustments are applied separately using ISTAT indices.
 *
 * Manual overrides: justify any change to a BASE_RATIO in a comment here.
 * Update BASE_RATIOS when ISTAT releases the following year's report.
 */

import type { StoredBudget, OnboardingGoalId, EffortLevel, HousingType, LifestyleProfile } from '../types';
import { getWeightByCategory } from '../data/istat-coicop-mapping';
import { getRegionIndex, getHouseholdFactor } from '../data/istat-adjustments';

// ─── ISTAT-derived base ratios ────────────────────────────────────────────────
// Derived from COICOP weights in istat-coicop-mapping.ts.
// Scale factor ≈ 1.097 converts "% of total spending" → "% of income",
// assuming tracked categories represent ~74.7% of spending and spending ≈ 82% of income.
// Values are rounded to 3 d.p. and calibrated for a 2-person household.

const _istatWeights = getWeightByCategory();

function _toRatio(pct: number): number {
  // pct is % of total spending; scale to % of income (target ~82% total budget)
  return Math.round((pct / 100) * 1.097 * 1000) / 1000;
}

const BASE_RATIOS: Record<string, number> = {
  // COICOP 01 — Alimentari (confirmed 19.3%): groceries 16.4% + food 2.9%
  groceries:        _toRatio(_istatWeights.groceries ?? 16.4),  // → 0.180
  food:             _toRatio(_istatWeights.food     ?? 2.9),    // → 0.032

  // COICOP 11 — Ristoranti e bar (confirmed 5.9%)
  restaurants:      _toRatio(_istatWeights.restaurants ?? 5.9), // → 0.065

  // COICOP 07 — Trasporti (confirmed 10.8%)
  fuel:             _toRatio(_istatWeights.fuel             ?? 3.7), // → 0.041
  public_transport: _toRatio(_istatWeights.public_transport ?? 2.2), // → 0.024
  transport:        _toRatio(_istatWeights.transport        ?? 4.9), // → 0.054

  // COICOP 03 — Abbigliamento + acquisti online
  shopping:         _toRatio(_istatWeights.shopping ?? 4.0),    // → 0.044

  // COICOP 09 — Ricreazione e sport (confirmed 3.8%)
  entertainment:    _toRatio(_istatWeights.entertainment ?? 2.3), // → 0.025
  sports:           _toRatio(_istatWeights.sports       ?? 1.5),  // → 0.016

  // COICOP 06 — Salute
  health:           _toRatio(_istatWeights.health   ?? 3.1),    // → 0.034
  pharmacy:         _toRatio(_istatWeights.pharmacy ?? 1.7),    // → 0.019

  // COICOP 04.3 + 05 — Casa e arredamento
  home:             _toRatio((_istatWeights.home ?? 5.5)),      // → 0.060

  // COICOP 04.1 — Fitti effettivi (base; overridden by actual cost when known)
  rent:             _toRatio(_istatWeights.rent ?? 8.5),        // → 0.093

  // COICOP 04.4+04.5 — Utenze (acqua + energia)
  utilities:        _toRatio((_istatWeights.utilities ?? 4.4)), // → 0.048

  // COICOP 12.3 — Assicurazioni
  insurance:        _toRatio(_istatWeights.insurance ?? 2.5),   // → 0.027

  // COICOP 08 — Comunicazioni e abbonamenti digitali
  subscriptions:    _toRatio(_istatWeights.subscriptions ?? 2.5), // → 0.027

  // COICOP 10 — Istruzione
  education:        _toRatio(_istatWeights.education ?? 0.9),   // → 0.010

  // COICOP 12.1 — Cura personale
  beauty:           _toRatio(_istatWeights.beauty ?? 1.8),      // → 0.020
};

// ─── Effort-level overrides ───────────────────────────────────────────────────
// Applied as absolute ratio replacements (not multipliers) to allow
// clear deviation from ISTAT baseline when the user commits to budget discipline.

const EFFORT_RATIOS: Record<EffortLevel, Partial<Record<string, number>>> = {
  leggero: {
    groceries:     0.200,
    restaurants:   0.080,
    shopping:      0.060,
    entertainment: 0.040,
    subscriptions: 0.040,
  },
  moderato: {}, // pure ISTAT baseline
  intenso: {
    groceries:     0.150,
    restaurants:   0.035,
    shopping:      0.040,
    entertainment: 0.015,
    subscriptions: 0.020,
    education:     0.030,
    sports:        0.025,
  },
};

// ─── Goal-based ratio overrides ──────────────────────────────────────────────

const GOAL_OVERRIDES: Record<OnboardingGoalId, Partial<Record<string, number>>> = {
  risparmio:  { shopping: 0.040, entertainment: 0.015, restaurants: 0.040 },
  casa:       { rent: 0.280, shopping: 0.040 }, // saving for down-payment → higher housing intent
  pensione:   { education: 0.050, subscriptions: 0.020, insurance: 0.035 },
  viaggio:    { travel: 0.060, entertainment: 0.040 },
  istruzione: { education: 0.080, entertainment: 0.015 },
  emergenza:  {}, // no ratio changes; the savings surplus becomes the emergency fund
};

// ─── Lifestyle multipliers ────────────────────────────────────────────────────

const LIFESTYLE_MULTIPLIERS = {
  sportFrequency: {
    never: 0.5, occasional: 1.0, regular: 1.8, intensive: 2.5,
  },
  travelFrequency: {
    never: 0.5, once_year: 1.0, few_times: 1.6, frequent: 2.5,
  },
  diningOutFrequency: {
    rarely: 0.6, sometimes: 1.0, often: 1.5, daily: 2.2,
  },
} as const;

// ─── Category classification (for household-size adjustments) ────────────────
// VARIABLE: scale fully with (size × perCapitaIndex) / 2
// SEMI_VAR: scale at 60% of the household delta
// FIXED:    do not scale (shared across household members)

const VARIABLE_CATS = new Set(['groceries', 'food', 'restaurants', 'health', 'pharmacy', 'education', 'beauty', 'sports']);
const SEMI_VAR_CATS = new Set(['utilities', 'public_transport', 'entertainment']);

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BudgetContext {
  householdSize?: number;
  housingType?: HousingType | null;
  housingMonthlyCost?: number;
  region?: string | null;
  dependents?: number;
  lifestyleProfile?: LifestyleProfile;
}

// ─── ISTAT average budget helper ─────────────────────────────────────────────

/**
 * Returns budget limits derived purely from ISTAT proportions, with no
 * profile adjustments. Useful as a fallback when onboarding data is missing.
 */
export function getItalyAverageBudget(monthlyIncome: number): StoredBudget[] {
  return Object.entries(BASE_RATIOS).map(([category, ratio]) => ({
    id: `b_${category}`,
    category: category as StoredBudget['category'],
    limit: Math.round(monthlyIncome * ratio),
    period: 'monthly' as const,
  }));
}

// ─── Main calculator ──────────────────────────────────────────────────────────

export function calculateBudgets(
  income: number,
  goals: OnboardingGoalId[],
  effortLevel: EffortLevel = 'moderato',
  ctx: BudgetContext = {}
): StoredBudget[] {
  const ratios = { ...BASE_RATIOS };

  // 1. Effort-level overrides (replace ISTAT baseline for affected categories)
  for (const [cat, ratio] of Object.entries(EFFORT_RATIOS[effortLevel])) {
    if (ratio !== undefined) ratios[cat] = ratio;
  }

  // 2. Goal-based overrides
  for (const goal of goals) {
    for (const [cat, ratio] of Object.entries(GOAL_OVERRIDES[goal])) {
      if (ratio !== undefined) ratios[cat] = ratio;
    }
  }

  // 3. Household-size adjustment via ISTAT perCapitaIndex
  // BASE_RATIOS are calibrated for 2-person household; householdFactor adjusts up/down.
  const hSize = Math.max(1, ctx.householdSize ?? 2);
  const householdFactor = getHouseholdFactor(hSize);

  if (householdFactor !== 1.0) {
    for (const cat of Object.keys(ratios)) {
      if (VARIABLE_CATS.has(cat)) {
        ratios[cat] *= householdFactor;
      } else if (SEMI_VAR_CATS.has(cat)) {
        // Partial scaling: 60% of the delta applies
        ratios[cat] *= 1.0 + (householdFactor - 1.0) * 0.6;
      }
      // FIXED cats (rent, transport, insurance, …): unchanged
    }
  }

  // 4. Dependents (children at school): boost education and health
  const deps = ctx.dependents ?? 0;
  if (deps > 0) {
    ratios.education = Math.min((ratios.education ?? 0.010) + deps * 0.020, 0.15);
    ratios.health    = Math.min((ratios.health    ?? 0.034) + deps * 0.010, 0.10);
  }

  // 5. Housing: override rent with actual known cost (or remove if living with family)
  const housingCost = ctx.housingMonthlyCost ?? 0;
  if (income > 0 && housingCost > 0 &&
      (ctx.housingType === 'renter' || ctx.housingType === 'owner')) {
    ratios.rent = Math.min(Math.max(housingCost / income, 0.08), 0.60);
  } else if (ctx.housingType === 'family') {
    delete ratios.rent; // no cash housing outflow
  }

  // 6. Lifestyle multipliers
  const lp = ctx.lifestyleProfile;
  if (lp) {
    const sportMult = LIFESTYLE_MULTIPLIERS.sportFrequency[lp.sportFrequency] ?? 1.0;
    ratios.sports = Math.min((ratios.sports ?? 0.016) * sportMult, 0.08);

    const travelMult = LIFESTYLE_MULTIPLIERS.travelFrequency[lp.travelFrequency] ?? 1.0;
    if (ratios.travel !== undefined) ratios.travel *= travelMult;
    else if (travelMult > 1.0) ratios.travel = 0.035 * travelMult;

    const diningMult = LIFESTYLE_MULTIPLIERS.diningOutFrequency[lp.diningOutFrequency] ?? 1.0;
    ratios.restaurants = Math.min((ratios.restaurants ?? 0.065) * diningMult, 0.15);

    let entertainmentBonus = 0;
    for (const hobby of lp.hobbies) {
      if (hobby === 'gaming' || hobby === 'cinema' || hobby === 'music') {
        entertainmentBonus += 0.012;
      } else if (hobby === 'reading') {
        ratios.education = Math.min((ratios.education ?? 0.010) + 0.008, 0.15);
      }
    }
    if (entertainmentBonus > 0) {
      ratios.entertainment = Math.min((ratios.entertainment ?? 0.025) + entertainmentBonus, 0.10);
    }
  }

  // 7. Regional cost-of-living adjustment (ISTAT 2024 macro-area indices)
  // Applied only to cost-sensitive categories; rent/utilities are most affected,
  // but since rent is typically overridden by actual cost, we focus on consumption categories.
  const regionIndex = getRegionIndex(ctx.region);
  if (regionIndex !== 1.0) {
    const REGIONAL_CATS = ['groceries', 'food', 'restaurants', 'utilities',
                           'public_transport', 'entertainment', 'beauty'];
    for (const cat of REGIONAL_CATS) {
      if (ratios[cat] !== undefined) {
        ratios[cat] *= regionIndex;
      }
    }
    // Partial application for shopping and transport (0.5× of delta)
    for (const cat of ['shopping', 'transport']) {
      if (ratios[cat] !== undefined) {
        ratios[cat] *= 1.0 + (regionIndex - 1.0) * 0.5;
      }
    }
  }

  // 8. Normalise: total tracked spending ≤ 90% of income (leaves ≥10% for savings)
  const total = Object.values(ratios).reduce((s, v) => s + v, 0);
  if (total > 0.90) {
    const scale = 0.90 / total;
    for (const cat of Object.keys(ratios)) ratios[cat] *= scale;
  }

  return Object.entries(ratios).map(([category, ratio]) => ({
    id: `b_${category}`,
    category: category as StoredBudget['category'],
    limit: Math.round(income * ratio),
    period: 'monthly' as const,
  }));
}

// ─── Savings potential ────────────────────────────────────────────────────────

export function getSavingsPotential(
  income: number,
  goals: OnboardingGoalId[],
  effortLevel: EffortLevel,
  ctx?: BudgetContext
): number {
  const budgets = calculateBudgets(income, goals, effortLevel, ctx ?? {});
  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  return Math.max(0, income - totalBudget);
}

// ─── Descriptions (unchanged) ────────────────────────────────────────────────

export const BUDGET_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  groceries:        'Spese al supermercato, alimentari e market. Include la spesa settimanale e i negozi di vicinato.',
  restaurants:      'Pasti fuori casa, pizzerie, ristoranti, bar e servizi di food delivery come Glovo e Deliveroo.',
  food:             'Acquisti alimentari generici, gastronomie e negozi specializzati.',
  fuel:             'Rifornimenti di benzina, gasolio e carburante per veicoli a motore.',
  public_transport: 'Abbonamenti e biglietti per mezzi pubblici, taxi, Uber, treni e bus.',
  transport:        'Parcheggi, autonoleggio e altre spese legate alla mobilità.',
  shopping:         'Abbigliamento, elettronica, acquisti online e spese discrezionali.',
  entertainment:    'Cinema, teatro, concerti, eventi e attività ricreative.',
  sports:           'Palestra, attrezzatura sportiva, piscina, campi sportivi e abbonamenti fitness.',
  health:           'Visite mediche, dentista, fisioterapia, analisi e spese sanitarie.',
  pharmacy:         'Farmaci, parafarmacia, integratori e prodotti sanitari da banco.',
  home:             'Manutenzione casa, arredamento, elettrodomestici e piccole riparazioni.',
  rent:             'Affitto mensile, rata del mutuo, spese condominiali e canoni di locazione.',
  utilities:        'Bollette di luce, gas, acqua, internet e telefonia.',
  insurance:        'Premi assicurativi per auto, casa, vita e polizze varie.',
  subscriptions:    'Abbonamenti digitali ricorrenti come Netflix, Spotify, Amazon Prime.',
  travel:           'Voli, hotel, vacanze, Airbnb e spese di viaggio.',
  education:        'Corsi, libri, università, formazione professionale e piattaforme di e-learning.',
  beauty:           'Parrucchiere, estetista e prodotti per la cura personale.',
  other:            'Spese non categorizzate o di natura varia.',
};
