import type { CategoryId } from '../constants/categories';

export interface Transaction {
  id: string;
  date: string; // ISO date string
  amount: number; // negative = expense, positive = income
  description: string;
  category: CategoryId;
  merchant?: string;
  note?: string;
}

export interface Budget {
  id: string;
  category: CategoryId;
  limit: number;
  spent: number;
  period: 'monthly';
}

export interface StoredBudget {
  id: string;
  category: CategoryId;
  limit: number;
  period: 'monthly';
}

export interface Asset {
  id: string;
  name: string;
  ticker: string;
  type: 'etf' | 'stock' | 'crypto' | 'bond' | 'cash';
  quantity: number;
  currentPrice: number;
  purchasePrice: number;
  color: string;
  sparkline: number[]; // last 7 data points
}

export interface Insight {
  id: string;
  type: 'positive' | 'warning' | 'tip' | 'alert';
  title: string;
  body: string;
  action?: string;
  icon: string;
  category?: CategoryId;
}

export interface Goal {
  id: string;
  title: string;
  emoji: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string; // ISO date string
  color: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  dayChange: number;
  dayChangePercent: number;
  totalReturn: number;
  totalReturnPercent: number;
}

export interface MonthSummary {
  netWorth: number;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
}

export interface BankAccount {
  id: string;
  bankId: string;
  bankName: string;
  accountLabel: string;
  balance: number;
  lastUpdated: string;
}

export type OnboardingGoalId =
  | 'risparmio'
  | 'casa'
  | 'pensione'
  | 'emergenza'
  | 'viaggio'
  | 'istruzione';

export type EffortLevel = 'leggero' | 'moderato' | 'intenso';

export type IncomeType = 'salary' | 'freelance' | 'rent' | 'dividends' | 'pension' | 'other';

export interface IncomeSource {
  id: string;
  type: IncomeType;
  label: string;
  amount: number;
  frequency: 'monthly' | 'annual';
}

export interface OnboardingData {
  completed: boolean;
  completedAt?: string;
  monthlyIncome?: number;
  goals?: OnboardingGoalId[];
  incomeSources?: IncomeSource[];
  mainGoal?: OnboardingGoalId;
  effortLevel?: EffortLevel;
}
