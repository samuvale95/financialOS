import type { Transaction, Budget } from '../types';
import type { InsightProfile } from './insightProfile';
import type { CategoryId } from '../constants/categories';
import { CATEGORIES } from '../constants/categories';

export interface SpendingAnomaly {
  type: 'single_large' | 'daily_spike' | 'category_spike' | 'unusual_merchant';
  severity: 'low' | 'medium' | 'high';
  title: string;
  body: string;
  amount: number;
  date: string;
  category: string;
}

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

function isExpense(t: Transaction): boolean {
  return t.amount < 0 && t.category !== 'transfer';
}

function label(categoryId: string): string {
  return CATEGORIES[categoryId as CategoryId]?.label ?? categoryId;
}

function fmtDate(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
  });
}

// ── 1. Single-large ────────────────────────────────────────────────────────────

const SINGLE_LARGE_RATIO = 3;    // must exceed N× the category average monthly
const SINGLE_LARGE_FALLBACK = 200; // € when no trend history

function detectSingleLarge(
  expenses: Transaction[],
  profile: InsightProfile,
): SpendingAnomaly[] {
  const anomalies: SpendingAnomaly[] = [];

  for (const tx of expenses) {
    const abs = Math.abs(tx.amount);
    const cat = tx.category as string;
    const trend = profile.categoryTrends?.find((t) => t.category === cat);
    const avgMonthly = trend?.averageMonthly ?? 0;

    const threshold = avgMonthly > 0 ? SINGLE_LARGE_RATIO * avgMonthly : SINGLE_LARGE_FALLBACK;
    if (abs <= threshold) continue;

    const ratio = avgMonthly > 0 ? abs / avgMonthly : abs / SINGLE_LARGE_FALLBACK;

    let severity: SpendingAnomaly['severity'];
    if (ratio >= 10 || abs >= 1_000) severity = 'high';
    else if (ratio >= 5 || abs >= 500) severity = 'medium';
    else severity = 'low';

    const avgNote = avgMonthly > 0
      ? ` — ${ratio.toFixed(1)}× la media mensile di €${Math.round(avgMonthly)}`
      : '';

    anomalies.push({
      type: 'single_large',
      severity,
      title: `Spesa insolita in ${label(cat)}`,
      body: `€${Math.round(abs)} il ${fmtDate(tx.date)}${avgNote}.`,
      amount: abs,
      date: tx.date.slice(0, 10),
      category: cat,
    });
  }

  return anomalies;
}

// ── 2. Daily-spike ─────────────────────────────────────────────────────────────

const DAILY_SPIKE_RATIO = 2.5;
const DAILY_SPIKE_FALLBACK = 150; // € when no snapshot history

function detectDailySpike(
  expenses: Transaction[],
  profile: InsightProfile,
): SpendingAnomaly[] {
  // Historical daily average derived from monthly snapshots
  const snapshots = profile.monthlySnapshots ?? [];
  let historicalDailyAvg = 0;
  if (snapshots.length > 0) {
    const avgMonthlyExp =
      snapshots.reduce((s, snap) => s + snap.totalExpenses, 0) / snapshots.length;
    historicalDailyAvg = avgMonthlyExp / 30;
  }

  const threshold =
    historicalDailyAvg > 0 ? DAILY_SPIKE_RATIO * historicalDailyAvg : DAILY_SPIKE_FALLBACK;

  // Aggregate expenses by calendar day
  const byDay = new Map<string, number>();
  for (const tx of expenses) {
    const day = tx.date.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(tx.amount));
  }

  const anomalies: SpendingAnomaly[] = [];

  for (const [day, dayTotal] of byDay) {
    if (dayTotal <= threshold) continue;

    const ratio =
      historicalDailyAvg > 0 ? dayTotal / historicalDailyAvg : dayTotal / DAILY_SPIKE_FALLBACK;

    let severity: SpendingAnomaly['severity'];
    if (ratio >= 5 || dayTotal >= 500) severity = 'high';
    else if (ratio >= 3 || dayTotal >= 300) severity = 'medium';
    else severity = 'low';

    const avgNote =
      historicalDailyAvg > 0
        ? ` (${ratio.toFixed(1)}× la tua media di €${Math.round(historicalDailyAvg)}/giorno)`
        : '';

    anomalies.push({
      type: 'daily_spike',
      severity,
      title: `Giorno di spesa intensa: €${Math.round(dayTotal)}`,
      body: `Il ${fmtDate(day)} hai speso €${Math.round(dayTotal)}${avgNote}.`,
      amount: dayTotal,
      date: day,
      category: 'other',
    });
  }

  return anomalies;
}

// ── 3. Category-spike ──────────────────────────────────────────────────────────

const CATEGORY_SPIKE_PCT = 1.5; // 150% of averageMonthly

function detectCategorySpike(
  expenses: Transaction[],
  profile: InsightProfile,
): SpendingAnomaly[] {
  // Sum current-month expenses per category
  const currentByCategory = new Map<string, number>();
  for (const tx of expenses) {
    const cat = tx.category as string;
    currentByCategory.set(cat, (currentByCategory.get(cat) ?? 0) + Math.abs(tx.amount));
  }

  const today = new Date().toISOString().slice(0, 10);
  const anomalies: SpendingAnomaly[] = [];

  for (const trend of profile.categoryTrends ?? []) {
    if (trend.averageMonthly <= 0) continue;

    const current = currentByCategory.get(trend.category) ?? 0;
    if (current <= CATEGORY_SPIKE_PCT * trend.averageMonthly) continue;

    const pct = Math.round((current / trend.averageMonthly) * 100);

    let severity: SpendingAnomaly['severity'];
    if (pct >= 250) severity = 'high';
    else if (pct >= 200) severity = 'medium';
    else severity = 'low';

    const cat = trend.category;
    anomalies.push({
      type: 'category_spike',
      severity,
      title: `${label(cat)}: già al ${pct}% del solito`,
      body: `Hai già speso €${Math.round(current)} in ${label(cat).toLowerCase()} questo mese. La tua media è €${Math.round(trend.averageMonthly)}/mese.`,
      amount: current,
      date: today,
      category: cat,
    });
  }

  return anomalies;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Detects spending anomalies in the current month's transactions, using the
 * InsightProfile for historical averages. Returns results sorted by severity
 * (high → low) then by amount descending.
 *
 * @param currentMonthTx  All transactions for the month being analysed
 * @param profile         User's InsightProfile (monthlySnapshots + categoryTrends)
 * @param budgets         Current budgets (available for additional context)
 */
export function detectAnomalies(
  currentMonthTx: Transaction[],
  profile: InsightProfile,
  _budgets: Budget[],
): SpendingAnomaly[] {
  const expenses = currentMonthTx.filter(isExpense);

  const all: SpendingAnomaly[] = [
    ...detectSingleLarge(expenses, profile),
    ...detectDailySpike(expenses, profile),
    ...detectCategorySpike(expenses, profile),
  ];

  // Dedup: per (type, category, date) keep highest severity
  const seen = new Map<string, SpendingAnomaly>();
  for (const a of all) {
    const key = `${a.type}|${a.category}|${a.date}`;
    const prev = seen.get(key);
    if (!prev || SEVERITY_RANK[a.severity] < SEVERITY_RANK[prev.severity]) {
      seen.set(key, a);
    }
  }

  return [...seen.values()].sort((a, b) => {
    const sd = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return sd !== 0 ? sd : b.amount - a.amount;
  });
}
