import type { StoredBudget, OnboardingGoalId, EffortLevel, HousingType } from '../types';

const BASE_RATIOS: Record<string, number> = {
  food: 0.15,
  transport: 0.08,
  utilities: 0.07,
  home: 0.25,
  shopping: 0.10,
  entertainment: 0.05,
  health: 0.05,
  subscriptions: 0.03,
  education: 0.05,
};

const EFFORT_RATIOS: Record<EffortLevel, Partial<Record<string, number>>> = {
  leggero: {
    food: 0.18,
    transport: 0.10,
    shopping: 0.14,
    entertainment: 0.08,
    subscriptions: 0.05,
  },
  moderato: {},
  intenso: {
    food: 0.12,
    transport: 0.07,
    shopping: 0.06,
    entertainment: 0.03,
    subscriptions: 0.02,
    education: 0.04,
    home: 0.22,
  },
};

const GOAL_OVERRIDES: Record<OnboardingGoalId, Partial<Record<string, number>>> = {
  risparmio: { shopping: 0.07, entertainment: 0.03 },
  casa: { home: 0.30, shopping: 0.07 },
  pensione: { education: 0.08, subscriptions: 0.02 },
  viaggio: { entertainment: 0.07, shopping: 0.08 },
  istruzione: { education: 0.10, entertainment: 0.03 },
  emergenza: {},
};

// Moltiplicatori costo della vita per regione italiana
const REGION_COST: Record<string, number> = {
  'Lombardia': 1.20, 'Lazio': 1.15, 'Toscana': 1.10,
  'Emilia-Romagna': 1.10, 'Liguria': 1.10, 'Veneto': 1.05,
  'Piemonte': 1.05, 'Trentino-Alto Adige': 1.10,
  'Friuli-Venezia Giulia': 1.00, "Valle d'Aosta": 1.05,
  'Umbria': 0.95, 'Marche': 0.95, 'Abruzzo': 0.90,
  'Molise': 0.85, 'Campania': 0.90, 'Puglia': 0.85,
  'Basilicata': 0.85, 'Calabria': 0.80, 'Sicilia': 0.85, 'Sardegna': 0.90,
};

export interface BudgetContext {
  householdSize?: number;
  housingType?: HousingType | null;
  housingMonthlyCost?: number;
  region?: string | null;
  dependents?: number;
}

export function calculateBudgets(
  income: number,
  goals: OnboardingGoalId[],
  effortLevel: EffortLevel = 'moderato',
  ctx: BudgetContext = {}
): StoredBudget[] {
  const ratios = { ...BASE_RATIOS };

  // Livello di impegno
  for (const [cat, ratio] of Object.entries(EFFORT_RATIOS[effortLevel])) {
    if (ratio !== undefined) ratios[cat] = ratio;
  }

  // Override per obiettivo
  for (const goal of goals) {
    for (const [cat, ratio] of Object.entries(GOAL_OVERRIDES[goal])) {
      if (ratio !== undefined) ratios[cat] = ratio;
    }
  }

  // Nucleo familiare: food e utilities scalano con il numero di persone
  const hSize = Math.max(1, ctx.householdSize ?? 1);
  if (hSize > 1) {
    ratios.food = Math.min(ratios.food * (1 + (hSize - 1) * 0.15), 0.35);
    ratios.utilities = Math.min(ratios.utilities * (1 + (hSize - 1) * 0.10), 0.15);
  }

  // Figli a carico: più spesa per education e health
  const deps = ctx.dependents ?? 0;
  if (deps > 0) {
    ratios.education = Math.min((ratios.education ?? 0.05) + deps * 0.02, 0.15);
    ratios.health = Math.min((ratios.health ?? 0.05) + deps * 0.01, 0.10);
  }

  // Abitazione: se l'utente paga affitto/mutuo noto, usa il costo reale
  const housingCost = ctx.housingMonthlyCost ?? 0;
  if (income > 0 && housingCost > 0 &&
      (ctx.housingType === 'renter' || ctx.housingType === 'owner')) {
    ratios.home = Math.min(Math.max(housingCost / income, 0.10), 0.50);
  }

  // Costo della vita per regione (categorie sensibili al territorio)
  const costMult = ctx.region ? (REGION_COST[ctx.region] ?? 1.0) : 1.0;
  if (costMult !== 1.0) {
    for (const cat of ['food', 'transport', 'entertainment', 'shopping']) {
      if (ratios[cat] !== undefined) ratios[cat] *= costMult;
    }
  }

  // Normalizza: il totale non deve superare il 90% del reddito
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
