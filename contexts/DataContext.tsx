import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { Transaction, Budget, Asset, Goal, MonthSummary, Insight, StoredBudget, BankAccount, Subscription } from '../types';
import type { ParseResult } from '../utils/parsers';
import { sendImportNotification } from '../utils/notifications';
import type { CategoryId } from '../constants/categories';
import { CATEGORIES } from '../constants/categories';
import {
  loadTransactions, saveTransactions,
  loadStoredBudgets, saveStoredBudgets,
  loadAssets, saveAssets,
  loadGoals, saveGoals,
  loadAccounts, saveAccounts,
  loadSubscriptions, saveSubscriptions,
  loadMerchantRules, saveMerchantRules,
  loadBrandRules, saveBrandRules,
  loadInsightProfile, saveInsightProfile,
  loadOnboardingData,
  clearAllData,
} from '../utils/storage';
import { calculateBudgets } from '../utils/budgetCalculator';
import type { BudgetContext } from '../utils/budgetCalculator';
import { refreshAssetIfStale } from '../utils/financialApi';
import { getMerchantKey, getTaxInfo } from '../utils/categorizer';
import { resolveCategory } from '../utils/categoryResolver';
import type { InsightProfile } from '../utils/insightProfile';
import { EMPTY_PROFILE } from '../utils/insightProfile';
import { analyzeSpending } from '../utils/spendingAnalyzer';
import { updateProfileAfterMonth } from '../utils/profileUpdater';
import { reconcileProfile } from '../utils/profileReconciler';
import type { ReconciliationResult } from '../utils/profileReconciler';

const DEFAULT_BUDGET_LIMITS: StoredBudget[] = [
  { id: 'b_groceries', category: 'groceries', limit: 300, period: 'monthly' },
  { id: 'b_restaurants', category: 'restaurants', limit: 120, period: 'monthly' },
  { id: 'b_fuel', category: 'fuel', limit: 80, period: 'monthly' },
  { id: 'b_public_transport', category: 'public_transport', limit: 60, period: 'monthly' },
  { id: 'b_shopping', category: 'shopping', limit: 200, period: 'monthly' },
  { id: 'b_entertainment', category: 'entertainment', limit: 80, period: 'monthly' },
  { id: 'b_sports', category: 'sports', limit: 60, period: 'monthly' },
  { id: 'b_health', category: 'health', limit: 80, period: 'monthly' },
  { id: 'b_pharmacy', category: 'pharmacy', limit: 40, period: 'monthly' },
  { id: 'b_subscriptions', category: 'subscriptions', limit: 50, period: 'monthly' },
  { id: 'b_utilities', category: 'utilities', limit: 250, period: 'monthly' },
  { id: 'b_insurance', category: 'insurance', limit: 80, period: 'monthly' },
  { id: 'b_education', category: 'education', limit: 100, period: 'monthly' },
];

function getCurrentMonthPrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function computeInsights(
  budgets: Budget[],
  monthSummary: MonthSummary,
  transactions: Transaction[]
): Insight[] {
  const insights: Insight[] = [];

  budgets.forEach((b) => {
    const cat = CATEGORIES[b.category];
    const progress = b.limit > 0 ? b.spent / b.limit : 0;
    if (progress >= 1) {
      insights.push({
        id: `ins_over_${b.id}`,
        type: 'alert',
        title: `${cat.label} oltre budget`,
        body: `Hai speso €${b.spent.toFixed(0)} di €${b.limit} nel budget ${cat.label}. Sei al ${Math.round(progress * 100)}% del limite mensile.`,
        action: 'Vedi transazioni',
        icon: 'warning',
        category: b.category as CategoryId,
      });
    } else if (progress >= 0.7) {
      insights.push({
        id: `ins_warn_${b.id}`,
        type: 'warning',
        title: `${cat.label} vicino al limite`,
        body: `Hai usato il ${Math.round(progress * 100)}% del budget ${cat.label} (€${b.spent.toFixed(0)} di €${b.limit}).`,
        action: 'Vedi transazioni',
        icon: 'alert-circle',
        category: b.category as CategoryId,
      });
    }
  });

  if (monthSummary.savingsRate >= 20) {
    insights.push({
      id: 'ins_savings_ok',
      type: 'positive',
      title: 'Ottimo tasso di risparmio',
      body: `Questo mese stai risparmiando il ${monthSummary.savingsRate.toFixed(0)}% del reddito. Continua così!`,
      action: 'Vedi dettagli',
      icon: 'trending-up',
    });
  } else if (monthSummary.income > 0 && monthSummary.savingsRate < 10) {
    insights.push({
      id: 'ins_savings_low',
      type: 'warning',
      title: 'Risparmio basso',
      body: `Il tuo tasso di risparmio è del ${monthSummary.savingsRate.toFixed(0)}%. Prova a ridurre le spese non essenziali.`,
      action: 'Vedi transazioni',
      icon: 'alert-circle',
    });
  }

  if (transactions.length === 0) {
    insights.push({
      id: 'ins_empty',
      type: 'tip',
      title: 'Importa i tuoi dati',
      body: 'Aggiungi le tue transazioni per ricevere analisi personalizzate e insight sul tuo andamento finanziario.',
      action: 'Importa dati',
      icon: 'bulb',
    });
  }

  return insights;
}

interface AppData {
  transactions: Transaction[];
  budgets: Budget[];
  assets: Asset[];
  goals: Goal[];
  accounts: BankAccount[];
  subscriptions: Subscription[];
  monthSummary: MonthSummary;
  insights: Insight[];
  insightProfile: InsightProfile;
  isLoading: boolean;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  addTransactions: (ts: Omit<Transaction, 'id'>[]) => number;
  setBudgetLimit: (category: CategoryId, limit: number) => void;
  addAsset: (a: Omit<Asset, 'id'>) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
  addGoal: (g: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addAccount: (a: Omit<BankAccount, 'id'>, presetId?: string) => void;
  updateAccount: (id: string, updates: Partial<BankAccount>) => void;
  deleteAccount: (id: string) => void;
  addSubscription: (s: Omit<Subscription, 'id'>) => void;
  updateSubscription: (id: string, updates: Partial<Subscription>) => void;
  deleteSubscription: (id: string) => void;
  merchantRules: Record<string, CategoryId>;
  brandRules: Record<string, CategoryId>;
  setMerchantRule: (merchantKey: string, category: CategoryId) => void;
  /** Save merchant rule without re-categorizing existing transactions (use after selective bulk update). */
  registerMerchantRule: (merchantKey: string, category: CategoryId) => void;
  /** Save brand-level rule learned from a user correction. */
  setBrandRule: (brand: string, category: CategoryId) => void;
  updateTransactionCategories: (ids: string[], category: CategoryId) => void;
  refreshAssetPrices: () => Promise<void>;
  answerQuestion: (questionId: string, tag: string) => void;
  dismissQuestion: (questionId: string) => void;
  refreshInsightProfile: () => void;
  budgetReconciliation: ReconciliationResult[];
  resetAll: () => Promise<void>;
  importJobs: ImportJob[];
  enqueueImport: (files: { uri: string; name: string }[], parseFn: (uri: string, name: string) => Promise<ParseResult>) => void;
  clearImportJobs: () => void;
}

export interface ImportJob {
  id: string;
  fileName: string;
  uri: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  addedCount?: number;
  error?: string;
  warning?: string;
}

const DataContext = createContext<AppData | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [storedBudgets, setStoredBudgets] = useState<StoredBudget[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [merchantRules, setMerchantRulesState] = useState<Record<string, CategoryId>>({});
  const [brandRules, setBrandRulesState] = useState<Record<string, CategoryId>>({});
  const [insightProfile, setInsightProfile] = useState<InsightProfile>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const parseJobFnsRef = useRef<Map<string, (uri: string, name: string) => Promise<ParseResult>>>(new Map());
  const notificationSentRef = useRef(false);
  /** Mirrors `transactions` state; updated synchronously by addTransactionsCore so that
   *  back-to-back queue tasks each see the accumulated result of the previous one. */
  const transactionsRef = useRef<Transaction[]>([]);
  /** Serialises batch-import writes so concurrent parse jobs never dedup against stale state. */
  const importQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Usiamo useRef per evitare stale closure negli import asincroni: i job catturano
  // addTransactionsCore una volta sola, ma le regole merchant/brand possono cambiare
  // a runtime (es. dopo che l'AI ha imparato nuove regole durante lo stesso import).
  // I ref vengono aggiornati ad ogni render prima che il job legga i valori.
  const merchantRulesRef = useRef(merchantRules);
  const brandRulesRef = useRef(brandRules);

  useEffect(() => {
    Promise.all([
      loadTransactions(),
      loadStoredBudgets(),
      loadAssets(),
      loadGoals(),
      loadAccounts(),
      loadSubscriptions(),
      loadMerchantRules(),
      loadBrandRules(),
      loadInsightProfile(),
    ]).then(async ([txs, buds, ass, gls, accs, subs, rules, brules, profile]) => {
      setTransactions(txs);
      transactionsRef.current = txs;
      // Deduplicate assets by id in case of corrupted storage
      const seenAssets = new Set<string>();
      const dedupedAssets = ass.filter((a) => {
        if (seenAssets.has(a.id)) return false;
        seenAssets.add(a.id);
        return true;
      });
      setAssets(dedupedAssets);
      setGoals(gls);
      setAccounts(accs);
      setSubscriptions(subs);
      setMerchantRulesState(rules as Record<string, CategoryId>);
      setBrandRulesState(brules as Record<string, CategoryId>);
      setInsightProfile(profile);
      // Inizializza budgets: preferisci budgetCalculator se onboarding completato
      let effectiveBuds: StoredBudget[];
      if (buds.length > 0) {
        effectiveBuds = buds;
      } else {
        const onboarding = await loadOnboardingData();
        const income = onboarding.monthlyIncome ?? 0;
        if (onboarding.completed && income > 0) {
          const ctx: BudgetContext = {
            householdSize: onboarding.userProfile?.householdSize,
            housingType: onboarding.housingInfo?.type ?? null,
            housingMonthlyCost: onboarding.housingInfo?.monthlyCost,
            region: onboarding.userProfile?.region ?? null,
            dependents: onboarding.userProfile?.dependents,
            lifestyleProfile: onboarding.lifestyleProfile,
          };
          effectiveBuds = calculateBudgets(
            income,
            onboarding.goals ?? [],
            onboarding.effortLevel ?? 'moderato',
            ctx,
          );
        } else {
          effectiveBuds = DEFAULT_BUDGET_LIMITS;
        }
        saveStoredBudgets(effectiveBuds);
      }
      setStoredBudgets(effectiveBuds);

      // Refresh insight profile if it hasn't been updated for the current analysis month
      const budgetsForAnalysis: Budget[] = effectiveBuds.map((b) => ({ ...b, spent: 0 }));
      const initAnalysis = analyzeSpending(txs, budgetsForAnalysis);
      if (
        initAnalysis.totalExpenses >= 10 &&
        (!profile.lastProfileUpdate || profile.lastProfileUpdate < initAnalysis.analysisMonth)
      ) {
        const updatedProfile = updateProfileAfterMonth(profile, initAnalysis);
        setInsightProfile(updatedProfile);
        saveInsightProfile(updatedProfile);
      }

      setIsLoading(false);
    });
  }, []);

  // Keep transactionsRef in sync when other code (setMerchantRule, updateTransactionCategories,
  // resetAll) changes the transactions state via functional updaters.
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);
  useEffect(() => { merchantRulesRef.current = merchantRules; }, [merchantRules]);
  useEffect(() => { brandRulesRef.current = brandRules; }, [brandRules]);

  const budgets = useMemo<Budget[]>(() => {
    const prefix = getCurrentMonthPrefix();
    return storedBudgets.map((sb) => ({
      ...sb,
      spent: transactions
        .filter((t) => t.category === sb.category && t.amount < 0 && t.date.startsWith(prefix))
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    }));
  }, [storedBudgets, transactions]);

  const budgetReconciliation = useMemo<ReconciliationResult[]>(
    () => reconcileProfile(transactions, storedBudgets, 2, 20),
    [transactions, storedBudgets],
  );

  const monthSummary = useMemo<MonthSummary>(() => {
    const prefix = getCurrentMonthPrefix();
    const monthTx = transactions.filter((t) => t.date.startsWith(prefix) && !t.isTransfer);
    const income = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = monthTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    const portfolioValue = assets.reduce((s, a) => s + a.quantity * a.currentPrice, 0);
    const accountsBalance = accounts.reduce((s, a) => s + a.balance, 0);
    const netWorth = portfolioValue + accountsBalance;
    return { netWorth, income, expenses, savings, savingsRate };
  }, [transactions, assets, accounts]);

  const insights = useMemo(() => computeInsights(budgets, monthSummary, transactions), [
    budgets,
    monthSummary,
    transactions,
  ]);

  const addTransaction = useCallback((t: Omit<Transaction, 'id'>) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setTransactions((prev) => {
      const next = [{ ...t, id }, ...prev].sort((a, b) => b.date.localeCompare(a.date));
      saveTransactions(next);
      return next;
    });
  }, []);

  /**
   * Core dedup+insert logic. Reads from transactionsRef synchronously so that
   * back-to-back calls (serialised by the import queue) each see the accumulated
   * state — not just the last React-committed snapshot.
   */
  const addTransactionsCore = useCallback((ts: Omit<Transaction, 'id'>[]): number => {
    const prev = transactionsRef.current;
    const txKey = (date: string, amount: number, desc: string) =>
      `${date}|${amount.toFixed(2)}|${desc.trim().toLowerCase().slice(0, 30)}`;
    const existingKeys = new Set(prev.map((t) => txKey(t.date, t.amount, t.description)));
    const newOnes = ts
      .filter((t) => !existingKeys.has(txKey(t.date, t.amount, t.description)))
      .map((t) => {
        const effectiveCategory = resolveCategory(
          { description: t.description, merchant: t.merchant, aiCategory: t.category },
          merchantRulesRef.current,
          brandRulesRef.current,
        );
        const taxInfo = getTaxInfo(t.description, effectiveCategory);
        return {
          ...t,
          category: effectiveCategory,
          ...taxInfo,
          id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        };
      });
    const added = newOnes.length;
    const next = [...newOnes, ...prev].sort((a, b) => b.date.localeCompare(a.date));
    // Update ref immediately — before setTransactions — so the next queued call
    // reads the fully-merged list even if React hasn't re-rendered yet.
    transactionsRef.current = next;
    setTransactions(next);
    saveTransactions(next);
    return added;
  }, []); // refs are stable — no deps needed

  /** Enqueues a batch insert onto the serial import queue. Resolves with the exact
   *  number of new (non-duplicate) transactions actually inserted. */
  const addTransactionsAsync = useCallback((ts: Omit<Transaction, 'id'>[]): Promise<number> => {
    let added = 0;
    const task = importQueueRef.current.then(async () => {
      added = addTransactionsCore(ts);
    });
    importQueueRef.current = task.then(() => {});
    return task.then(() => added);
  }, [addTransactionsCore]);

  /** Public sync API — used for single manual adds from the UI.
   *  Calls addTransactionsCore directly (no queue needed for single operations). */
  const addTransactions = useCallback((ts: Omit<Transaction, 'id'>[]): number => {
    return addTransactionsCore(ts);
  }, [addTransactionsCore]);

  const setBudgetLimit = useCallback((category: CategoryId, limit: number) => {
    setStoredBudgets((prev) => {
      const exists = prev.find((b) => b.category === category);
      const next = exists
        ? prev.map((b) => (b.category === category ? { ...b, limit } : b))
        : [...prev, { id: `b_${category}`, category, limit, period: 'monthly' as const }];
      saveStoredBudgets(next);
      return next;
    });
  }, []);

  const addAsset = useCallback((a: Omit<Asset, 'id'>) => {
    setAssets((prev) => {
      const next = [...prev, { ...a, id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
      saveAssets(next);
      return next;
    });
  }, []);

  const updateAsset = useCallback((id: string, updates: Partial<Asset>) => {
    setAssets((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, ...updates } : a));
      saveAssets(next);
      return next;
    });
  }, []);

  const addGoal = useCallback((g: Omit<Goal, 'id'>) => {
    setGoals((prev) => {
      const next = [...prev, { ...g, id: `g_${Date.now()}` }];
      saveGoals(next);
      return next;
    });
  }, []);

  const updateGoal = useCallback((id: string, updates: Partial<Goal>) => {
    setGoals((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, ...updates } : g));
      saveGoals(next);
      return next;
    });
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) => {
      const next = prev.filter((g) => g.id !== id);
      saveGoals(next);
      return next;
    });
  }, []);

  const addSubscription = useCallback((s: Omit<Subscription, 'id'>) => {
    setSubscriptions((prev) => {
      const next = [...prev, { ...s, id: `sub_${Date.now()}` }];
      saveSubscriptions(next);
      return next;
    });
  }, []);

  const updateSubscription = useCallback((id: string, updates: Partial<Subscription>) => {
    setSubscriptions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      saveSubscriptions(next);
      return next;
    });
  }, []);

  const deleteSubscription = useCallback((id: string) => {
    setSubscriptions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSubscriptions(next);
      return next;
    });
  }, []);

  const setMerchantRule = useCallback((merchantKey: string, category: CategoryId) => {
    setMerchantRulesState((prev) => {
      const next = { ...prev, [merchantKey]: category };
      saveMerchantRules(next);
      return next;
    });
    // Re-categorize all existing transactions from this merchant
    setTransactions((prev) => {
      const updated = prev.map((tx) =>
        getMerchantKey(tx) === merchantKey ? { ...tx, category } : tx
      );
      if (updated.some((tx, i) => tx.category !== prev[i].category)) {
        saveTransactions(updated);
      }
      return updated;
    });
  }, []);

  // Save merchant rule without re-categorizing existing transactions.
  // Use this after a selective bulk update to avoid overriding user's deselections.
  const registerMerchantRule = useCallback((merchantKey: string, category: CategoryId) => {
    setMerchantRulesState((prev) => {
      const next = { ...prev, [merchantKey]: category };
      saveMerchantRules(next);
      return next;
    });
  }, []);

  // Save a brand-level rule learned from a user correction.
  // Only saved if the brand is specific enough (>= 4 chars) to avoid false matches.
  const setBrandRule = useCallback((brand: string, category: CategoryId) => {
    if (!brand || brand.length < 4) return;
    setBrandRulesState((prev) => {
      const next = { ...prev, [brand]: category };
      saveBrandRules(next);
      return next;
    });
  }, []);

  // Update category for a specific set of transaction IDs only (no merchant rule side-effect).
  const updateTransactionCategories = useCallback((ids: string[], category: CategoryId) => {
    const idSet = new Set(ids);
    setTransactions((prev) => {
      const updated = prev.map((tx) =>
        idSet.has(tx.id) ? { ...tx, category } : tx
      );
      saveTransactions(updated);
      return updated;
    });
  }, []);

  const refreshAssetPrices = useCallback(async () => {
    const current = assets;
    await Promise.all(
      current.map(async (asset) => {
        const updates = await refreshAssetIfStale(asset);
        if (updates) {
          updateAsset(asset.id, updates);
        }
      })
    );
  }, [assets, updateAsset]);

  const addAccount = useCallback((a: Omit<BankAccount, 'id'>, presetId?: string) => {
    setAccounts((prev) => {
      const next = [...prev, { ...a, id: presetId ?? `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
      saveAccounts(next);
      return next;
    });
  }, []);

  const updateAccount = useCallback((id: string, updates: Partial<BankAccount>) => {
    setAccounts((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, ...updates } : a));
      saveAccounts(next);
      return next;
    });
  }, []);

  const deleteAccount = useCallback((id: string) => {
    setAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      saveAccounts(next);
      return next;
    });
  }, []);

  const answerQuestion = useCallback((questionId: string, tag: string) => {
    setInsightProfile((prev) => {
      const next: InsightProfile = {
        ...prev,
        answeredQuestions: {
          ...prev.answeredQuestions,
          [questionId]: { tag, answeredAt: new Date().toISOString() },
        },
      };
      saveInsightProfile(next);
      return next;
    });
  }, []);

  const dismissQuestion = useCallback((questionId: string) => {
    setInsightProfile((prev) => {
      const next: InsightProfile = {
        ...prev,
        dismissedQuestions: {
          ...prev.dismissedQuestions,
          [questionId]: new Date().toISOString(),
        },
      };
      saveInsightProfile(next);
      return next;
    });
  }, []);

  const refreshInsightProfile = useCallback(() => {
    const budgetsForAnalysis: Budget[] = storedBudgets.map((b) => ({ ...b, spent: 0 }));
    const analysis = analyzeSpending(transactions, budgetsForAnalysis);
    if (analysis.totalExpenses < 10) return;
    setInsightProfile((prev) => {
      if (prev.lastProfileUpdate && prev.lastProfileUpdate >= analysis.analysisMonth) return prev;
      const updated = updateProfileAfterMonth(prev, analysis);
      saveInsightProfile(updated);
      return updated;
    });
  }, [transactions, storedBudgets]);

  const enqueueImport = useCallback((
    files: { uri: string; name: string }[],
    parseFn: (uri: string, name: string) => Promise<ParseResult>,
  ) => {
    const newJobs: ImportJob[] = files.map(f => ({
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fileName: f.name,
      uri: f.uri,
      status: 'pending',
    }));
    newJobs.forEach(j => parseJobFnsRef.current.set(j.id, parseFn));
    notificationSentRef.current = false;
    setImportJobs(prev => [...prev, ...newJobs]);
  }, []);

  const clearImportJobs = useCallback(() => {
    parseJobFnsRef.current.clear();
    notificationSentRef.current = false;
    setImportJobs([]);
  }, []);

  // Process all pending import jobs in parallel
  useEffect(() => {
    const pendingJobs = importJobs.filter(j => j.status === 'pending');
    if (pendingJobs.length === 0) return;

    // Mark all pending jobs as processing atomically before launching
    setImportJobs(prev => prev.map(j =>
      j.status === 'pending' ? { ...j, status: 'processing' } : j
    ));

    pendingJobs.forEach(job => {
      const parseFn = parseJobFnsRef.current.get(job.id);
      if (!parseFn) {
        setImportJobs(prev => prev.map(j =>
          j.id === job.id ? { ...j, status: 'error', error: 'Parser non trovato' } : j
        ));
        return;
      }

      parseFn(job.uri, job.fileName)
        .then(result => {
          const warning = result.truncationWarning?.message;
          return addTransactionsAsync(result.transactions as Omit<Transaction, 'id'>[])
            .then(added => ({ added, warning }));
        })
        .then(({ added, warning }) => {
          setImportJobs(prev => prev.map(j =>
            j.id === job.id ? { ...j, status: 'done', addedCount: added, ...(warning ? { warning } : {}) } : j
          ));
        })
        .catch(err => {
          const msg = err instanceof Error ? err.message : String(err);
          setImportJobs(prev => prev.map(j =>
            j.id === job.id ? { ...j, status: 'error', error: msg } : j
          ));
        });
    });
  }, [importJobs, addTransactionsAsync]);

  // Fire notification when all jobs have settled
  useEffect(() => {
    if (importJobs.length === 0) return;
    const allSettled = importJobs.every(j => j.status === 'done' || j.status === 'error');
    if (!allSettled || notificationSentRef.current) return;
    notificationSentRef.current = true;
    const totalAdded = importJobs.reduce((s, j) => s + (j.addedCount ?? 0), 0);
    const errorCount = importJobs.filter(j => j.status === 'error').length;
    sendImportNotification(totalAdded, importJobs.length, errorCount).catch(() => {});
  }, [importJobs]);

  const resetAll = useCallback(async () => {
    await clearAllData();
    transactionsRef.current = [];
    setTransactions([]);
    setStoredBudgets([]);
    setAssets([]);
    setGoals([]);
    setAccounts([]);
    setSubscriptions([]);
    setMerchantRulesState({});
    setBrandRulesState({});
    setInsightProfile(EMPTY_PROFILE);
  }, []);

  return (
    <DataContext.Provider
      value={{
        transactions,
        budgets,
        assets,
        goals,
        accounts,
        subscriptions,
        monthSummary,
        insights,
        insightProfile,
        isLoading,
        addTransaction,
        addTransactions,
        setBudgetLimit,
        addAsset,
        updateAsset,
        addGoal,
        updateGoal,
        deleteGoal,
        addAccount,
        updateAccount,
        deleteAccount,
        addSubscription,
        updateSubscription,
        deleteSubscription,
        merchantRules,
        brandRules,
        setMerchantRule,
        registerMerchantRule,
        setBrandRule,
        updateTransactionCategories,
        refreshAssetPrices,
        answerQuestion,
        dismissQuestion,
        refreshInsightProfile,
        budgetReconciliation,
        resetAll,
        importJobs,
        enqueueImport,
        clearImportJobs,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): AppData {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
