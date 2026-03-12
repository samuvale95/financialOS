import type { InsightProfile, MonthlyBehaviorSnapshot, CategoryTrend } from './insightProfile';
import type { SpendingAnalysis } from './spendingAnalyzer';

const MAX_SNAPSHOTS = 12;

/**
 * EWMA weight for new observations when updating categoryTrends.
 * α = 0.3 means the new month contributes 30% of the running average.
 */
const TREND_ALPHA = 0.3;

/**
 * Threshold (fraction of average) to classify a category as increasing/decreasing.
 * e.g. 0.10 means the current month must be >10% above/below the EWMA.
 */
const TREND_THRESHOLD = 0.10;

function buildSnapshot(analysis: SpendingAnalysis): MonthlyBehaviorSnapshot {
  const topCategories = [...analysis.categories]
    .filter((c) => c.monthTotal > 0)
    .sort((a, b) => b.monthTotal - a.monthTotal)
    .slice(0, 3)
    .map((c) => c.category as string);

  return {
    month: analysis.analysisMonth,
    savingsRate: analysis.savingsRate,
    totalExpenses: analysis.totalExpenses,
    topCategories,
    scoreValue: analysis.score,
  };
}

function updateCategoryTrends(
  existingTrends: CategoryTrend[],
  analysis: SpendingAnalysis,
): CategoryTrend[] {
  const next = new Map<string, CategoryTrend>(
    existingTrends.map((t) => [t.category, { ...t }]),
  );

  for (const ca of analysis.categories) {
    if (ca.monthTotal <= 0) continue;

    const existing = next.get(ca.category as string);
    let avg: number;

    if (!existing) {
      // First observation: no trend direction yet — set stable
      avg = ca.monthTotal;
    } else {
      // Exponential weighted moving average
      avg = (1 - TREND_ALPHA) * existing.averageMonthly + TREND_ALPHA * ca.monthTotal;
    }

    let trend: CategoryTrend['trend'];
    if (ca.monthTotal > avg * (1 + TREND_THRESHOLD)) {
      trend = 'increasing';
    } else if (ca.monthTotal < avg * (1 - TREND_THRESHOLD)) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    next.set(ca.category as string, {
      category: ca.category as string,
      averageMonthly: Math.round(avg * 100) / 100,
      trend,
      lastUpdated: analysis.analysisMonth,
    });
  }

  return Array.from(next.values());
}

/**
 * Updates the InsightProfile with a new monthly snapshot and refreshed category trends.
 * Idempotent: if a snapshot for analysis.analysisMonth already exists, returns profile unchanged.
 */
export function updateProfileAfterMonth(
  profile: InsightProfile,
  analysis: SpendingAnalysis,
): InsightProfile {
  const existingSnapshots = profile.monthlySnapshots ?? [];

  // Idempotent: skip if snapshot for this month already exists
  if (existingSnapshots.some((s) => s.month === analysis.analysisMonth)) {
    return profile;
  }

  // Add new snapshot, keep at most MAX_SNAPSHOTS (FIFO: oldest dropped)
  const newSnapshot = buildSnapshot(analysis);
  const updatedSnapshots: MonthlyBehaviorSnapshot[] = [
    ...existingSnapshots,
    newSnapshot,
  ].slice(-MAX_SNAPSHOTS);

  const updatedTrends = updateCategoryTrends(profile.categoryTrends ?? [], analysis);

  return {
    ...profile,
    monthlySnapshots: updatedSnapshots,
    categoryTrends: updatedTrends,
    lastProfileUpdate: analysis.analysisMonth,
  };
}
