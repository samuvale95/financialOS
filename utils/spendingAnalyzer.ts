import type { Transaction, Budget } from '../types';
import type { CategoryId } from '../constants/categories';
import { CATEGORIES } from '../constants/categories';

export interface MonthlySnapshot {
  month: string;           // YYYY-MM
  totalExpenses: number;
  monthIncome: number;
  savingsRate: number;     // 0–100
  topCategories: { category: CategoryId; label: string; color: string; icon: string; total: number }[];
}

export interface BudgetForecast {
  category: CategoryId;
  label: string;
  icon: string;
  color: string;
  monthTotal: number;
  budgetLimit: number;
  paceRatio: number;
  projectedEndOfMonth: number;
  daysUntilOverBudget: number | null;
  status: 'on_track' | 'at_risk' | 'over_pace';
  projectionMethod: 'linear' | 'weekday_weighted';
}

export interface MerchantStat {
  name: string;
  count: number;
  total: number;
}

export interface RecurringItem {
  description: string;
  amount: number;
  monthsDetected: number;
}

export interface CategoryAnalysis {
  category: CategoryId;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  monthTotal: number;
  budgetLimit: number;
  budgetProgress: number; // 0 to 1+
  status: 'ok' | 'warning' | 'over' | 'nobudget';
  prevMonthTotal: number;
  vsLastMonth: number; // % change; positive = more spending
  topMerchants: MerchantStat[];
  txCount: number;
  uniqueDays: number;
  weekendTotal: number;
  weekdayTotal: number;
  recurringItems: RecurringItem[];
  monthTx: Transaction[];
}

export interface ScoreFactor {
  label: string;
  points: number;
  max: number;
  icon: string;
  description?: string;
}

export interface SpendingAnalysis {
  categories: CategoryAnalysis[];
  problemCategories: CategoryAnalysis[];
  warningCategories: CategoryAnalysis[];
  score: number | null; // null when totalExpenses < 10 (insufficient data)
  scoreFactors: ScoreFactor[];
  totalExpenses: number;
  monthIncome: number;
  savingsRate: number;
  analysisMonth: string; // YYYY-MM
  isHistoricalMonth: boolean; // true when analysisMonth ≠ current calendar month
}

const EXPENSE_CATEGORY_IDS: CategoryId[] = [
  'groceries', 'restaurants', 'food',
  'fuel', 'public_transport', 'transport',
  'shopping', 'entertainment', 'sports',
  'health', 'pharmacy', 'rent', 'home',
  'utilities', 'insurance', 'subscriptions',
  'travel', 'education', 'beauty', 'pets', 'taxes', 'other',
];

// Transfers between own accounts — excluded from all expense metrics
const TRANSFER_CATEGORY: CategoryId = 'transfer';
function isExpense(t: { amount: number; category: string }): boolean {
  return t.amount < 0 && t.category !== TRANSFER_CATEGORY;
}

function getMonthPrefix(monthsAgo = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getPrevMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr).getDay();
  return day === 0 || day === 6;
}

function groupByMerchant(txs: Transaction[]): MerchantStat[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const tx of txs) {
    const key = (tx.merchant || tx.description).trim().slice(0, 35);
    const existing = map.get(key) ?? { count: 0, total: 0 };
    map.set(key, { count: existing.count + 1, total: existing.total + Math.abs(tx.amount) });
  }
  return Array.from(map.entries())
    .map(([name, { count, total }]) => ({ name, count, total }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 5);
}

function normalizeDesc(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 24);
}

function detectRecurring(category: CategoryId, allTx: Transaction[]): RecurringItem[] {
  const months = [getMonthPrefix(0), getMonthPrefix(1), getMonthPrefix(2)];

  // Map: normalizedKey → { original, seen months, amounts }
  const map = new Map<string, { original: string; seenMonths: Set<number>; amounts: number[] }>();

  for (let mi = 0; mi < months.length; mi++) {
    const prefix = months[mi];
    const monthTxs = allTx.filter(
      (t) => t.category === category && t.amount < 0 && t.date.startsWith(prefix)
    );
    for (const tx of monthTxs) {
      const key = normalizeDesc(tx.merchant || tx.description);
      if (!key || key.length < 3) continue;
      const entry = map.get(key);
      if (entry) {
        if (!entry.seenMonths.has(mi)) {
          entry.seenMonths.add(mi);
          entry.amounts.push(Math.abs(tx.amount));
        }
      } else {
        map.set(key, {
          original: (tx.merchant || tx.description).slice(0, 30),
          seenMonths: new Set([mi]),
          amounts: [Math.abs(tx.amount)],
        });
      }
    }
  }

  return Array.from(map.values())
    .filter((v) => v.seenMonths.size >= 2)
    .map((v) => ({
      description: v.original,
      amount: v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length,
      monthsDetected: v.seenMonths.size,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function computeScore(
  problemCategories: CategoryAnalysis[],
  warningCategories: CategoryAnalysis[],
  savingsRate: number,
  totalExpenses: number,
  lastMonthExpenses: number,
  monthIncome: number,
  allCategories: CategoryAnalysis[],
): { score: number | null; factors: ScoreFactor[] } {
  // Insufficient data — skip computation entirely
  if (totalExpenses < 10) return { score: null, factors: [] };

  const factors: ScoreFactor[] = [];
  let score = 0; // baseline: earned, not assumed

  // Savings rate: 0–25 pts (skip when income unknown)
  if (monthIncome > 0) {
    const savingsPts = Math.min(25, Math.round(Math.max(0, savingsRate) * 0.83));
    factors.push({
      label: 'Risparmio',
      points: savingsPts,
      max: 25,
      icon: 'trending-up',
      description: `Tasso di risparmio ${Math.round(savingsRate)}%`,
    });
    score += savingsPts;
  }

  // Budget adherence: –5 per over-budget, –2 per warning, clamped at –20
  const budgetPenalty = Math.max(-20, -(problemCategories.length * 5 + warningCategories.length * 2));
  factors.push({
    label: 'Budget',
    points: budgetPenalty,
    max: 0,
    icon: 'pie-chart',
    description: budgetPenalty < 0
      ? `${problemCategories.length} categorie sforat${problemCategories.length === 1 ? 'a' : 'e'}`
      : 'Nessun budget sforato',
  });
  score += budgetPenalty;

  // Improving trend vs last month (graded)
  let trendPts = 0;
  let trendDescription = 'Nessun dato mese precedente';
  if (lastMonthExpenses > 0) {
    const changePct = ((totalExpenses - lastMonthExpenses) / lastMonthExpenses) * 100;
    if (changePct < -5) {
      trendPts = 10;
      trendDescription = `Spese -${Math.round(-changePct)}% vs mese scorso`;
    } else if (changePct < -1) {
      trendPts = 5;
      trendDescription = `Spese -${Math.round(-changePct)}% vs mese scorso`;
    } else {
      trendDescription = `Spese ${changePct >= 0 ? '+' : ''}${Math.round(changePct)}% vs mese scorso`;
    }
  }
  factors.push({ label: 'Tendenza', points: trendPts, max: 10, icon: 'analytics', description: trendDescription });
  score += trendPts;

  // No-crisis bonus: +5 if no category exceeds 120% of its budget
  const noCrisisPts = allCategories.every((c) => c.budgetLimit === 0 || c.budgetProgress <= 1.2) ? 5 : 0;
  factors.push({
    label: 'Controllo',
    points: noCrisisPts,
    max: 5,
    icon: 'shield-checkmark',
    description: noCrisisPts > 0 ? 'Nessuna categoria oltre 120%' : 'Almeno una categoria oltre 120%',
  });
  score += noCrisisPts;

  return { score: Math.min(100, Math.max(0, score)), factors };
}

/**
 * Projects end-of-month category spend using weekday vs weekend daily averages.
 * More accurate than a plain linear projection when spending patterns differ
 * between working days and the weekend.
 *
 * @param monthTx     Expense transactions for the category in the current month
 * @param daysElapsed Days elapsed so far (≥ 1)
 * @param daysInMonth Total days in the current month
 * @param today       Current date (used to classify each remaining day)
 * @returns           Projected total spend by end of month (already-spent + remaining)
 */
function getWeekdayWeightedProjection(
  monthTx: Transaction[],
  daysElapsed: number,
  daysInMonth: number,
  today: Date,
): number {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  // Count elapsed weekday and weekend calendar days (1 … daysElapsed)
  let elapsedWeekdays = 0;
  let elapsedWeekendDays = 0;
  for (let d = 1; d <= daysElapsed; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow === 0 || dow === 6) elapsedWeekendDays++;
    else elapsedWeekdays++;
  }

  // Count remaining weekday and weekend calendar days (daysElapsed+1 … daysInMonth)
  let remWeekdays = 0;
  let remWeekendDays = 0;
  for (let d = daysElapsed + 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow === 0 || dow === 6) remWeekendDays++;
    else remWeekdays++;
  }

  // Classify transaction spend by weekday / weekend
  let weekdayTotal = 0;
  let weekendTotal = 0;
  for (const tx of monthTx) {
    const dow = new Date(tx.date + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) weekendTotal += Math.abs(tx.amount);
    else weekdayTotal += Math.abs(tx.amount);
  }

  // Average daily spend per type; fall back to global rate if a type has no elapsed days
  const globalDailyRate = (weekdayTotal + weekendTotal) / daysElapsed;
  const avgWeekday = elapsedWeekdays > 0 ? weekdayTotal / elapsedWeekdays : globalDailyRate;
  const avgWeekend = elapsedWeekendDays > 0 ? weekendTotal / elapsedWeekendDays : globalDailyRate;

  const alreadySpent = weekdayTotal + weekendTotal; // identical to monthTotal
  return alreadySpent + remWeekdays * avgWeekday + remWeekendDays * avgWeekend;
}

export function getBudgetForecast(budgets: Budget[], transactions: Transaction[]): BudgetForecast[] {
  const thisMonth = getMonthPrefix(0);
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, today.getDate());

  const monthTx = transactions.filter((t) => t.date.startsWith(thisMonth) && isExpense(t));

  const useWeighted = daysElapsed >= 7;

  return budgets
    .filter((b) => b.limit > 0)
    .map((b) => {
      const cat = CATEGORIES[b.category];
      const catMonthTx = monthTx.filter((t) => t.category === b.category);
      const monthTotal = catMonthTx.reduce((s, t) => s + Math.abs(t.amount), 0);
      if (monthTotal === 0) return null;

      const fractionUsed = monthTotal / b.limit;
      const fractionElapsed = daysElapsed / daysInMonth;
      const paceRatio = fractionUsed / fractionElapsed;
      const dailyRate = monthTotal / daysElapsed;

      const projectedEndOfMonth = useWeighted
        ? getWeekdayWeightedProjection(catMonthTx, daysElapsed, daysInMonth, today)
        : dailyRate * daysInMonth;

      const projectionMethod: BudgetForecast['projectionMethod'] =
        useWeighted ? 'weekday_weighted' : 'linear';

      let daysUntilOverBudget: number | null = null;
      if (paceRatio > 1 && dailyRate > 0) {
        daysUntilOverBudget = Math.max(0, Math.floor((b.limit - monthTotal) / dailyRate));
      }

      const status: BudgetForecast['status'] =
        paceRatio > 1.2 ? 'over_pace' : paceRatio > 0.9 ? 'at_risk' : 'on_track';

      return {
        category: b.category,
        label: cat?.label ?? b.category,
        icon: cat?.icon ?? 'help-circle',
        color: cat?.color ?? '#888',
        monthTotal,
        budgetLimit: b.limit,
        paceRatio,
        projectedEndOfMonth,
        daysUntilOverBudget,
        status,
        projectionMethod,
      } satisfies BudgetForecast;
    })
    .filter((f): f is BudgetForecast => f !== null && (f.status === 'at_risk' || f.status === 'over_pace'))
    .sort((a, b) => b.paceRatio - a.paceRatio);
}

export function analyzeHistory(
  transactions: Transaction[],
  budgets: Budget[],
  months = 6,
): MonthlySnapshot[] {
  const result: MonthlySnapshot[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const month = getMonthPrefix(i);
    const monthTx = transactions.filter((t) => t.date.startsWith(month));

    const monthIncome = monthTx
      .filter((t) => t.amount > 0 && t.category !== TRANSFER_CATEGORY)
      .reduce((s, t) => s + t.amount, 0);

    const totalExpenses = monthTx
      .filter(isExpense)
      .reduce((s, t) => s + Math.abs(t.amount), 0);

    const savingsRate =
      monthIncome > 0 ? Math.max(0, ((monthIncome - totalExpenses) / monthIncome) * 100) : 0;

    // Top 3 expense categories by total
    const catTotals = new Map<CategoryId, number>();
    for (const tx of monthTx) {
      if (!isExpense(tx)) continue;
      const cat = tx.category as CategoryId;
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + Math.abs(tx.amount));
    }
    const topCategories = Array.from(catTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, total]) => {
        const cat = CATEGORIES[category];
        return {
          category,
          label: cat?.label ?? category,
          color: cat?.color ?? '#888',
          icon: cat?.icon ?? 'help-circle',
          total,
        };
      });

    result.push({ month, totalExpenses, monthIncome, savingsRate, topCategories });
  }

  return result;
}

export function analyzeAllHistory(
  transactions: Transaction[],
  budgets: Budget[],
): MonthlySnapshot[] {
  const months = [
    ...new Set(
      transactions
        .filter((t) => t.category !== 'transfer' || t.amount > 0)
        .map((t) => t.date.slice(0, 7)),
    ),
  ].sort(); // oldest → newest

  return months.map((month) => {
    const monthTx = transactions.filter((t) => t.date.startsWith(month));
    const monthIncome = monthTx
      .filter((t) => t.amount > 0 && t.category !== 'transfer')
      .reduce((s, t) => s + t.amount, 0);
    const totalExpenses = monthTx.filter(isExpense).reduce((s, t) => s + Math.abs(t.amount), 0);
    const savingsRate =
      monthIncome > 0 ? Math.max(0, ((monthIncome - totalExpenses) / monthIncome) * 100) : 0;

    const catTotals = new Map<CategoryId, number>();
    for (const tx of monthTx) {
      if (!isExpense(tx)) continue;
      catTotals.set(
        tx.category as CategoryId,
        (catTotals.get(tx.category as CategoryId) ?? 0) + Math.abs(tx.amount),
      );
    }
    const topCategories = Array.from(catTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, total]) => {
        const cat = CATEGORIES[category];
        return {
          category,
          label: cat?.label ?? category,
          color: cat?.color ?? '#888',
          icon: cat?.icon ?? 'help-circle',
          total,
        };
      });

    return { month, totalExpenses, monthIncome, savingsRate, topCategories };
  });
}

export function analyzeSpending(
  transactions: Transaction[],
  budgets: Budget[],
  month?: string,
): SpendingAnalysis {
  let thisMonth: string;
  let lastMonth: string;

  if (month) {
    thisMonth = month;
    lastMonth = getPrevMonthStr(month);
  } else {
    const nowMonth = getMonthPrefix(0);
    const hasCurrentMonth = transactions.some(
      (t) => t.date.startsWith(nowMonth) && t.category !== 'transfer',
    );
    thisMonth =
      !hasCurrentMonth && transactions.length > 0
        ? ([
            ...new Set(
              transactions.filter((t) => t.category !== 'transfer').map((t) => t.date.slice(0, 7)),
            ),
          ]
            .sort()
            .at(-1) ?? nowMonth)
        : nowMonth;
    lastMonth = getPrevMonthStr(thisMonth);
  }

  const thisMonthTx = transactions.filter((t) => t.date.startsWith(thisMonth));
  const lastMonthTx = transactions.filter((t) => t.date.startsWith(lastMonth));

  const monthIncome = thisMonthTx.filter((t) => t.amount > 0 && t.category !== TRANSFER_CATEGORY).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = thisMonthTx
    .filter(isExpense)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const savingsRate = monthIncome > 0 ? ((monthIncome - totalExpenses) / monthIncome) * 100 : 0;
  const lastMonthExpenses = lastMonthTx
    .filter(isExpense)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const categories: CategoryAnalysis[] = EXPENSE_CATEGORY_IDS.map((category) => {
    const cat = CATEGORIES[category];
    const budget = budgets.find((b) => b.category === category);
    const monthTx = thisMonthTx.filter((t) => t.category === category && t.amount < 0);
    const prevTx = lastMonthTx.filter((t) => t.category === category && t.amount < 0);

    const monthTotal = monthTx.reduce((s, t) => s + Math.abs(t.amount), 0);
    const prevMonthTotal = prevTx.reduce((s, t) => s + Math.abs(t.amount), 0);
    const budgetLimit = budget?.limit ?? 0;
    const budgetProgress = budgetLimit > 0 ? monthTotal / budgetLimit : 0;

    let status: CategoryAnalysis['status'] = 'nobudget';
    if (budgetLimit > 0) {
      if (budgetProgress >= 1) status = 'over';
      else if (budgetProgress >= 0.75) status = 'warning';
      else status = 'ok';
    }

    const vsLastMonth =
      prevMonthTotal > 0 ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100 : 0;

    const uniqueDays = new Set(monthTx.map((t) => t.date)).size;
    const weekendTotal = monthTx
      .filter((t) => isWeekend(t.date))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const weekdayTotal = monthTx
      .filter((t) => !isWeekend(t.date))
      .reduce((s, t) => s + Math.abs(t.amount), 0);

    const shouldDetectRecurring =
      category === 'subscriptions' || (monthTx.length >= 2 && prevTx.length >= 2);
    const recurringItems = shouldDetectRecurring ? detectRecurring(category, transactions) : [];

    return {
      category,
      label: cat.label,
      icon: cat.icon,
      color: cat.color,
      bgColor: cat.bgColor,
      monthTotal,
      budgetLimit,
      budgetProgress,
      status,
      prevMonthTotal,
      vsLastMonth,
      topMerchants: groupByMerchant(monthTx),
      txCount: monthTx.length,
      uniqueDays,
      weekendTotal,
      weekdayTotal,
      recurringItems,
      monthTx,
    };
  });

  const problemCategories = categories
    .filter((c) => c.status === 'over' && c.monthTotal > 0)
    .sort((a, b) => b.budgetProgress - a.budgetProgress);
  const warningCategories = categories
    .filter((c) => c.status === 'warning')
    .sort((a, b) => b.budgetProgress - a.budgetProgress);

  const { score, factors } = computeScore(
    problemCategories,
    warningCategories,
    savingsRate,
    totalExpenses,
    lastMonthExpenses,
    monthIncome,
    categories,
  );

  return {
    categories,
    problemCategories,
    warningCategories,
    score,
    scoreFactors: factors,
    totalExpenses,
    monthIncome,
    savingsRate,
    analysisMonth: thisMonth,
    isHistoricalMonth: thisMonth !== getMonthPrefix(0),
  };
}
