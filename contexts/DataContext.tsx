import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { Transaction, Budget, Asset, Goal, MonthSummary, Insight, StoredBudget, BankAccount, Subscription } from '../types';
import type { CategoryId } from '../constants/categories';
import { CATEGORIES } from '../constants/categories';
import {
  loadTransactions, saveTransactions,
  loadStoredBudgets, saveStoredBudgets,
  loadAssets, saveAssets,
  loadGoals, saveGoals,
  loadAccounts, saveAccounts,
  loadSubscriptions, saveSubscriptions,
  loadInsightProfile, saveInsightProfile,
  clearAllData,
} from '../utils/storage';
import { refreshAssetIfStale } from '../utils/financialApi';
import type { InsightProfile } from '../utils/insightProfile';
import { EMPTY_PROFILE } from '../utils/insightProfile';

const DEFAULT_BUDGET_LIMITS: StoredBudget[] = [
  { id: 'b_food', category: 'food', limit: 400, period: 'monthly' },
  { id: 'b_transport', category: 'transport', limit: 150, period: 'monthly' },
  { id: 'b_shopping', category: 'shopping', limit: 200, period: 'monthly' },
  { id: 'b_entertainment', category: 'entertainment', limit: 80, period: 'monthly' },
  { id: 'b_health', category: 'health', limit: 100, period: 'monthly' },
  { id: 'b_subscriptions', category: 'subscriptions', limit: 50, period: 'monthly' },
  { id: 'b_utilities', category: 'utilities', limit: 250, period: 'monthly' },
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
  addAccount: (a: Omit<BankAccount, 'id'>) => void;
  updateAccount: (id: string, updates: Partial<BankAccount>) => void;
  deleteAccount: (id: string) => void;
  addSubscription: (s: Omit<Subscription, 'id'>) => void;
  updateSubscription: (id: string, updates: Partial<Subscription>) => void;
  deleteSubscription: (id: string) => void;
  refreshAssetPrices: () => Promise<void>;
  answerQuestion: (questionId: string, tag: string) => void;
  dismissQuestion: (questionId: string) => void;
  resetAll: () => Promise<void>;
}

const DataContext = createContext<AppData | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [storedBudgets, setStoredBudgets] = useState<StoredBudget[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [insightProfile, setInsightProfile] = useState<InsightProfile>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      loadTransactions(),
      loadStoredBudgets(),
      loadAssets(),
      loadGoals(),
      loadAccounts(),
      loadSubscriptions(),
      loadInsightProfile(),
    ]).then(([txs, buds, ass, gls, accs, subs, profile]) => {
      setTransactions(txs);
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
      setInsightProfile(profile);
      if (buds.length > 0) {
        setStoredBudgets(buds);
      } else {
        setStoredBudgets(DEFAULT_BUDGET_LIMITS);
        saveStoredBudgets(DEFAULT_BUDGET_LIMITS);
      }
      setIsLoading(false);
    });
  }, []);

  const budgets = useMemo<Budget[]>(() => {
    const prefix = getCurrentMonthPrefix();
    return storedBudgets.map((sb) => ({
      ...sb,
      spent: transactions
        .filter((t) => t.category === sb.category && t.amount < 0 && t.date.startsWith(prefix))
        .reduce((s, t) => s + Math.abs(t.amount), 0),
    }));
  }, [storedBudgets, transactions]);

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

  const addTransactions = useCallback((ts: Omit<Transaction, 'id'>[]): number => {
    let added = 0;
    setTransactions((prev) => {
      const existingKeys = new Set(prev.map((t) => `${t.date}|${t.amount}|${t.description}`));
      const newOnes = ts
        .filter((t) => !existingKeys.has(`${t.date}|${t.amount}|${t.description}`))
        .map((t) => ({
          ...t,
          id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        }));
      added = newOnes.length;
      const next = [...newOnes, ...prev].sort((a, b) => b.date.localeCompare(a.date));
      saveTransactions(next);
      return next;
    });
    return added;
  }, []);

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

  const addAccount = useCallback((a: Omit<BankAccount, 'id'>) => {
    setAccounts((prev) => {
      const next = [...prev, { ...a, id: `acc_${Date.now()}` }];
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

  const resetAll = useCallback(async () => {
    await clearAllData();
    setTransactions([]);
    setStoredBudgets([]);
    setAssets([]);
    setGoals([]);
    setAccounts([]);
    setSubscriptions([]);
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
        refreshAssetPrices,
        answerQuestion,
        dismissQuestion,
        resetAll,
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
