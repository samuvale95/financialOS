import type { Transaction, StoredBudget } from '../types';
import { CATEGORIES } from '../constants/categories';

export interface ReconciliationResult {
  category: string;
  categoryName: string;
  estimatedMonthly: number;
  realMonthly: number;
  divergencePct: number;
  suggestion: 'increase' | 'decrease';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Compares current budget limits against the user's real spending history
 * and returns categories where the divergence exceeds `threshold` percent.
 *
 * Only categories with a budget limit > 0 and with actual spending data are
 * included. Results are sorted by divergence (highest first).
 */
export function reconcileProfile(
  transactions: Transaction[],
  currentBudgets: StoredBudget[],
  minMonths = 2,
  threshold = 20,
): ReconciliationResult[] {
  const expenseTxs = transactions.filter((t) => t.amount < 0 && t.category !== 'transfer');

  const monthsSet = new Set(expenseTxs.map((t) => t.date.slice(0, 7)));
  const monthsCount = monthsSet.size;

  if (monthsCount < minMonths) return [];

  const results: ReconciliationResult[] = [];

  for (const budget of currentBudgets) {
    if (budget.limit <= 0) continue;

    const categoryTxs = expenseTxs.filter((t) => t.category === budget.category);
    if (categoryTxs.length === 0) continue;

    const realTotal = categoryTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const realMonthly = realTotal / monthsCount;

    const divergencePct = Math.abs((realMonthly - budget.limit) / budget.limit) * 100;

    if (divergencePct <= threshold) continue;

    const confidence: ReconciliationResult['confidence'] =
      monthsCount >= 4 ? 'high' : monthsCount >= 3 ? 'medium' : 'low';

    const catLabel = CATEGORIES[budget.category as keyof typeof CATEGORIES]?.label ?? budget.category;

    results.push({
      category: budget.category,
      categoryName: catLabel,
      estimatedMonthly: Math.round(budget.limit),
      realMonthly: Math.round(realMonthly),
      divergencePct: Math.round(divergencePct),
      suggestion: realMonthly > budget.limit ? 'increase' : 'decrease',
      confidence,
    });
  }

  return results.sort((a, b) => b.divergencePct - a.divergencePct);
}
