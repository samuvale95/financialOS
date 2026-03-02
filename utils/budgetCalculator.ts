import type { StoredBudget } from '../types';
import type { OnboardingGoalId, EffortLevel } from '../types';

// Base ratios (moderato / neutral)
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

// Effort level overrides the non-essential categories
const EFFORT_RATIOS: Record<EffortLevel, Partial<Record<string, number>>> = {
  leggero: {
    food: 0.18,
    transport: 0.10,
    shopping: 0.14,
    entertainment: 0.08,
    subscriptions: 0.05,
  },
  moderato: {}, // uses BASE_RATIOS
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

// Goal-specific overrides (applied AFTER effort, last wins)
const GOAL_OVERRIDES: Record<OnboardingGoalId, Partial<Record<string, number>>> = {
  risparmio: { shopping: 0.07, entertainment: 0.03 },
  casa: { home: 0.30, shopping: 0.07 },
  pensione: { education: 0.08, subscriptions: 0.02 },
  viaggio: { entertainment: 0.07, shopping: 0.08 },
  istruzione: { education: 0.10, entertainment: 0.03 },
  emergenza: {},
};

export function calculateBudgets(
  income: number,
  goals: OnboardingGoalId[],
  effortLevel: EffortLevel = 'moderato'
): StoredBudget[] {
  const ratios = { ...BASE_RATIOS };

  // Apply effort level
  const effortOverrides = EFFORT_RATIOS[effortLevel];
  for (const [cat, ratio] of Object.entries(effortOverrides)) {
    if (ratio !== undefined) ratios[cat] = ratio;
  }

  // Apply goal overrides
  for (const goal of goals) {
    const overrides = GOAL_OVERRIDES[goal];
    for (const [cat, ratio] of Object.entries(overrides)) {
      if (ratio !== undefined) ratios[cat] = ratio;
    }
  }

  return Object.entries(ratios).map(([category, ratio]) => ({
    id: `b_${category}`,
    category: category as StoredBudget['category'],
    limit: Math.round(income * ratio),
    period: 'monthly' as const,
  }));
}

export function getSavingsPotential(income: number, goals: OnboardingGoalId[], effortLevel: EffortLevel): number {
  const budgets = calculateBudgets(income, goals, effortLevel);
  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  return Math.max(0, income - totalBudget);
}
